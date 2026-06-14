import { z } from "zod";
import type { GenerateRequest, KitOutput } from "@/lib/content-schema";
import { kitOutputSchema } from "@/lib/content-schema";
import { buildGenerationPrompt } from "@/lib/prompts";
import { isLettaConfigured, sendLettaStructuredRequest } from "@/lib/letta";

const llmResponseSchema = z.object({
  outputs: z.array(kitOutputSchema)
});

/**
 * Generate content kit outputs.
 *
 * If Letta is configured and a lettaAgentId is provided, the request
 * is routed through the user's Letta agent. Otherwise, it falls back
 * to the direct OpenAI-compatible LLM API.
 */
export async function generateKitOutputs(
  input: GenerateRequest,
  lettaAgentId?: string
): Promise<KitOutput[]> {
  // ── Letta Agent path ──────────────────────────────────────────
  if (isLettaConfigured() && lettaAgentId) {
    return generateViaLetta(input, lettaAgentId);
  }

  // ── Direct LLM path (fallback) ────────────────────────────────
  return generateViaLLM(input);
}

// ─── Letta Agent Generation ──────────────────────────────────────────

async function generateViaLetta(
  input: GenerateRequest,
  agentId: string
): Promise<KitOutput[]> {
  try {
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
  } catch (error) {
    console.error("Letta generation failed:", error);
    // Fall back to direct LLM if Letta fails
    if (process.env.LLM_API_KEY) {
      console.warn("Falling back to direct LLM after Letta failure.");
      return generateViaLLM(input);
    }
    throw new Error("AI generation is temporarily unavailable. Please try again.");
  }
}

// ─── Direct LLM Generation ──────────────────────────────────────────

async function generateViaLLM(input: GenerateRequest): Promise<KitOutput[]> {
  if (!process.env.LLM_API_KEY) {
    throw new Error("AI 生成未配置 — AI generation is not configured. Please set LLM_API_KEY in your deployment environment variables.");
  }

  try {
    const modelName = process.env.LLM_MODEL ?? "gpt-4o-mini";
    const isGlm5 = modelName.startsWith("glm-5");

    const requestBody: Record<string, unknown> = {
      model: modelName,
      temperature: isGlm5 ? 1.0 : 0.7,
      response_format: { type: "json_object" },
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

    const response = await fetch(`${process.env.LLM_API_BASE ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LLM_API_KEY}`
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
    console.error("LLM generation failed:", error);
    throw new Error("AI generation is temporarily unavailable. Please try again.");
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
