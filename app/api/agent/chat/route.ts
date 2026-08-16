
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
import { resolveAgentPlan } from "@/lib/agent/entitlements";
import { resolveAgentPageContext } from "@/lib/agent/presentation";
import type { AgentAttachment } from "@/lib/agent/attachments";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { logInfo, logWarn, resolveRequestId } from "@/lib/observability";
import { createAgentModelTurnBilling } from "@/lib/agent/model-turn-billing";
import type { AgentStatusStage } from "@/lib/agent/status";
import type { AgentChatOutcome } from "@/lib/agent/chat-outcome";
import { createAgentWorkRecord, type AgentWorkRecord } from "@/lib/agent/work-record";

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
  }).optional()
});

const HISTORY_LIMIT = 20;
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

type StoredMessageContent = {
  text?: string;
  imageUrls?: string[];
  dataImportIds?: string[];
  attachments?: AgentAttachment[];
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  toolResults?: Array<{ name: string; result: unknown }>;
  work?: AgentWorkRecord;
};

async function loadHistory(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  sessionId: string
): Promise<AgentChatMessage[]> {
  const { data } = await admin
    .from("agent_messages")
    .select("id, role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  return (data ?? [])
    .filter((row) => row.role === "user" || row.role === "assistant")
    .flatMap((row): AgentChatMessage[] => {
      const content = row.content as StoredMessageContent;
      if (row.role === "user") {
        return [{ role: "user", content: content.text ?? "" }];
      }
      const calls = content.toolCalls ?? [];
      if (calls.length === 0) {
        return [{ role: "assistant", content: content.text ?? "" }];
      }
      const toolCalls = calls.map((call, index) => ({
        id: `history-${row.id}-${index}`,
        type: "function" as const,
        function: {
          name: call.name,
          arguments: JSON.stringify(call.args ?? {})
        }
      }));
      const resultMessages = toolCalls.map((call, index): AgentChatMessage => ({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(content.toolResults?.[index]?.result ?? { restored: true })
      }));
      return [
        {
          role: "assistant",
          content: content.text ?? "",
          tool_calls: toolCalls
        },
        ...resultMessages
      ];
    });
}

export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, AGENT_CHAT_RATE_LIMIT);
  if (rateLimited) return rateLimited;

  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const startedAt = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const workStages: AgentStatusStage[] = [];

      function emit(event: string, data: unknown) {
        if (request.signal.aborted) return;
        controller.enqueue(encodeSSE(event, data));
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
          emit
        });

        const attachments = await resolvePrivateAttachments(admin, userId, body.attachments ?? []);

        const ctx: AgentToolContext = {
          userId,
          sessionId,
          workflowId: body.workflowId ?? undefined,
          dataImportIds: body.dataImportIds,
          admin,
          plan,
          agentToolsEnabled: getPlanFeatures(plan).agentTools,
          signal: request.signal,
          modelTurnBilling
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
        const attachmentContext = attachments.length
          ? `\n\nATTACHED FILES\n${attachments.map((attachment) => `- ${attachment.name} (${attachment.kind}, ${attachment.mimeType})${attachment.url ? `: ${attachment.url}` : ""}`).join("\n")}\nTreat these as user-provided context. Never claim to have read file contents unless the model actually received or inspected them.`
          : "";
        const messageWithAttachments = `${body.message}${attachmentContext}`;
        const userContent = imageUrls.length > 0
          ? [{ type: "text" as const, text: messageWithAttachments }, ...imageUrls.map((url) => ({ type: "image_url" as const, image_url: { url } }))]
          : messageWithAttachments;

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
        if (!hasDirectLLM() && isLettaConfigured()) {
          if (request.signal.aborted) return;
          let lettaText = "";
          try {
            const sharedAgentId = await getSharedLettaAgentId();
            if (sharedAgentId) {
              if (!(await modelTurnBilling.reserve())) {
                emitInsufficientCredits(emit);
                return;
              }
              if (request.signal.aborted) {
                await modelTurnBilling.refundFailedTurn();
                return;
              }
              const result = await sendLettaMessage(
                sharedAgentId,
                pageContext
                  ? `${messageWithAttachments}\n\n[Current Finfold surface: ${pageContext.prompt}]`
                  : messageWithAttachments,
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
              startedAtMs: startedAt
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
          } else if (event.type === "error") {
            terminalOutcome = "failed";
            emit("error", { error: event.error, ...(event.code ? { code: event.code } : {}) });
          } else if (event.type === "done") {
            terminalOutcome = event.outcome;
          }
        }

        if (request.signal.aborted) return;

        const outcome = terminalOutcome
          ?? (finalText || toolResults.length > 0 ? "completed" : "failed");
        const work = createAgentWorkRecord({
          stages: workStages,
          outcome,
          startedAtMs: startedAt
        });

        await admin.from("agent_messages").insert({
          session_id: sessionId,
          user_id: userId,
          role: "assistant",
          content: { text: finalText, toolCalls, toolResults, work }
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
        const message =
          error instanceof Error && error.message === "Unauthorized"
            ? "Please log in to use the AI agent."
            : error instanceof Error
              ? error.message
              : "Agent chat failed.";
        logWarn("agent_chat_failed", { requestId }, {
          errorType: error instanceof Error ? error.name : "UnknownError",
          durationMs: Date.now() - startedAt
        });
        emit("error", { error: message });
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

function emitInsufficientCredits(emit: (event: string, data: unknown) => void) {
  emit("error", {
    code: "INSUFFICIENT_CREDITS",
    error: "Out of AI Credits. Upgrade or top up to continue using Finfold Agent."
  });
}

async function resolvePrivateAttachments(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
  attachments: AgentAttachment[]
): Promise<AgentAttachment[]> {
  return Promise.all(attachments.map(async (attachment) => {
    if (!attachment.storagePath.startsWith(`${userId}/`)) {
      throw new Error("An attachment does not belong to this account.");
    }
    const { data, error } = await admin.storage
      .from("agent-attachments")
      .createSignedUrl(attachment.storagePath, 60 * 60);
    if (error || !data?.signedUrl) throw new Error("An attachment is no longer available.");
    return { ...attachment, url: data.signedUrl };
  }));
}
