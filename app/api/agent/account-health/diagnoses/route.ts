import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  accountInvestigationInputSchema,
  investigateSocialAccount
} from "@/lib/agent/account-investigation";
import { resolveAgentPlan } from "@/lib/agent/entitlements";
import { createAgentModelTurnBilling } from "@/lib/agent/model-turn-billing";
import type { AgentAttachment } from "@/lib/agent/attachments";
import type { AgentToolContext } from "@/lib/agent/types";
import { parseAccountHealthIntake } from "@/lib/account-health-intake";
import { resolveRequestId } from "@/lib/observability";
import { ensurePlanCredits } from "@/lib/payment";
import { getSocialAdapter } from "@/lib/social-adapters";
import {
  getSocialConnectionCredentials,
  listSocialConnectionsWithAccounts
} from "@/lib/social-connections";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { apiError } from "@/lib/i18n";

const attachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(180),
  size: z.number().int().nonnegative().max(25 * 1024 * 1024),
  kind: z.literal("image"),
  mimeType: z.string().min(1).max(120),
  storagePath: z.string().min(1).max(300)
});

const diagnosisRequestSchema = z.object({
  intakeText: z.string().trim().max(12_000).optional(),
  accountUrl: z.string().trim().max(2048).optional(),
  platform: z.enum(["xiaohongshu", "x", "reddit"]).optional(),
  connectedAccountId: z.string().uuid().optional(),
  concern: z.enum(["general", "low_reach", "suspected_restriction", "suspended", "content_removed"]).optional(),
  accountContext: z.string().trim().max(2000).optional(),
  analyticsText: z.string().trim().max(12_000).optional(),
  posts: z.array(z.object({
    url: z.string().trim().url().max(2048).optional(),
    title: z.string().trim().max(160).optional(),
    text: z.string().trim().min(1).max(5000)
  })).max(5).default([]),
  attachments: z.array(attachmentSchema).max(6).default([]),
  locale: z.enum(["zh", "en"]).default("zh")
});

const RATE_LIMIT = { scope: "agent:account-health", limit: 10, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, RATE_LIMIT);
  if (rateLimited) return rateLimited;

  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  try {
    const userId = await getCurrentUserId();
    const body = diagnosisRequestSchema.parse(await request.json());
    const parsedIntake = parseAccountHealthIntake(body.intakeText ?? "");
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: apiError(request.headers, "暂时存不了报告。", "Cannot save the report right now.") }, { status: 503 });
    }

    const plan = await resolveAgentPlan(admin, userId);
    await ensurePlanCredits(userId, plan);

    const connected = body.connectedAccountId
      ? await resolveConnectedXAccount(admin, userId, body.connectedAccountId)
      : null;
    const accountUrl = connected?.accountUrl ?? body.accountUrl ?? parsedIntake.accountUrl;
    const signedAttachments = await resolvePrivateImageAttachments(admin, userId, body.attachments);
    const connectedPosts = connected ? await loadConnectedXPosts(admin, userId, connected.connectionId) : [];
    const intakePosts = parsedIntake.posts;
    const posts = [...body.posts, ...intakePosts, ...connectedPosts]
      .filter((post, index, all) => all.findIndex((candidate) => candidate.text === post.text) === index)
      .slice(0, 5);

    const input = accountInvestigationInputSchema.parse({
      accountUrl,
      platform: connected ? "x" : body.platform ?? parsedIntake.platform,
      concern: body.concern ?? parsedIntake.concern,
      accountContext: body.accountContext,
      analyticsText: body.analyticsText ?? parsedIntake.analyticsText,
      posts,
      imageUrls: signedAttachments.map((attachment) => attachment.url),
      sourceMode: connected ? "oauth" : "manual",
      locale: body.locale
    });

    const modelTurnBilling = createAgentModelTurnBilling({
      userId,
      sessionId: `account-health:${requestId}`,
      plan,
      requestId,
      depth: "low",
      emit: () => undefined
    });
    const ctx: AgentToolContext = {
      userId,
      admin,
      plan,
      agentToolsEnabled: true,
      signal: request.signal,
      modelTurnBilling
    };
    const investigation = await investigateSocialAccount(input, ctx);

    const { error: persistenceError } = await admin.from("account_investigations").insert({
      user_id: userId,
      platform: investigation.platform,
      account_url: investigation.accountUrl,
      concern: input.concern,
      case_state: investigation.report.caseState,
      confidence: investigation.report.confidence,
      evidence_level: investigation.evidenceLevel,
      collection_method: investigation.collectionMethod ?? investigation.publicEvidence.captureMethod,
      evidence_summary: {
        reportId: investigation.reportId,
        reportVersion: investigation.reportVersion,
        publicEvidence: investigation.publicEvidence,
        browserHandoff: investigation.browserHandoff,
        submittedPostCount: posts.length,
        screenshotCount: signedAttachments.length
      },
      report: investigation.report,
      measured_at: investigation.publicEvidence.capturedAt
    });
    if (persistenceError) {
      console.error("[account-health] Failed to persist diagnosis:", JSON.stringify(persistenceError));
    }

    return NextResponse.json({ investigation, snapshotSaved: !persistenceError }, {
      headers: { "X-Request-Id": requestId }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "登录后再体检。", "Please log in first.") }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "体检失败，再试一次。";
    const status = /Credits are unavailable|Out of AI Credits/i.test(message) ? 402 : 400;
    return NextResponse.json({ error: message }, { status, headers: { "X-Request-Id": requestId } });
  }
}

async function resolveConnectedXAccount(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
  accountId: string
) {
  const connections = await listSocialConnectionsWithAccounts(admin, userId);
  const connection = connections.find((item) =>
    item.connectorId === "x"
    && item.status === "connected"
    && item.accounts.some((account) => account.id === accountId)
  );
  const account = connection?.accounts.find((item) => item.id === accountId);
  const handle = account?.handle?.replace(/^@/, "");
  if (!connection || !account || !handle) {
    throw new Error("找不到这个已连接的 X 账号，请重新连接后再试。");
  }
  return { accountUrl: `https://x.com/${handle}`, connectionId: connection.id };
}

async function loadConnectedXPosts(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
  connectionId: string
) {
  try {
    const credentials = await getSocialConnectionCredentials(admin, userId, "x", connectionId);
    if (!credentials) return [];
    const result = await getSocialAdapter("x").listOwnedPosts(credentials);
    if (result.kind !== "ok") return [];
    return result.value
      .filter((post) => post.text?.trim())
      .slice(0, 5)
      .map((post) => ({
        url: post.url ?? undefined,
        text: post.text!.slice(0, 5000)
      }));
  } catch {
    // A stale or temporarily unavailable X read must not block the upload-first path.
    return [];
  }
}

async function resolvePrivateImageAttachments(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
  attachments: Array<z.infer<typeof attachmentSchema>>
): Promise<Array<AgentAttachment & { url: string }>> {
  return Promise.all(attachments.map(async (attachment) => {
    if (!attachment.storagePath.startsWith(`${userId}/`)) {
      throw new Error("有一张截图不属于当前账号。");
    }
    const { data, error } = await admin.storage
      .from("agent-attachments")
      .createSignedUrl(attachment.storagePath, 60 * 60);
    if (error || !data?.signedUrl) throw new Error("有一张截图已失效，请重新上传。");
    return { ...attachment, url: data.signedUrl };
  }));
}
