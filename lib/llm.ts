import { z } from "zod";
import type { GenerateRequest, KitOutput } from "@/lib/content-schema";
import { kitOutputSchema } from "@/lib/content-schema";
import { getGoal } from "@/lib/goals";
import { getPersona } from "@/lib/personas";
import { getPlatform } from "@/lib/platforms";
import { buildGenerationPrompt } from "@/lib/prompts";

const llmResponseSchema = z.object({
  outputs: z.array(kitOutputSchema)
});

export async function generateKitOutputs(input: GenerateRequest): Promise<KitOutput[]> {
  if (!process.env.LLM_API_KEY) {
    throw new Error("AI 生成未配置 — AI generation is not configured. Please set LLM_API_KEY in your deployment environment variables.");
  }

  // Real LLM call. When a real key is configured, failures should be visible:
  // paid users must not silently receive template content.
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
