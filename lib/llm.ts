import { z } from "zod";
import type { GenerateRequest, KitOutput } from "@/lib/content-schema";
import { kitOutputSchema } from "@/lib/content-schema";
import { buildGenerationPrompt } from "@/lib/prompts";
import { getSharedLettaAgentId, isLettaConfigured, lettaGenerationModel, sendLettaStructuredRequest } from "@/lib/letta";

const llmResponseSchema = z.object({
  outputs: z.array(kitOutputSchema)
});

/**
 * Is a real OpenAI-compatible /chat/completions endpoint configured?
 *
 * IMPORTANT: Letta has NO agent-less chat-completions endpoint, so a base
 * URL pointing at api.letta.com is NOT a usable direct-LLM target — calling
 * it returns `429 {"reasons":["agent-not-found"]}`. We only treat the direct
 * path as available when LLM_API_BASE points somewhere other than Letta.
 */
function hasDirectLLM(): boolean {
  // Require a dedicated LLM key. The Letta key is NOT a valid direct-LLM
  // credential — Letta has no agent-less completions endpoint — so we never
  // fall back to it here.
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return false;
  }
  const apiBase = process.env.LLM_API_BASE ?? "https://api.openai.com/v1";
  return !apiBase.includes("letta.com");
}

/**
 * Generate content kit outputs.
 *
 * Routing priority:
 *  1. The caller's per-user Letta agent (if provided).
 *  2. A direct OpenAI-compatible LLM endpoint (only when one is genuinely
 *     configured — NOT Letta).
 *  3. A shared Letta agent (trial users / fallback) so we never hit the
 *     non-existent agent-less Letta completions endpoint.
 */
export async function generateKitOutputs(
  input: GenerateRequest,
  lettaAgentId?: string
): Promise<KitOutput[]> {
  // ── 1. Per-user Letta Agent path ──────────────────────────────
  if (isLettaConfigured() && lettaAgentId) {
    try {
      return await generateViaLetta(input, lettaAgentId);
    } catch (error) {
      // Per-user agent failed and no direct LLM is available: try the
      // shared agent before giving up (generateViaLetta already re-tried
      // the direct path when one exists).
      const sharedAgentId = await getSharedLettaAgentId();
      if (sharedAgentId && sharedAgentId !== lettaAgentId) {
        return generateViaLetta(input, sharedAgentId);
      }
      throw error;
    }
  }

  // ── 2. Direct LLM path (genuine OpenAI-compatible endpoint) ────
  if (hasDirectLLM()) {
    return generateViaLLM(input);
  }

  // ── 3. Shared Letta agent (trial + fallback) ──────────────────
  if (isLettaConfigured()) {
    const sharedAgentId = await getSharedLettaAgentId();
    if (sharedAgentId) {
      return generateViaLetta(input, sharedAgentId);
    }
  }

  // Nothing configured at all.
  throw new Error(
    "AI 生成未配置 — AI generation is not configured. Set LETTA_API_KEY, or set LLM_API_KEY with an OpenAI-compatible LLM_API_BASE."
  );
}

// ─── Letta Agent Generation ──────────────────────────────────────────

async function generateViaLetta(
  input: GenerateRequest,
  agentId: string
): Promise<KitOutput[]> {
  try {
    // Letta agents (especially small models) don't always return every
    // requested platform in one shot, or may wrap JSON in prose. Collect
    // valid outputs across a few attempts, re-requesting only what's still
    // missing, and accept a partial-but-non-empty result rather than failing
    // the whole generation.
    const collected = new Map<string, KitOutput>();
    const MAX_ATTEMPTS = 3;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const missing = input.platforms.filter((platform) => !collected.has(platform));
      if (missing.length === 0) {
        break;
      }

      const prompt = buildGenerationPrompt({ ...input, platforms: missing });
      let content: string;
      try {
        content = await sendLettaStructuredRequest(agentId, prompt, lettaGenerationModel());
      } catch (sendError) {
        // Network / agent error mid-loop: stop retrying and let the
        // collected-so-far check below decide success vs. failure.
        console.error(`Letta request failed (attempt ${attempt + 1}):`, sendError);
        break;
      }

      try {
        const parsed = llmResponseSchema.parse(parseJsonObject(content));
        for (const output of parsed.outputs) {
          if (input.platforms.includes(output.platform) && !collected.has(output.platform)) {
            collected.set(output.platform, output);
          }
        }
      } catch (parseError) {
        console.error(`Letta response parse failed (attempt ${attempt + 1}):`, parseError);
      }
    }

    if (collected.size === 0) {
      throw new Error("Letta agent returned no usable platform outputs.");
    }

    // Preserve the user's requested platform order.
    return input.platforms
      .filter((platform) => collected.has(platform))
      .map((platform) => collected.get(platform)!);
  } catch (error) {
    // Only fall back to the direct path if a genuine OpenAI-compatible
    // endpoint exists — otherwise re-throw so we surface a real error
    // instead of hitting the broken agent-less Letta endpoint.
    if (hasDirectLLM()) {
      console.error("Letta generation failed, falling back to direct LLM:", error);
      return generateViaLLM(input);
    }
    throw error;
  }
}

// ─── Direct LLM Generation ──────────────────────────────────────────

async function generateViaLLM(input: GenerateRequest): Promise<KitOutput[]> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error("AI 生成未配置 — AI generation is not configured. Please set LLM_API_KEY in your deployment environment variables.");
  }

  try {
    const modelName = process.env.LLM_MODEL ?? "gpt-4o-mini";
    const isGlm5 = modelName.startsWith("glm-5");

    const apiBase = process.env.LLM_API_BASE ?? "https://api.openai.com/v1";
    const supportsJsonMode = apiBase.includes("openai.com") || apiBase.includes("bigmodel.cn");

    const requestBody: Record<string, unknown> = {
      model: modelName,
      temperature: isGlm5 ? 1.0 : 0.7,
      ...(supportsJsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        {
          role: "system",
          content:
            "You are a senior growth strategist. Return strict JSON that matches the requested schema."
        },
        {
          role: "user",
          content: buildGenerationPrompt(input)
        }
      ]
    };

    // Enable thinking reasoning mode for GLM-5 series models
    if (isGlm5) {
      requestBody.thinking = { type: "enabled" };
    }

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`LLM request failed: ${response.status} ${detail}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;

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
    console.error("LLM generation failed:", detail);
    throw new Error(`AI generation failed: ${detail}`);
  }
}

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    // Agent may wrap the JSON in prose. Extract the outermost {...} block.
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(withoutFence.slice(start, end + 1));
    }
    throw new Error("Response did not contain valid JSON.");
  }
}
