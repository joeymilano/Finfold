
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { getPlanFeatures } from "@/lib/payment/entitlements";
import { ensurePlanCredits } from "@/lib/payment";
import { encodeSSE, SSE_HEADERS } from "@/lib/sse";
import { buildAgentSystemPrompt } from "@/lib/agent/context";
import { runAgentLoop, type AgentChatMessage } from "@/lib/agent/loop";
import type { AgentToolContext } from "@/lib/agent/types";
import { hasDirectLLM } from "@/lib/llm";
import { isLettaConfigured, getSharedLettaAgentId, sendLettaMessage } from "@/lib/letta";
import { historyRowsToReplayMessages } from "@/lib/agent/history-replay";
import { resolveAgentPlan } from "@/lib/agent/entitlements";
import { resolveAgentPageContext } from "@/lib/agent/presentation";
import { apiError } from "@/lib/i18n";
import { resolvePrivateAttachmentEvidence } from "@/lib/agent/attachment-content";
import { buildUserMessageWithEvidence } from "@/lib/agent/session-context";
import {
  appendCurrentPublicWebEvidence,
  readCurrentTurnPublicWeb
} from "@/lib/agent/public-web-context";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { logInfo, logWarn, resolveRequestId } from "@/lib/observability";
import { createAgentModelTurnBilling } from "@/lib/agent/model-turn-billing";
import { normalizeAgentDepth } from "@/lib/agent/depth";
import type { AgentStatusStage } from "@/lib/agent/status";
import type { AgentChatOutcome } from "@/lib/agent/chat-outcome";
import { createAgentWorkRecord, type AgentWorkRecord } from "@/lib/agent/work-record";
import { createCollaborationTracker } from "@/lib/agent/subagents";
import { captureServerEvent } from "@/lib/posthog-server";

const attachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(180),
  size: z.number().int().nonnegative().max(25 * 1024 * 1024),
  kind: z.enum(["image", "video", "pdf", "document", "data"]),
  mimeType: z.string().min(1).max(120),
  storagePath: z.string().min(1).max(300)
});

const chatRequestSchema = z.object({
  sessionId: z.string().uuid().nullish(),
  workflowId: z.string().uuid().nullish(),
  dataImportIds: z.array(z.string().uuid()).max(6).optional(),
  message: z.string().min(1).max(4000),
  imageUrls: z.array(z.string().url()).max(6).optional(),
  attachments: z.array(attachmentSchema).max(6).optional(),
  pageContext: z.object({
    pathname: z.string().min(1).max(240)
  }).optional(),
  depth: z.enum(["low", "medium", "high"]).optional()
});

const HISTORY_LIMIT = 24;
const AGENT_CHAT_RATE_LIMIT = { scope: "agent:chat", limit: 30, windowMs: 60_000 };

async function getOrCreateSession(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
  sessionId: string | undefined,
  firstMessage: string
): Promise<string> {
  if (sessionId) {
    const { data } = await admin.from("agent_sessions").select("id").eq("id", sessionId).eq("user_id", userId).maybeSingle();
    if (data) return data.id as string;
  }

  const { data, error } = await admin
    .from("agent_sessions")
    .insert({ user_id: userId, title: firstMessage.slice(0, 40) })
    .select("id")
    .single();
  if (error || !data) throw new Error("Failed to create agent session.");
  return data.id as string;
}

async function loadHistory(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  sessionId: string
): Promise<AgentChatMessage[]> {
  const { data } = await admin
    .from("agent_messages")
    .select("id, role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  // Condensed replay keeps long sessions inside the model context window:
  // only the newest tool runs come back verbatim (lib/agent/history-replay).
  return historyRowsToReplayMessages([...(data ?? [])].reverse());
}

export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, AGENT_CHAT_RATE_LIMIT);
  if (rateLimited) return rateLimited;

  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const startedAt = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const workStages: AgentStatusStage[] = [];
      let usageSummary: { credits: number; steps: number; refunded: number; available: number } | null = null;

      function emit(event: string, data: unknown) {
        if (request.signal.aborted) return;
        if (event === "usage") {
          // Mirror the client-side accumulation so the persisted work record
          // can restore the per-run credits hint after a reload.
          const usageEvent = data as { credits?: number; refunded?: number; available?: number };
          const credits = typeof usageEvent.credits === "number" ? usageEvent.credits : 0;
          const refunded = typeof usageEvent.refunded === "number" ? usageEvent.refunded : 0;
          usageSummary = {
            credits: Math.max(0, (usageSummary?.credits ?? 0) + credits - refunded),
            steps: (usageSummary?.steps ?? 0) + (credits > 0 ? 1 : 0),
            refunded: (usageSummary?.refunded ?? 0) + refunded,
            available: typeof usageEvent.available === "number" ? usageEvent.available : usageSummary?.available ?? -1
          };
        }
        controller.enqueue(encodeSSE(event, data));
      }

      function workRecordUsage() {
        if (!usageSummary || (usageSummary.steps === 0 && usageSummary.refunded === 0)) return undefined;
        return usageSummary;
      }

      function emitStatus(stage: AgentStatusStage) {
        if (!workStages.includes(stage)) workStages.push(stage);
        emit("status", { stage });
      }

      try {
        const userId = await getCurrentUserId();
        const body = chatRequestSchema.parse(await request.json());
        emitStatus("understanding_request");

        const admin = createSupabaseAdminClient();
        if (!admin) {
          emit("error", { error: "Agent chat requires Supabase to be configured." });
          controller.close();
          return;
        }

        emitStatus("connecting_workspace");
        const [plan, sessionId] = await Promise.all([
          resolveAgentPlan(admin, userId),
          getOrCreateSession(admin, userId, body.sessionId ?? undefined, body.message)
        ]);
        emit("session", { sessionId });
        emitStatus("preparing_context");

        await ensurePlanCredits(userId, plan);
        const modelTurnBilling = createAgentModelTurnBilling({
          userId,
          sessionId,
          plan,
          requestId,
          depth: normalizeAgentDepth(body.depth),
          emit
        });

        const attachmentEvidence = await resolvePrivateAttachmentEvidence(
          admin,
          userId,
          body.attachments ?? []
        );
        const attachments = attachmentEvidence.attachments;

        // Subagent collaboration: SSE events + the persisted Work Record block
        // are fed from one tracker so they can never drift apart.
        const collaborationTracker = createCollaborationTracker({
          isCancelled: () => request.signal.aborted
        });
        // Analytics keep only counts, kinds, durations and plan — never user
        // content, prompts, labels, or provider details.
        const subagentTaskKinds = new Map<string, string>();

        const ctx: AgentToolContext = {
          userId,
          sessionId,
          workflowId: body.workflowId ?? undefined,
          dataImportIds: body.dataImportIds,
          admin,
          plan,
          depth: normalizeAgentDepth(body.depth),
          agentToolsEnabled: getPlanFeatures(plan).agentTools,
          signal: request.signal,
          modelTurnBilling,
          delegation: {},
          onSubagentEvent: (event) => {
            collaborationTracker.onEvent(event);
            emit(event.type, event);
            if (event.type === "subagent_task_started") {
              subagentTaskKinds.set(`${event.groupId}:${event.taskId}`, event.kind);
            } else if (event.type === "subagent_group_started") {
              void captureServerEvent(userId, "agent_parallel_run_started", {
                taskCount: event.taskCount,
                plan,
                ...(body.pageContext?.pathname ? { pagePathname: body.pageContext.pathname } : {})
              });
            } else if (event.type === "subagent_task_completed") {
              void captureServerEvent(userId, "agent_subagent_task_completed", {
                kind: subagentTaskKinds.get(`${event.groupId}:${event.taskId}`) ?? "unknown",
                durationMs: event.durationMs,
                evidenceCount: event.evidenceCount,
                plan
              });
            } else if (event.type === "subagent_group_completed") {
              void captureServerEvent(userId, "agent_parallel_run_completed", {
                completed: event.completed,
                failed: event.failed,
                durationMs: event.durationMs,
                cancelled: request.signal.aborted,
                plan
              });
            }
          }
        };

        const history = await loadHistory(admin, sessionId);
        const baseSystemPrompt = await buildAgentSystemPrompt(ctx);
        const pageContext = body.pageContext
          ? resolveAgentPageContext(body.pageContext.pathname)
          : null;
        const systemPrompt = pageContext
          ? `${baseSystemPrompt}\n\nCURRENT FINFOLD UI CONTEXT\n${pageContext.prompt}\nThis context only describes the visible product surface. Do not assume unsaved form values or claim to have read anything the user did not provide.`
          : baseSystemPrompt;

        const imageUrls = [
          ...(body.imageUrls ?? []),
          ...attachments.filter((attachment) => attachment.kind === "image" && attachment.url).map((attachment) => attachment.url!)
        ].slice(0, 6);
        const videoUrls = attachments
          .filter((attachment) => attachment.kind === "video" && attachment.url)
          .map((attachment) => attachment.url!)
          .slice(0, 6);
        const visualReferenceNote = (body.imageUrls?.length ?? 0) > 0
          ? `\n\n[CURRENT USER EVIDENCE]\n- ${body.imageUrls!.length} direct image reference(s) are attached to this model turn.`
          : "";
        const messageWithAttachments = buildUserMessageWithEvidence(
          `${body.message}${visualReferenceNote}${attachmentEvidence.context ? `\n\n${attachmentEvidence.context}` : ""}`,
          {
            dataImportIds: body.dataImportIds,
            attachments: body.attachments
          },
          "current"
        );
        const publicWebContext = await readCurrentTurnPublicWeb(body.message);
        const messageWithPublicWeb = appendCurrentPublicWebEvidence(
          messageWithAttachments,
          publicWebContext
        );
        // Current-turn images keep the existing explicit vision contract. A
        // later turn receives only attachment IDs/names plus any stored tool
        // result; private signed URLs are never replayed automatically.
        const userContent = imageUrls.length > 0 || videoUrls.length > 0
          ? [
              { type: "text" as const, text: messageWithPublicWeb },
              ...imageUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
              ...videoUrls.map((url) => ({ type: "video_url" as const, video_url: { url } }))
            ]
          : messageWithPublicWeb;

        const messages: AgentChatMessage[] = [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: userContent }
        ];

        await admin.from("agent_messages").insert({
          session_id: sessionId,
          user_id: userId,
          role: "user",
          content: {
            text: body.message,
            imageUrls: body.imageUrls ?? [],
            dataImportIds: body.dataImportIds ?? [],
            attachments: body.attachments ?? []
          }
        });
        emitStatus("choosing_capabilities");

        // ── Letta fallback ──
        // No direct OpenAI-compatible LLM is configured (LLM_API_KEY unset), but
        // Letta is (LETTA_API_KEY — the same key the workbench uses). Fall back
        // to the shared Letta agent so the AI assistant stays usable, matching
        // the pre-bae4eb1 behaviour. Tool-calling (diagnose xiaohongshu, etc.)
        // requires a direct LLM and only runs on the direct path below.
        if (!hasDirectLLM() && isLettaConfigured() && videoUrls.length === 0) {
          if (request.signal.aborted) return;
          let lettaText = "";
          try {
            const sharedAgentId = await getSharedLettaAgentId();
            if (sharedAgentId) {
              if (!(await modelTurnBilling.reserve())) {
                emitInsufficientCredits(emit, request.headers);
                return;
              }
              if (request.signal.aborted) {
                await modelTurnBilling.refundFailedTurn();
                return;
              }
              const result = await sendLettaMessage(
                sharedAgentId,
                pageContext
                  ? `${messageWithPublicWeb}\n\n[Current Finfold surface: ${pageContext.prompt}]`
                  : messageWithPublicWeb,
                undefined,
                imageUrls.length > 0 ? imageUrls : undefined
              );
              lettaText = result.assistantMessage ?? "";
              if (lettaText) {
                await modelTurnBilling.confirmSuccessfulTurn();
              } else {
                await modelTurnBilling.refundFailedTurn();
              }
            }
          } catch {
            await modelTurnBilling.refundFailedTurn();
            /* Letta failed — fall through to runAgentLoop, which surfaces the
               "not configured" error so the failure stays debuggable. */
          }
          if (request.signal.aborted) return;
          if (lettaText) {
            emitStatus("composing_response");
            emit("text", { text: lettaText });
            const work = createAgentWorkRecord({
              stages: workStages,
              outcome: "completed",
              startedAtMs: startedAt,
              usage: workRecordUsage()
            });
            await admin.from("agent_messages").insert({
              session_id: sessionId,
              user_id: userId,
              role: "assistant",
              content: { text: lettaText, toolCalls: [], toolResults: [], work }
            });
            await admin.from("agent_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);
            logInfo("agent_chat_finished", { requestId, userId }, {
              outcome: "completed",
              textLength: lettaText.length,
              toolCount: 0,
              durationMs: Date.now() - startedAt
            });
            emit("done", { sessionId, text: lettaText, toolCalls: [], toolResults: [], outcome: "completed", work });
            return;
          }
        }

        let finalText = "";
        let terminalError: { error: string; code?: string } | null = null;
        const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
        const toolResults: Array<{ name: string; result: unknown }> = [];
        let terminalOutcome: AgentChatOutcome | null = null;

        for await (const event of runAgentLoop(messages, ctx)) {
          if (event.type === "text") {
            finalText += event.text;
            emitStatus("composing_response");
            emit("text", { text: event.text });
          } else if (event.type === "tool_call") {
            toolCalls.push({ name: event.name, args: event.args });
            emit("tool_call", { name: event.name, args: event.args });
          } else if (event.type === "tool_result") {
            toolResults.push({ name: event.name, result: event.result });
            emit("tool_result", { name: event.name, result: event.result });
            emitStatus("reviewing_results");
          } else if (event.type === "evidence") {
            emit("evidence", { evidence: event.evidence });
          } else if (event.type === "error") {
            terminalOutcome = "failed";
            terminalError = { error: event.error, ...(event.code ? { code: event.code } : {}) };
            emit("error", { error: event.error, ...(event.code ? { code: event.code } : {}) });
          } else if (event.type === "done") {
            terminalOutcome = event.outcome;
          }
        }

        if (request.signal.aborted) return;

        const outcome = terminalOutcome
          ?? (finalText || toolResults.length > 0 ? "completed" : "failed");
        const collaborationGroups = collaborationTracker.groups();
        const work = createAgentWorkRecord({
          stages: workStages,
          outcome,
          startedAtMs: startedAt,
          ...(collaborationGroups.length > 0 ? { collaboration: { groups: collaborationGroups } } : {}),
          usage: workRecordUsage()
        });

        await admin.from("agent_messages").insert({
          session_id: sessionId,
          user_id: userId,
          role: "assistant",
          content: {
            text: finalText,
            ...(terminalError ? {
              error: terminalError.error,
              errorCode: terminalError.code
            } : {}),
            toolCalls,
            toolResults,
            work
          }
        });

        await admin.from("agent_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);

        const log = outcome === "failed" ? logWarn : logInfo;
        log("agent_chat_finished", { requestId, userId }, {
          outcome,
          textLength: finalText.length,
          toolCount: toolCalls.length,
          durationMs: Date.now() - startedAt
        });
        emit("done", { sessionId, text: finalText, toolCalls, toolResults, outcome, work });
      } catch (error) {
        logWarn("agent_chat_failed", { requestId }, {
          errorType: error instanceof Error ? error.name : "UnknownError",
          // Raw detail goes to logs only — never to the chat UI.
          errorMessage: (error instanceof Error ? error.message : String(error)).slice(0, 300),
          durationMs: Date.now() - startedAt
        });
        if (error instanceof Error && error.message === "Unauthorized") {
          emit("error", { error: "Please log in to use the AI agent." });
        } else {
          emit("error", {
            code: "AGENT_RUN_FAILED",
            error: apiError(
              request.headers,
              "Finfold智能体这一轮没有跑完。本轮资料和上下文已经保留，请直接重试，无需重新提供。",
              "Finfold Agent did not finish this turn. Your materials and context are kept—just retry."
            )
          });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // The client may have closed the stream through the pause action.
        }
      }
    }
  });

  return new Response(stream, { headers: { ...SSE_HEADERS, "X-Request-Id": requestId } });
}

function emitInsufficientCredits(emit: (event: string, data: unknown) => void, headers: Headers) {
  emit("error", {
    code: "INSUFFICIENT_CREDITS",
    error: apiError(
      headers,
      "创作点数已用完，补充后可继续使用 Finfold智能体。",
      "Out of AI Credits. Upgrade or top up to continue using Finfold Agent."
    )
  });
}
