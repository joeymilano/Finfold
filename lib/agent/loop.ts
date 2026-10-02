import { looksLikeNumberedChoiceQuestion, parseAskUserResult } from "@/lib/agent/ask-user";
import { getAgentTool, buildOpenAiToolsPayload } from "@/lib/agent/tools";
import { agentDepthSpec } from "@/lib/agent/depth";
import {
  extractToolEvidence,
  renumberEvidence,
  type EvidencePayload
} from "@/lib/report/chart-spec";
import type { AgentToolContext } from "@/lib/agent/types";
import type { ChatContentPart } from "@/lib/llm";
import {
  LLMRequestError,
  chatRequestOptions,
  resolveLLMProviders,
  withProviderFailover
} from "@/lib/llm-providers";
import { getPlanModelTier } from "@/lib/payment/entitlements";
import { createPendingToolMutation } from "@/lib/agent/pending-actions";
import type { AgentChatOutcome } from "@/lib/agent/chat-outcome";
import { normalizeAgentTextContent } from "@/lib/agent/text-content";
import { logProviderTokenUsage, parseTokenUsage } from "@/lib/observability";
import { settleLLMBudget } from "@/lib/llm-budget";

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
  | { type: "evidence"; evidence: EvidencePayload }
  | { type: "done"; messages: AgentChatMessage[]; outcome: Exclude<AgentChatOutcome, "failed"> }
  | {
      type: "error";
      error: string;
      code?: "INSUFFICIENT_CREDITS" | "VISION_UNAVAILABLE" | "PROVIDER_BUSY" | "PROVIDER_UNAVAILABLE";
    };

const MAX_PROVIDER_ERROR_BYTES = 16_384;
const SINGLE_SUCCESS_PER_RUN_TOOLS = new Set(["investigate_social_account"]);

/**
 * Runs the tool-calling Agent against the same ordered provider chain as the
 * rest of Finfold. An explicitly enabled Zhipu route takes priority; independent
 * providers retain their plan model tiers and retry/failover behavior. Image-bearing messages are restricted to providers that
 * explicitly declare a vision model.
 *
 * Each logical Agent turn reserves Credits once. Provider retries/failover are
 * reliability work inside that reservation, so users are not charged again
 * when a provider is busy. Non-streaming responses keep tool-call arguments
 * portable across OpenAI-compatible providers and the loop bounded.
 */
export async function* runAgentLoop(
  initialMessages: AgentChatMessage[],
  ctx: AgentToolContext
): AsyncGenerator<AgentLoopEvent> {
  const configuredProviders = resolveLLMProviders("agent").filter(
    (provider) => !provider.apiBase.includes("letta.com")
  );
  if (configuredProviders.length === 0) {
    yield { type: "error", error: "AI 生成未配置 — 请配置至少一个可用的模型服务。" };
    return;
  }

  const modelTier = getPlanModelTier(ctx.plan);
  // One depth choice spans the whole run: thinking mode, turn budget, timeout.
  const depthSpec = agentDepthSpec(ctx.depth ?? "low");
  const messages = [...initialMessages];
  const tools = buildOpenAiToolsPayload(ctx.plan);
  const successfulSingleRunResults = new Map<string, unknown>();
  const collectedEvidence: EvidencePayload[] = [];
  const executedToolNames = new Set<string>();
  let askedUserViaTool = false;
  let askUserNudgeInjected = false;
  let autonomousContinuationInjected = false;

  for (let turn = 0; turn < depthSpec.maxTurns; turn += 1) {
    if (ctx.signal?.aborted) return;
    const hasImageContent = messages.some((message) => messageHasContentPart(message, "image_url"));
    const hasVideoContent = messages.some((message) => messageHasContentPart(message, "video_url"));
    const hasVisualContent = hasImageContent || hasVideoContent;
    const providers = hasVideoContent
      ? configuredProviders.filter((provider) => provider.visionModel && provider.supportsVideo)
      : hasImageContent
        ? configuredProviders.filter((provider) => provider.visionModel)
        : configuredProviders;
    if (
      hasVisualContent
      && (providers.length === 0 || process.env.LLM_VISION === "false")
    ) {
      yield {
        type: "error",
        code: "VISION_UNAVAILABLE",
        error: hasVideoContent
          ? "视频分析暂时不可用：Finfold智能体尚未配置可读取视频的视觉模型。文件和上下文已经保留，请稍后重试。"
          : "图片分析暂时不可用：Finfold智能体尚未配置视觉模型。请稍后重试或先用 Workbench 提取图片文字。"
      };
      return;
    }
    const modelTurnReserved = await reserveModelTurn(ctx);
    if (!modelTurnReserved) {
      yield {
        type: "error",
        code: "INSUFFICIENT_CREDITS",
        error: "AI Credits are unavailable for another Agent step."
      };
      return;
    }

    let data: ProviderChatResponse;
    try {
      data = await withProviderFailover(providers, async (provider) => {
        if (ctx.signal?.aborted) throw new LLMRequestError(499, "Request aborted.");
        const modelName = hasVisualContent ? provider.visionModel! : provider.models[modelTier];
        let response: Response;
        try {
          response = await fetch(`${provider.apiBase}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${provider.apiKey}`
            },
            body: JSON.stringify({
              model: modelName,
              ...chatRequestOptions(provider, 0.5, undefined, depthSpec.thinking),
              messages,
              tools,
              tool_choice: "auto"
            }),
            signal: provider.zhipu
              ? AbortSignal.any([...(ctx.signal ? [ctx.signal] : []), AbortSignal.timeout(depthSpec.providerTimeoutMs)])
              : ctx.signal
          });
        } catch (error) {
          if (ctx.signal?.aborted) throw new LLMRequestError(499, "Request aborted.");
          throw error;
        }

        if (!response.ok) {
          const detail = await readBoundedResponseText(response, MAX_PROVIDER_ERROR_BYTES);
          throw new LLMRequestError(response.status, detail || `HTTP ${response.status}`);
        }

        try {
          const result = await response.json() as ProviderChatResponse;
          logProviderTokenUsage(provider.name, modelName, "agent", result.usage, { userId: ctx.userId });
          const budgetUsage = parseTokenUsage(result.usage);
          if (budgetUsage) void settleLLMBudget(provider.name, modelName, budgetUsage);
          return result;
        } catch {
          throw new Error(`Provider ${provider.name} returned invalid JSON.`);
        }
      }, {
        onAttempt(metric) {
          if (process.env.NODE_ENV === "test") return;
          console.info("[agent-provider-attempt]", JSON.stringify(metric));
        }
      });
    } catch (error) {
      await refundFailedModelTurn(ctx);
      if (ctx.signal?.aborted) return;
      if (
        hasVisualContent
        && error instanceof LLMRequestError
        && error.status === 400
        && isUnsupportedVisualContentError(error.message)
      ) {
        yield {
          type: "error",
          code: "VISION_UNAVAILABLE",
          error: hasVideoContent
            ? "当前视觉模型无法读取这个视频，本次智能体步骤已退回 AI Credits。文件和上下文已经保留，请稍后重试。"
            : "当前视觉模型无法读取这些截图，本次智能体步骤已退回 AI Credits。请重试或先用 Workbench 提取图片文字。"
        };
      } else {
        yield providerFailureEvent(error);
      }
      return;
    }

    const message = data.choices?.[0]?.message;
    if (!message) {
      await refundFailedModelTurn(ctx);
      yield {
        type: "error",
        code: "PROVIDER_UNAVAILABLE",
        error: "Finfold智能体没有收到有效回复。我已保留本轮资料和上下文，请直接重试，无需重新提供。"
      };
      return;
    }
    await confirmSuccessfulModelTurn(ctx);

    const assistantText = normalizeAgentTextContent(message.content);
    const toolCalls = message.tool_calls ?? [];
    if (hasVisualContent) collapseInspectedVisuals(messages);
    messages.push({ role: "assistant", content: assistantText, tool_calls: toolCalls.length > 0 ? toolCalls : undefined });

    if (toolCalls.length === 0) {
      const finalText = assistantText;
      if (
        !askedUserViaTool
        && !autonomousContinuationInjected
        && shouldContinueAutonomously(initialMessages, executedToolNames, finalText)
      ) {
        autonomousContinuationInjected = true;
        messages.push({
          role: "user",
          content: "Continue the same request now. An execution plan is progress, not the deliverable, and the user has already authorized the task. Complete the next safe read, analysis, or preparation step in this run. Never ask the user to reply with ‘continue’. Stop only for missing evidence, one meaningful product choice through ask_user, or a server-side approval boundary."
        });
        continue;
      }
      if (finalText) yield { type: "text", text: finalText };
      if (!askedUserViaTool && !askUserNudgeInjected && looksLikeNumberedChoiceQuestion(finalText)) {
        askUserNudgeInjected = true;
        messages.push({
          role: "user",
          content: "你刚才在正文里用编号列表让用户打字选择。请立即调用 ask_user，只整理成一道最关键的选择题（保留原选项与推荐项），除一句简短说明外不要再输出长内容，也不要重复之前的分析。"
        });
        continue;
      }
      yield { type: "done", messages, outcome: "completed" };
      return;
    }

    if (assistantText) yield { type: "text", text: assistantText };

    let awaitingConfirmation = false;
    // A successful ask_user hands the turn back to the user. The batch still
    // runs to completion so every tool_call keeps a matching tool result, then
    // the loop stops instead of feeding the empty-handed turn back to the model
    // (which could re-ask the same question).
    let askedUserThisBatch = false;
    for (const call of toolCalls) {
      if (ctx.signal?.aborted) return;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }

      // Providers occasionally emit several ask_user calls in one response.
      // Match every tool call for protocol validity, but expose and execute
      // only the first decision card so one turn never becomes an interview.
      if (call.function.name === "ask_user" && askedUserThisBatch) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ skipped: true, reason: "Only one decision card is allowed per turn." })
        });
        continue;
      }

      const cachedResult = successfulSingleRunResults.get(call.function.name);
      if (cachedResult !== undefined) {
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(cachedResult) });
        continue;
      }

      yield { type: "tool_call", name: call.function.name, args };
      if (call.function.name === "ask_user") askedUserViaTool = true;

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
          result = sanitizedToolError(error, "Unable to prepare this change.");
        }
      } else {
        if (ctx.signal?.aborted) return;
        try {
          result = await tool.execute(args, ctx);
        } catch (error) {
          result = sanitizedToolError(error, "Tool execution failed.");
        }
      }

      if (ctx.signal?.aborted) return;

      // Evidence payloads ride along on data-tool results. They are stripped
      // before the result reaches the model (token economy, and the UI remains
      // the only consumer of the evidence contract) and re-emitted on a
      // dedicated event so the chat can render verifiable data cards.
      const toolEvidence = extractToolEvidence(result);
      const modelResult = toolEvidence && result && typeof result === "object" && !Array.isArray(result)
        ? Object.fromEntries(
          Object.entries(result as Record<string, unknown>).filter(([key]) => key !== "evidence")
        )
        : result;

      if (
        SINGLE_SUCCESS_PER_RUN_TOOLS.has(call.function.name)
        && isSuccessfulSingleRunResult(call.function.name, modelResult)
      ) {
        successfulSingleRunResults.set(call.function.name, modelResult);
      }
      yield { type: "tool_result", name: call.function.name, result: modelResult };
      executedToolNames.add(call.function.name);
      if (toolEvidence) {
        const evidenceBefore = collectedEvidence.length;
        collectedEvidence.push(...toolEvidence);
        const renumbered = renumberEvidence(collectedEvidence);
        for (let index = evidenceBefore; index < renumbered.length; index += 1) {
          yield { type: "evidence", evidence: renumbered[index] };
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(modelResult) });
      if (call.function.name === "ask_user" && parseAskUserResult(result)) {
        askedUserThisBatch = true;
      }
      if (requiresUserConfirmation(result)) {
        awaitingConfirmation = true;
        break;
      }
    }
    if (awaitingConfirmation) {
      yield { type: "done", messages, outcome: "awaiting_confirmation" };
      return;
    }
    if (askedUserThisBatch) {
      yield { type: "done", messages, outcome: "awaiting_input" };
      return;
    }
  }

  yield { type: "error", error: "Agent reached the maximum number of tool-call turns without finishing." };
}

type ProviderChatResponse = {
  usage?: unknown;
  choices?: Array<{
    message?: {
      content?: unknown;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
  }>;
};

function shouldContinueAutonomously(
  initialMessages: AgentChatMessage[],
  executedToolNames: ReadonlySet<string>,
  finalText: string
): boolean {
  if (!executedToolNames.has("create_execution_plan")) return false;
  if (userRequestedPlanningOnly(initialMessages)) return false;
  const onlyPlanned = executedToolNames.size === 1;
  const asksForRedundantContinuation = /(?:回复|输入|告诉我|你可以说|是否|要不要|需要我).{0,12}(?:继续|开始执行)|(?:shall|should|want me to).{0,12}(?:continue|proceed)|reply.{0,8}(?:continue|proceed)/i.test(finalText);
  return onlyPlanned || asksForRedundantContinuation;
}

function userRequestedPlanningOnly(messages: AgentChatMessage[]): boolean {
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  const text = normalizeAgentTextContent(latestUser?.content).toLowerCase();
  if (!text) return false;
  if (/(?:只|仅).{0,6}(?:计划|规划|方案)|(?:不要|无需|先不).{0,6}(?:执行|生成|动手)|plan only|just (?:give me )?(?:a )?plan|do not (?:execute|implement)|don't (?:execute|implement)/i.test(text)) {
    return true;
  }
  const asksForPlanArtifact = /(?:制定|整理|输出|给我|做一份).{0,10}(?:计划|规划|方案)|(?:plan|roadmap|strategy)(?:\s+for)?/i.test(text);
  const alsoRequestsExecution = /(?:并|然后|接着|按照).{0,6}(?:执行|生成|创建|落地|实现|开始做)|execute|implement|build|ship|carry (?:it )?out/i.test(text);
  return asksForPlanArtifact && !alsoRequestsExecution;
}

function messageHasContentPart(
  message: AgentChatMessage,
  type: "image_url" | "video_url"
): boolean {
  return Array.isArray(message.content)
    && message.content.some((part) => part.type === type);
}

function collapseInspectedVisuals(messages: AgentChatMessage[]): void {
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    const text = message.content
      .filter((part): part is Extract<ChatContentPart, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    message.content = `${text}${text ? "\n\n" : ""}[The image evidence was inspected in the preceding vision turn; any video evidence was inspected in that same turn. Continue from the assistant tool arguments and results; do not ask the user to upload it again.]`;
  }
}

function isUnsupportedVisualContentError(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return normalized.includes("messages.content.type")
    || normalized.includes("image_url")
    || normalized.includes("video_url")
    || normalized.includes('取值范围 [\'text\']');
}

function providerFailureEvent(error: unknown): Extract<AgentLoopEvent, { type: "error" }> {
  if (error instanceof LLMRequestError && error.status === 429) {
    return {
      type: "error",
      code: "PROVIDER_BUSY",
      error: "Finfold智能体当前繁忙。我已保留本轮链接、截图和上下文；请直接重试，无需重新提供资料。"
    };
  }
  return {
    type: "error",
    code: "PROVIDER_UNAVAILABLE",
    error: "Finfold智能体服务暂时不可用。我已保留本轮资料和上下文；请直接重试，无需重新提供。"
  };
}

function sanitizedToolError(error: unknown, fallback: string): Record<string, unknown> {
  if (error instanceof LLMRequestError && error.status === 429) {
    return {
      error: "分析模型当前繁忙。本轮资料和上下文已经保留，请直接重试，无需重新上传。",
      code: "PROVIDER_BUSY",
      retryable: true
    };
  }
  if (error instanceof LLMRequestError || error instanceof SyntaxError) {
    return {
      error: "分析服务暂时不可用。本轮资料和上下文已经保留，请稍后重试。",
      code: "PROVIDER_UNAVAILABLE",
      retryable: true
    };
  }
  return { error: error instanceof Error ? error.message : fallback };
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - totalBytes;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      totalBytes += chunk.byteLength;
      if (chunk.byteLength < value.byteLength) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
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

function isSuccessfulSingleRunResult(name: string, result: unknown): boolean {
  if (name !== "investigate_social_account" || !result || typeof result !== "object" || Array.isArray(result)) {
    return false;
  }
  return "investigation" in result && Boolean(result.investigation);
}
