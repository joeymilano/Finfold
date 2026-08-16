import { directLLMModelForTier, hasDirectLLM } from "@/lib/llm";
import { getAgentTool, buildOpenAiToolsPayload } from "@/lib/agent/tools";
import type { AgentToolContext } from "@/lib/agent/types";
import type { ChatContentPart } from "@/lib/llm";
import { createPendingToolMutation } from "@/lib/agent/pending-actions";
import type { AgentChatOutcome } from "@/lib/agent/chat-outcome";

export type AgentChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[];
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

export type AgentLoopEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "done"; messages: AgentChatMessage[]; outcome: Exclude<AgentChatOutcome, "failed"> }
  | { type: "error"; error: string; code?: "INSUFFICIENT_CREDITS" | "VISION_UNAVAILABLE" };

const MAX_TURNS = 6;

/**
 * Runs a tool-calling agent loop against the direct OpenAI-compatible LLM
 * endpoint (lib/llm.ts's env config — LLM_API_KEY/LLM_API_BASE/LLM_MODEL*),
 * NOT Letta: Letta agents are opaque and don't expose a request/response
 * tool-calling contract this loop can drive turn-by-turn.
 *
 * IMPORTANT: this reads the legacy single-provider LLM_API_KEY/LLM_API_BASE
 * env vars directly and does NOT go through resolveLLMProviders()/
 * withProviderFailover() in lib/llm-providers.ts. So the DeepSeek-first
 * LLM_PROVIDERS chain (see wrangler.toml) does NOT apply here — /api/agent/chat
 * keeps running on whatever LLM_API_BASE/LLM_MODEL* point to (GLM) until this
 * loop is migrated onto the provider chain, which is a separate piece of work
 * (tool_calls parsing differs across providers and needs its own failover
 * design, not a drop-in of the content-generation chain).
 *
 * Non-streaming by design: each loop iteration is one blocking
 * chat/completions call. Two reasons — (1) Cloudflare's edge buffers
 * text/event-stream until ~100KB accumulates, so a streaming handler that
 * awaits upstream tokens never flushes mid-turn (the client sees nothing
 * until the whole turn resolves anyway); (2) accumulating streamed
 * tool_call argument deltas is failure-prone across providers. A blocking
 * call returns the full turn, the route handler emits its SSE events and
 * ends, and Cloudflare flushes immediately. Tool/text events arrive per
 * turn, within Cloudflare's ~100s edge ceiling, capped at MAX_TURNS so a
 * confused loop can't run away.
 */
export async function* runAgentLoop(
  initialMessages: AgentChatMessage[],
  ctx: AgentToolContext
): AsyncGenerator<AgentLoopEvent> {
  if (!hasDirectLLM()) {
    yield { type: "error", error: "AI 生成未配置 — 请设置 LLM_API_KEY 和 LLM_API_BASE。" };
    return;
  }

  const apiKey = process.env.LLM_API_KEY as string;
  const apiBase = process.env.LLM_API_BASE ?? "https://api.openai.com/v1";
  // Model MUST come from the same source as apiBase/apiKey above. This loop
  // reads LLM_API_BASE/LLM_API_KEY directly (legacy single-provider vars),
  // so the model must be LLM_MODEL too — NOT directLLMModelForTier(), which
  // returns usableProviders()[0].models.haiku (the LLM_PROVIDERS chain head,
  // e.g. DeepSeek's "deepseek-v4-flash"). Mixing them sends a DeepSeek
  // modelCode to the GLM endpoint → 400 {"code":"1214","message":"modelCode：不存在"}.
  const textModelName = process.env.LLM_MODEL ?? directLLMModelForTier("haiku");
  const visionModelName = process.env.LLM_VISION_MODEL?.trim();
  const supportsJsonMode = false; // tool-calling responses are plain assistant messages, not JSON objects

  const messages = [...initialMessages];
  const tools = buildOpenAiToolsPayload();

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    if (ctx.signal?.aborted) return;
    const hasImageContent = messages.some(messageHasImageContent);
    if (hasImageContent && (!visionModelName || process.env.LLM_VISION === "false")) {
      yield {
        type: "error",
        code: "VISION_UNAVAILABLE",
        error: "图片分析暂时不可用：Agent 尚未配置视觉模型。请稍后重试或先用 Workbench 提取图片文字。"
      };
      return;
    }
    // The legacy Agent loop used to send image_url parts to LLM_MODEL even
    // when that model was text-only. GLM then rejected the entire request with
    // messages.content.type=1210. Any turn whose retained conversation still
    // contains an image must use the vision model explicitly.
    const modelName = hasImageContent ? visionModelName! : textModelName;
    const modelTurnReserved = await reserveModelTurn(ctx);
    if (!modelTurnReserved) {
      yield {
        type: "error",
        code: "INSUFFICIENT_CREDITS",
        error: "AI Credits are unavailable for another Agent step."
      };
      return;
    }

    let response: Response;
    try {
      response = await fetch(`${apiBase}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelName,
          temperature: 0.5,
          messages,
          tools,
          tool_choice: "auto",
          ...(supportsJsonMode ? { response_format: { type: "json_object" } } : {})
        }),
        signal: ctx.signal
      });
    } catch (error) {
      await refundFailedModelTurn(ctx);
      if (ctx.signal?.aborted) return;
      yield { type: "error", error: error instanceof Error ? error.message : "Agent request failed." };
      return;
    }

    if (!response.ok) {
      const detail = await response.text();
      await refundFailedModelTurn(ctx);
      if (hasImageContent && response.status === 400 && isUnsupportedImageContentError(detail)) {
        yield {
          type: "error",
          code: "VISION_UNAVAILABLE",
          error: "当前视觉模型无法读取这些截图，本次 Agent 步骤已退回 AI Credits。请重试或先用 Workbench 提取图片文字。"
        };
      } else {
        yield { type: "error", error: `LLM request failed: ${response.status} ${detail}` };
      }
      return;
    }

    let data: {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
        };
      }>;
    };
    try {
      data = await response.json() as typeof data;
    } catch {
      await refundFailedModelTurn(ctx);
      yield { type: "error", error: "LLM returned an invalid response." };
      return;
    }
    const message = data.choices?.[0]?.message;
    if (!message) {
      await refundFailedModelTurn(ctx);
      yield { type: "error", error: "LLM returned an empty response." };
      return;
    }
    await confirmSuccessfulModelTurn(ctx);

    const toolCalls = message.tool_calls ?? [];
    messages.push({ role: "assistant", content: message.content ?? "", tool_calls: toolCalls.length > 0 ? toolCalls : undefined });

    if (message.content) {
      yield { type: "text", text: message.content };
    }

    if (toolCalls.length === 0) {
      yield { type: "done", messages, outcome: "completed" };
      return;
    }

    let awaitingConfirmation = false;
    for (const call of toolCalls) {
      if (ctx.signal?.aborted) return;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }

      yield { type: "tool_call", name: call.function.name, args };

      const tool = getAgentTool(call.function.name);
      let result: unknown;
      if (!tool) {
        result = { error: `Unknown tool: ${call.function.name}` };
      } else if (tool.requiresAgentTools && !ctx.agentToolsEnabled) {
        result = {
          upgradeRequired: true,
          message: "此功能需要 Starter 或以上套餐。"
        };
      } else if (tool.mutates) {
        if (ctx.signal?.aborted) return;
        try {
          result = await createPendingToolMutation(ctx, tool.name, args);
        } catch (error) {
          result = { error: error instanceof Error ? error.message : "Unable to prepare this change." };
        }
      } else {
        if (ctx.signal?.aborted) return;
        try {
          result = await tool.execute(args, ctx);
        } catch (error) {
          result = { error: error instanceof Error ? error.message : "Tool execution failed." };
        }
      }

      if (ctx.signal?.aborted) return;

      yield { type: "tool_result", name: call.function.name, result };
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      if (requiresUserConfirmation(result)) {
        awaitingConfirmation = true;
        break;
      }
    }
    if (awaitingConfirmation) {
      yield { type: "done", messages, outcome: "awaiting_confirmation" };
      return;
    }
  }

  yield { type: "error", error: "Agent reached the maximum number of tool-call turns without finishing." };
}

function messageHasImageContent(message: AgentChatMessage): boolean {
  return Array.isArray(message.content)
    && message.content.some((part) => part.type === "image_url");
}

function isUnsupportedImageContentError(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return normalized.includes("messages.content.type")
    || normalized.includes("image_url")
    || normalized.includes('取值范围 [\'text\']');
}

async function reserveModelTurn(ctx: AgentToolContext): Promise<boolean> {
  if (!ctx.modelTurnBilling) return true;
  try {
    return await ctx.modelTurnBilling.reserve();
  } catch {
    return false;
  }
}

async function refundFailedModelTurn(ctx: AgentToolContext): Promise<void> {
  if (!ctx.modelTurnBilling) return;
  try {
    await ctx.modelTurnBilling.refundFailedTurn();
  } catch {
    // The original provider error remains the actionable failure for the chat.
  }
}

async function confirmSuccessfulModelTurn(ctx: AgentToolContext): Promise<void> {
  if (!ctx.modelTurnBilling) return;
  try {
    await ctx.modelTurnBilling.confirmSuccessfulTurn();
  } catch {
    // The reservation already succeeded; telemetry must not suppress the reply.
  }
}

function requiresUserConfirmation(result: unknown): boolean {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  const value = result as Record<string, unknown>;
  return value.confirmationRequired === true
    || Boolean(value.pendingAction && typeof value.pendingAction === "object");
}
