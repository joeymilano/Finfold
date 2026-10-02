import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { buildGrowthAuditPrompt } from "@/lib/external-content-prompts";
import {
  growthAuditModelResultSchema,
  growthAuditRequestSchema,
  parseGrowthAuditModelResult,
  type GrowthAudit,
  type GrowthAuditObjective,
  type GrowthOpportunity
} from "@/lib/growth-audit";
import { stripHtmlToText } from "@/lib/html-strip";
import { sendUntrustedContentPrompt } from "@/lib/llm";
import { ACTION_CREDITS, ensurePlanCredits, type PlanId } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { getActiveSubscription, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { captureServerEvent } from "@/lib/posthog-server";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import {
  HTML_CONTENT_TYPES,
  normalizeExternalHttpUrl,
  readTextWithLimit,
  safeExternalFetch,
  validateExternalHttpUrl
} from "@/lib/safe-url";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { hashGenerationRequest, resolveGenerationRequestId } from "@/lib/generation-runs";
import { apiError } from "@/lib/i18n";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type AuditRow = {
  id: string;
  source_url: string;
  objective_type: GrowthAuditObjective;
  summary: string;
  business_snapshot: unknown;
  signals: unknown;
  created_at: string;
};

type OpportunityRow = {
  id: string;
  rank: number;
  status: GrowthOpportunity["status"];
  title: string;
  evidence: string;
  rationale: string;
  mission_brief: string;
  recommended_platform: GrowthOpportunity["recommendedPlatform"];
  objective_type: GrowthAuditObjective;
  confidence: GrowthOpportunity["confidence"];
  mission_id: string | null;
};

const AUDIT_FIELDS = "id, source_url, objective_type, summary, business_snapshot, signals, created_at";
const OPPORTUNITY_FIELDS = "id, rank, status, title, evidence, rationale, mission_brief, recommended_platform, objective_type, confidence, mission_id";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) return NextResponse.json({ audit: null, persisted: false });
      return NextResponse.json({ error: persistenceUnavailableMessage("Growth Audit") }, { status: 503 });
    }

    const { data, error } = await admin
      .from("growth_audits")
      .select(AUDIT_FIELDS)
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ audit: null, persisted: true });

    return NextResponse.json({ audit: await loadAudit(admin, userId, data as unknown as AuditRow), persisted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to view Growth Audits." }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load the Growth Audit." }, { status: 400 });
  }
}
export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, { scope: "growth-audit", limit: 6, windowMs: 60 * 60 * 1_000 });
  if (rateLimited) return rateLimited;

  let billing: ReturnType<typeof createAiUsageBilling> | null = null;
  let resultReady = false;
  try {
    const userId = await getCurrentUserId();
    const input = growthAuditRequestSchema.parse(await request.json());
    const sourceUrl = normalizeExternalHttpUrl(input.url);
    validateExternalHttpUrl(sourceUrl);

    const admin = createSupabaseAdminClient();
    if (!admin && !isLocalMockMode()) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Growth Audit") }, { status: 503 });
    }

    if (admin) {
      const cached = await findRecentAudit(admin, userId, sourceUrl, input.objective);
      if (cached) return NextResponse.json({ audit: cached, cached: true, creditsCharged: 0 });
    }

    let pageHtml: string;
    try {
      const pageResponse = await safeExternalFetch(sourceUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
          "User-Agent": "Mozilla/5.0 (compatible; FinfoldGrowthAudit/1.0)"
        }
      }, {
        allowedContentTypes: HTML_CONTENT_TYPES,
        timeoutMs: 10_000,
        auditPurpose: "commercial_growth_audit"
      });
      if (!pageResponse.ok) throw new Error(`Fetch failed: ${pageResponse.status}`);
      pageHtml = await readTextWithLimit(pageResponse, 2 * 1024 * 1024);
    } catch (fetchError) {
      console.error("[growth-audit] source fetch failed:", fetchError);
      return NextResponse.json({
        error: apiError(request.headers, "无法访问该网址。请确认它可以公开访问后重试。", "Could not fetch that public URL.")
      }, { status: 422 });
    }

    const pageText = stripHtmlToText(pageHtml);
    if (pageText.length < 120) {
      return NextResponse.json({
        error: apiError(request.headers, "页面信息太少，暂时无法形成有证据的增长机会。", "The page has too little evidence for a growth audit.")
      }, { status: 422 });
    }

    let effectivePlan: PlanId | "free" = "free";
    if (admin) {
      effectivePlan = await resolvePlan(admin, userId);
      const limitError = await enforceMonthlyAuditLimit(admin, userId, effectivePlan);
      if (limitError) return NextResponse.json({ error: limitError }, { status: 429 });
      await ensurePlanCredits(userId, effectivePlan);

      const requestId = resolveGenerationRequestId(request.headers.get("Idempotency-Key"));
      billing = createAiUsageBilling({
        operationKey: `growth-audit:${userId}:${requestId}`,
        userId,
        action: "brandVoiceAnalysis",
        cost: ACTION_CREDITS.brandVoiceAnalysis,
        source: "growth_audit",
        detail: {
          requestId,
          objective: input.objective,
          inputFingerprint: await hashGenerationRequest({ sourceUrl, objective: input.objective })
        }
      });
      const reservation = await billing.reserveAndStart();
      if (reservation.outcome === "insufficient_credits") {
        return NextResponse.json({ error: apiError(request.headers, "当前创作点数不足，无法开始网站增长审查。", "Not enough Credits to start a growth audit.") }, { status: 402 });
      }
      if (reservation.outcome === "existing") {
        return NextResponse.json({ error: apiError(request.headers, "这次网站审查正在处理中，请稍后再试。", "A growth audit is already running for this site. Please try again later.") }, { status: 409 });
      }
    }

    const locale = inferAuditLocale(pageText, request);
    const raw = await sendUntrustedContentPrompt(
      buildGrowthAuditPrompt(pageText, sourceUrl, input.objective, locale)
    );
    const modelResult = parseGrowthAuditModelResult(raw);
    const audit = admin
      ? await persistAudit(admin, userId, sourceUrl, input.objective, modelResult)
      : buildUnpersistedAudit(sourceUrl, input.objective, modelResult);

    resultReady = true;
    if (billing) await billing.settle();
    await captureServerEvent(userId, "growth_audit_completed", {
      audit_id: audit.id,
      objective: input.objective,
      plan: effectivePlan,
      cached: false
    });
    return NextResponse.json({ audit, cached: false, creditsCharged: billing ? ACTION_CREDITS.brandVoiceAnalysis : 0 });
  } catch (error) {
    if (billing && !resultReady) await billing.refund("growth_audit_failed").catch(() => undefined);
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to run a Growth Audit." }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: apiError(request.headers, "请输入有效的网址并选择一个增长结果。", "Enter a valid website URL and pick a growth outcome.") }, { status: 400 });
    }
    console.error("[growth-audit] failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Growth Audit failed." }, { status: 400 });
  }
}

async function resolvePlan(admin: AdminClient, userId: string): Promise<PlanId | "free"> {
  const [{ data: profile }, { data: subscriptions }] = await Promise.all([
    admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    admin.from("subscriptions").select("status, current_period_end").eq("user_id", userId).eq("payment_provider", "creem").order("updated_at", { ascending: false })
  ]);
  const active = getActiveSubscription((subscriptions ?? []).map((subscription) => ({
    status: String(subscription.status ?? ""),
    currentPeriodEnd: subscription.current_period_end
  })));
  return resolveEffectivePlan(profile?.plan, active);
}

async function enforceMonthlyAuditLimit(admin: AdminClient, userId: string, plan: PlanId | "free"): Promise<string | null> {
  const cap = plan === "free" ? 1
    : plan === "starter" || plan === "starter_v2" ? 2
      : plan === "pro" || plan === "creator_v2" ? 5
        : plan === "growth" || plan === "growth_v2" ? 10
          : 30;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { count, error } = await admin
    .from("growth_audits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", monthStart);
  if (error) throw error;
  if ((count ?? 0) < cap) return null;
  return plan === "free"
    ? "免费版本月的网站增长审查已使用。升级 Starter 可继续启动增长任务。"
    : `本月最多可运行 ${cap} 次网站增长审查。`;
}

async function findRecentAudit(
  admin: AdminClient,
  userId: string,
  sourceUrl: string,
  objective: GrowthAuditObjective
): Promise<GrowthAudit | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
  const { data, error } = await admin
    .from("growth_audits")
    .select(AUDIT_FIELDS)
    .eq("user_id", userId)
    .eq("source_url", sourceUrl)
    .eq("objective_type", objective)
    .eq("status", "completed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? loadAudit(admin, userId, data as unknown as AuditRow) : null;
}

async function loadAudit(admin: AdminClient, userId: string, row: AuditRow): Promise<GrowthAudit> {
  const { data, error } = await admin
    .from("growth_opportunities")
    .select(OPPORTUNITY_FIELDS)
    .eq("audit_id", row.id)
    .eq("user_id", userId)
    .order("rank", { ascending: true });
  if (error) throw error;
  const parsedBase = growthAuditModelResultSchema.pick({ business: true, signals: true }).parse({
    business: row.business_snapshot,
    signals: row.signals
  });
  return {
    id: row.id,
    sourceUrl: row.source_url,
    objective: row.objective_type,
    summary: row.summary,
    business: parsedBase.business,
    signals: parsedBase.signals,
    opportunities: ((data ?? []) as unknown as OpportunityRow[]).map(mapOpportunity),
    createdAt: row.created_at
  };
}

function mapOpportunity(row: OpportunityRow): GrowthOpportunity {
  return {
    id: row.id,
    rank: row.rank,
    status: row.status,
    title: row.title,
    evidence: row.evidence,
    rationale: row.rationale,
    missionBrief: row.mission_brief,
    recommendedPlatform: row.recommended_platform,
    objective: row.objective_type,
    confidence: row.confidence,
    missionId: row.mission_id
  };
}

async function persistAudit(
  admin: AdminClient,
  userId: string,
  sourceUrl: string,
  objective: GrowthAuditObjective,
  result: z.infer<typeof growthAuditModelResultSchema>
): Promise<GrowthAudit> {
  const auditId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const opportunities: GrowthOpportunity[] = result.opportunities.map((opportunity, index) => ({
    ...opportunity,
    id: crypto.randomUUID(),
    rank: index + 1,
    status: "proposed",
    objective,
    missionId: null
  }));
  const { error: auditError } = await admin.from("growth_audits").insert({
    id: auditId,
    user_id: userId,
    source_url: sourceUrl,
    objective_type: objective,
    summary: result.summary,
    business_snapshot: result.business,
    signals: result.signals,
    status: "completed",
    created_at: createdAt,
    updated_at: createdAt
  });
  if (auditError) throw auditError;

  const { error: opportunitiesError } = await admin.from("growth_opportunities").insert(
    opportunities.map((opportunity) => ({
      id: opportunity.id,
      audit_id: auditId,
      user_id: userId,
      status: opportunity.status,
      rank: opportunity.rank,
      title: opportunity.title,
      evidence: opportunity.evidence,
      rationale: opportunity.rationale,
      mission_brief: opportunity.missionBrief,
      recommended_platform: opportunity.recommendedPlatform,
      objective_type: objective,
      confidence: opportunity.confidence,
      created_at: createdAt,
      updated_at: createdAt
    }))
  );
  if (opportunitiesError) {
    await admin.from("growth_audits").delete().eq("id", auditId).eq("user_id", userId);
    throw opportunitiesError;
  }
  return { ...result, id: auditId, sourceUrl, objective, opportunities, createdAt };
}

function buildUnpersistedAudit(
  sourceUrl: string,
  objective: GrowthAuditObjective,
  result: z.infer<typeof growthAuditModelResultSchema>
): GrowthAudit {
  return {
    ...result,
    id: crypto.randomUUID(),
    sourceUrl,
    objective,
    createdAt: new Date().toISOString(),
    opportunities: result.opportunities.map((opportunity, index) => ({
      ...opportunity,
      id: crypto.randomUUID(),
      rank: index + 1,
      status: "proposed",
      objective,
      missionId: null
    }))
  };
}

function inferAuditLocale(pageText: string, request: Request): "zh" | "en" {
  const explicit = request.headers.get("x-finfold-locale");
  if (explicit === "en" || explicit === "zh") return explicit;
  const sample = pageText.slice(0, 4_000);
  const chineseCharacters = (sample.match(/[\u3400-\u9fff]/g) ?? []).length;
  return chineseCharacters > 40 ? "zh" : "en";
}
