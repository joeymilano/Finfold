import { z } from "zod";
import type { GenerateRequest, KitOutput } from "@/lib/content-schema";
import { kitOutputSchema } from "@/lib/content-schema";
import { buildGenerationPrompt } from "@/lib/prompts";
import { platforms } from "@/lib/platforms";
import type { PlatformId } from "@/lib/platforms";
import { getSharedLettaAgentId, isLettaConfigured, lettaGenerationModel, sendLettaStructuredRequest } from "@/lib/letta";

const llmResponseSchema = z.object({
  outputs: z.array(kitOutputSchema)
});

const VALID_PLATFORM_IDS = new Set<string>(platforms.map((platform) => platform.id));

/** Common aliases LLMs emit instead of our canonical platform ids. */
const PLATFORM_ALIASES: Record<string, PlatformId> = {
  twitter: "x",
  "x/twitter": "x",
  "x (twitter)": "x",
  tweet: "x",
  producthunt: "product-hunt",
  product_hunt: "product-hunt",
  "product hunt": "product-hunt",
  ph: "product-hunt",
  hackernews: "hacker-news",
  hacker_news: "hacker-news",
  "hacker news": "hacker-news",
  hn: "hacker-news",
  "show hn": "hacker-news",
  indiehackers: "indie-hackers",
  indie_hackers: "indie-hackers",
  "indie hackers": "indie-hackers",
  medium: "medium-substack",
  substack: "medium-substack",
  "medium/substack": "medium-substack",
  medium_substack: "medium-substack",
  weixin: "wechat",
  "wechat official": "wechat",
  "wechat-official": "wechat",
  rednote: "xiaohongshu",
  red: "xiaohongshu",
  xhs: "xiaohongshu",
  "little red book": "xiaohongshu",
  "wechat moments": "moments",
  "wechat-moments": "moments",
  friends: "moments",
  pengyouquan: "moments"
};

/**
 * Map a model-emitted platform string onto a canonical PlatformId.
 * Returns null when no confident match exists (so the caller can drop it).
 */
function normalizePlatformId(raw: unknown): PlatformId | null {
  if (typeof raw !== "string") {
    return null;
  }
  const key = raw.trim().toLowerCase();
  if (VALID_PLATFORM_IDS.has(key)) {
    return key as PlatformId;
  }
  if (PLATFORM_ALIASES[key]) {
    return PLATFORM_ALIASES[key];
  }
  // Collapse separators/spaces (e.g. "product hunt" -> "product-hunt").
  const dashed = key.replace(/[\s_]+/g, "-");
  if (VALID_PLATFORM_IDS.has(dashed)) {
    return dashed as PlatformId;
  }
  if (PLATFORM_ALIASES[dashed]) {
    return PLATFORM_ALIASES[dashed];
  }
  return null;
}

/**
 * Rewrite each output's `platform` field to a canonical id BEFORE strict
 * schema validation, so aliases like "twitter" don't cause the whole
 * response to be rejected by the enum.
 */
function normalizeOutputPlatforms(parsedJson: unknown): unknown {
  if (
    parsedJson &&
    typeof parsedJson === "object" &&
    Array.isArray((parsedJson as { outputs?: unknown }).outputs)
  ) {
    for (const output of (parsedJson as { outputs: unknown[] }).outputs) {
      if (output && typeof output === "object" && "platform" in output) {
        const normalized = normalizePlatformId((output as { platform: unknown }).platform);
        if (normalized) {
          (output as { platform: string }).platform = normalized;
        }
      }
    }
  }
  return parsedJson;
}

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
    // requested platform in one shot, or may wrap JSON in prose. They also
    // hit output token limits when asked for many long-form platforms at
    // once (Chinese platforms alone can be 1500–3000 chars each), which
    // TRUNCATES the JSON. To avoid that, request platforms in small batches
    // and salvage every valid output even from a truncated response.
    const collected = new Map<string, KitOutput>();
    const BATCH_SIZE = 2;
    const MAX_ATTEMPTS_PER_BATCH = 2;

    for (let i = 0; i < input.platforms.length; i += BATCH_SIZE) {
      const batch = input.platforms.slice(i, i + BATCH_SIZE);

      for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_BATCH; attempt += 1) {
        const missing = batch.filter((platform) => !collected.has(platform));
        if (missing.length === 0) {
          break;
        }

        const prompt = buildGenerationPrompt({ ...input, platforms: missing });
        let content: string;
        try {
          content = await sendLettaStructuredRequest(agentId, prompt, lettaGenerationModel());
        } catch (sendError) {
          console.error(
            `Letta request failed (batch [${missing.join(",")}] attempt ${attempt + 1}):`,
            sendError
          );
          continue;
        }

        const salvaged = salvageOutputs(content);
        const accepted: string[] = [];
        for (const output of salvaged) {
          if (input.platforms.includes(output.platform) && !collected.has(output.platform)) {
            collected.set(output.platform, output);
            accepted.push(output.platform);
          }
        }

        console.error(
          `[letta-diag] batch=[${missing.join(",")}] attempt ${attempt + 1} ` +
            `contentLen=${content.length} salvaged=${salvaged.length} ` +
            `accepted=[${accepted.join(",")}] collectedTotal=${collected.size}`
        );
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

    const requested = new Set(input.platforms);
    const outputs = salvageOutputs(content).filter((output) => requested.has(output.platform));

    if (outputs.length === 0) {
      throw new Error("LLM response did not include any requested platform.");
    }

    return outputs;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("LLM generation failed:", detail);
    throw new Error(`AI generation failed: ${detail}`);
  }
}

/**
 * Scan for the first complete, brace-balanced JSON object in a string,
 * correctly skipping braces that occur inside quoted strings and escapes.
 * Returns the substring (including the outer braces) or null.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

/**
 * Salvage as many valid KitOutput objects as possible from a model response,
 * even when the overall JSON is TRUNCATED (e.g. the model hit its output
 * token limit mid-object). Strategy:
 *  1. Try strict parse first (fast path for well-formed responses).
 *  2. Otherwise, scan the string for every brace-balanced {...} object and
 *     validate each one individually with kitOutputSchema. Incomplete objects
 *     at the truncation point are simply skipped.
 *
 * This is what prevents one long/truncated platform from discarding all the
 * other fully-generated platforms in the same response.
 */
function salvageOutputs(content: string): KitOutput[] {
  const trimmed = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Fast path: the whole thing parses cleanly.
  try {
    const parsed = llmResponseSchema.parse(normalizeOutputPlatforms(JSON.parse(trimmed)));
    return parsed.outputs;
  } catch {
    // Fall through to per-object salvage.
  }

  const results: KitOutput[] = [];
  let searchFrom = trimmed.indexOf("{");

  // Skip the outermost wrapper `{ "outputs": [` by starting the scan at the
  // first object INSIDE the outputs array when present.
  const outputsKey = trimmed.indexOf('"outputs"');
  if (outputsKey !== -1) {
    const bracket = trimmed.indexOf("[", outputsKey);
    if (bracket !== -1) {
      searchFrom = bracket + 1;
    }
  }

  while (searchFrom !== -1 && searchFrom < trimmed.length) {
    const nextBrace = trimmed.indexOf("{", searchFrom);
    if (nextBrace === -1) {
      break;
    }
    const objStr = extractFirstJsonObject(trimmed.slice(nextBrace));
    if (!objStr) {
      // Truncated final object — nothing more to salvage.
      break;
    }
    try {
      const candidate = JSON.parse(objStr) as Record<string, unknown>;
      if (candidate && typeof candidate === "object" && "platform" in candidate) {
        const normalized = normalizePlatformId(candidate.platform);
        if (normalized) {
          candidate.platform = normalized;
        }
        const validated = kitOutputSchema.safeParse(candidate);
        if (validated.success) {
          results.push(validated.data);
        }
      }
    } catch {
      // Not a valid object on its own — skip it.
    }
    searchFrom = nextBrace + objStr.length;
  }

  return results;
}

