import { z } from "zod";
import type { GenerateRequest, KitOutput } from "@/lib/content-schema";
import { kitOutputSchema } from "@/lib/content-schema";
import { buildGenerationPrompt } from "@/lib/prompts";
import { isLettaConfigured, sendLettaStructuredRequest, isAgentNotFoundError } from "@/lib/letta";

const llmResponseSchema = z.object({
  outputs: z.array(kitOutputSchema)
});

/**
 * Generate content kit outputs.
 *
 * If Letta is configured and a lettaAgentId is provided, the request
 * is routed through the user's Letta agent. Otherwise, it falls back
 * to the direct LLM API.
 *
 * IMPORTANT: The Letta /v1/chat/completions endpoint is NOT a standard
 * OpenAI-compatible endpoint — it requires an agent_id. Therefore, we
 * must NOT use it as an LLM fallback.
 *
 * For the LLM fallback, we use the z-ai-web-dev-sdk via a dedicated
 * API route (/api/llm/generate) that runs on Node.js runtime (not edge).
 * This is because z-ai-web-dev-sdk uses Node.js modules (fs, path, os)
 * that are not available in edge runtime.
 */
export async function generateKitOutputs(
  input: GenerateRequest,
  lettaAgentId?: string
): Promise<KitOutput[]> {
  // ── Letta Agent path ──────────────────────────────────────────
  if (isLettaConfigured() && lettaAgentId) {
    try {
      return await generateViaLetta(input, lettaAgentId);
    } catch (error) {
      // If the agent is not found (stale ID), don't retry — fall through to LLM
      if (isAgentNotFoundError(error)) {
        console.warn("[LLM] Letta agent not found (stale ID), falling back to direct LLM");
      } else {
        console.error("[LLM] Letta generation failed, falling back to direct LLM:", error);
      }
      // Fall through to direct LLM
    }
  }

  // ── Direct LLM path (fallback) ────────────────────────────────
  return generateViaLLM(input);
}

// ─── Letta Agent Generation ──────────────────────────────────────────

async function generateViaLetta(
  input: GenerateRequest,
  agentId: string
): Promise<KitOutput[]> {
  const prompt = buildGenerationPrompt(input);
  const content = await sendLettaStructuredRequest(agentId, prompt);

  const parsedJson = parseJsonObject(content);
  const parsed = llmResponseSchema.parse(parsedJson);
  const requested = new Set(input.platforms);
  const outputs = parsed.outputs.filter((output) => requested.has(output.platform));

  if (outputs.length !== input.platforms.length) {
    throw new Error("Letta agent response did not include every requested platform.");
  }

  return outputs;
}

// ─── Direct LLM Generation ──────────────────────────────────────────

/**
 * Generate content via the z-ai-web-dev-sdk through a dedicated API route.
 *
 * Since the /api/generate route runs on edge runtime, we cannot directly
 * import z-ai-web-dev-sdk (which uses Node.js modules like fs, path, os).
 * Instead, we call a Node.js-runtime API route that wraps the SDK.
 */
async function generateViaLLM(input: GenerateRequest): Promise<KitOutput[]> {
  try {
    const prompt = buildGenerationPrompt(input);

    // Call our own Node.js-runtime API route that wraps z-ai-web-dev-sdk
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/llm/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`LLM API ${response.status}: ${errorBody || response.statusText}`);
    }

    const data = (await response.json()) as { content: string };
    const content = data.content;

    if (!content) {
      throw new Error("LLM returned an empty response.");
    }

    const parsedJson = parseJsonObject(content);
    const parsed = llmResponseSchema.parse(parsedJson);
    const requested = new Set(input.platforms);
    const outputs = parsed.outputs.filter((output) => requested.has(output.platform));

    if (outputs.length !== input.platforms.length) {
      throw new Error("LLM response did not include every requested platform.");
    }

    return outputs;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[LLM] Direct LLM generation failed:", detail);
    throw new Error(`AI generation failed: ${detail}`);
  }
}

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(withoutFence);
}
