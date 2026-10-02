import { NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceMonthlyBusinessMissionLimit,
  resolveBusinessMissionPlan
} from "@/lib/business-mission-entitlements";
import { buildOpportunityWorkbenchIdea, growthMissionMetricForObjective } from "@/lib/growth-audit";
import { captureServerEvent } from "@/lib/posthog-server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const requestSchema = z.object({
  auditId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  locale: z.enum(["zh", "en"]).default("zh")
});

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = requestSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Growth Missions require durable storage." }, { status: 503 });

    const { data: opportunity, error: opportunityError } = await admin
      .from("growth_opportunities")
      .select("id, audit_id, status, title, evidence, rationale, mission_brief, recommended_platform, objective_type, confidence, mission_id")
      .eq("id", input.opportunityId)
      .eq("audit_id", input.auditId)
      .eq("user_id", userId)
      .maybeSingle();
    if (opportunityError) throw opportunityError;
    if (!opportunity) return NextResponse.json({ error: "Growth opportunity not found." }, { status: 404 });

    const { data: audit, error: auditError } = await admin
      .from("growth_audits")
      .select("id, source_url, business_snapshot")
      .eq("id", input.auditId)
      .eq("user_id", userId)
      .maybeSingle();
    if (auditError) throw auditError;
    if (!audit) return NextResponse.json({ error: "Growth Audit not found." }, { status: 404 });

    if (opportunity.mission_id) {
      return NextResponse.json({
        missionId: opportunity.mission_id,
        existing: true,
        missionHref: `/operations/missions/${encodeURIComponent(opportunity.mission_id)}`,
        workbenchHref: `/workbench?missionId=${encodeURIComponent(opportunity.mission_id)}`
      });
    }

    const { data: activeMission, error: activeError } = await admin
      .from("growth_missions")
      .select("id, workbench_idea, platform")
      .eq("user_id", userId)
      .eq("mission_kind", "growth_opportunity")
      .in("status", ["accepted", "draft_ready", "posted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeError) throw activeError;
    if (activeMission) {
      return NextResponse.json({
        error: input.locale === "en"
          ? "Finish or close the active mission before starting another one."
          : "先完成或关闭当前增长任务，再启动下一个。",
        activeMissionId: activeMission.id,
        missionHref: `/operations/missions/${encodeURIComponent(activeMission.id)}`,
        workbenchHref: `/workbench?idea=${encodeURIComponent(activeMission.workbench_idea)}&platform=${encodeURIComponent(activeMission.platform)}&missionId=${encodeURIComponent(activeMission.id)}`
      }, { status: 409 });
    }

    const plan = await resolveBusinessMissionPlan(admin, userId);
    const missionLimitError = await enforceMonthlyBusinessMissionLimit(admin, userId, plan, input.locale);
    if (missionLimitError) return NextResponse.json({ error: missionLimitError }, { status: 429 });

    const business = (audit.business_snapshot ?? {}) as { name?: string; offer?: string; audience?: string };
    const objective = opportunity.objective_type as "leads" | "signups" | "purchases";
    const metric = growthMissionMetricForObjective(objective);
    const platform = opportunity.recommended_platform as "xiaohongshu" | "linkedin" | "wechat";
    const workbenchIdea = buildOpportunityWorkbenchIdea({
      business: {
        name: business.name ?? "",
        offer: business.offer ?? "",
        audience: business.audience ?? ""
      },
      opportunity: {
        title: opportunity.title,
        evidence: opportunity.evidence,
        rationale: opportunity.rationale,
        missionBrief: opportunity.mission_brief,
        recommendedPlatform: platform,
        confidence: opportunity.confidence as "high" | "medium" | "low"
      },
      objective,
      sourceUrl: audit.source_url,
      locale: input.locale
    });

    const missionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error: missionError } = await admin.from("growth_missions").insert({
      id: missionId,
      user_id: userId,
      platform,
      status: "accepted",
      stage: "conversion",
      title: opportunity.title,
      hypothesis: opportunity.rationale,
      primary_metric: input.locale === "en" ? metric.en : metric.zh,
      primary_metric_key: metric.key,
      baseline_value: 0,
      target_value: 1,
      variants: [{
        name: input.locale === "en" ? "Primary mission" : "主任务",
        angle: opportunity.mission_brief,
        hookInstruction: input.locale === "en" ? "Lead with the observed customer tension." : "从页面中已经观察到的客户问题切入。",
        format: input.locale === "en" ? "One focused conversion asset" : "一份聚焦转化的内容资产"
      }],
      workbench_idea: workbenchIdea,
      source_briefing: {
        auditId: audit.id,
        opportunityId: opportunity.id,
        sourceUrl: audit.source_url,
        evidence: opportunity.evidence,
        confidence: opportunity.confidence
      },
      mission_kind: "growth_opportunity",
      objective_type: objective,
      execution_state: "planned",
      source_opportunity_id: opportunity.id,
      created_at: now,
      updated_at: now
    });
    if (missionError) throw missionError;

    await Promise.all([
      admin.from("growth_opportunities").update({ status: "accepted", mission_id: missionId, updated_at: now }).eq("id", opportunity.id).eq("user_id", userId),
      upsertOperatingProgram(admin, userId, platform, business, objective, input.locale, now)
    ]).then((results) => {
      for (const result of results) {
        if ("error" in result && result.error) console.error("[growth-audit/mission] secondary persistence failed", result.error);
      }
    });

    await captureServerEvent(userId, "growth_mission_started", {
      mission_id: missionId,
      audit_id: audit.id,
      opportunity_id: opportunity.id,
      objective,
      platform,
      plan
    });
    return NextResponse.json({
      missionId,
      existing: false,
      missionHref: `/operations/missions/${encodeURIComponent(missionId)}`,
      workbenchHref: `/workbench?idea=${encodeURIComponent(workbenchIdea)}&platform=${encodeURIComponent(platform)}&missionId=${encodeURIComponent(missionId)}`
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to start a Growth Mission." }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid Growth Mission request." }, { status: 400 });
    }
    console.error("[growth-audit/mission] failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start the Growth Mission." }, { status: 400 });
  }
}
async function upsertOperatingProgram(
  admin: AdminClient,
  userId: string,
  platform: "xiaohongshu" | "linkedin" | "wechat",
  business: { name?: string; offer?: string; audience?: string },
  objective: "leads" | "signups" | "purchases",
  locale: "zh" | "en",
  now: string
) {
  const action = objective === "leads" ? "lead_form" : objective === "signups" ? "other" : "purchase";
  return admin.from("operating_programs").upsert({
    user_id: userId,
    platform,
    status: "draft",
    offer: { name: business.name ?? "", summary: business.offer ?? "", priceRange: "", serviceArea: "" },
    audience: { description: business.audience ?? "", primaryNeed: business.audience ?? "", purchaseBarriers: [] },
    objective: {
      monthlyGoal: locale === "en" ? `Create at least one measurable ${objective} outcome.` : `获得至少 1 个可追踪的${objective === "leads" ? "合格线索" : objective === "signups" ? "注册" : "购买"}结果。`,
      conversionAction: action
    },
    qualified_lead_rule: {
      template: "small_brand",
      requiresContact: true,
      requiresExplicitNeed: true,
      matchConditions: locale === "en" ? ["Matches the target offer", "Shows explicit intent"] : ["与目标产品匹配", "表达明确意向"],
      customNotes: ""
    },
    watchlist: { competitors: [], keywords: [] },
    cadence_per_week: 2,
    baseline: { publishedPosts: 0, qualifiedLeads: 0, wonRevenue: 0 },
    updated_at: now
  }, { onConflict: "user_id,platform" });
}
