/**
 * Image Generation Client — server-side only.
 *
 * Generates cover images for content kit outputs through an ordered
 * provider chain (see lib/image-providers.ts):
 *  1. Cloudflare Workers AI (@cf/black-forest-labs/flux-2-klein-4b), while
 *     today's free Neuron budget (lib/workers-ai-budget.ts) allows it.
 *  2. Agnes AI (OpenAI-compatible /v1/images/generations) — the original,
 *     sole provider, now the fallback.
 *
 * Uses the standard fetch API for Workers compatibility and a small bundle.
 */

import { LLMRequestError } from "@/lib/llm-providers";
import {
  resolveImageProviders,
  workersAiSupportsSize,
  WORKERS_AI_MAX_REFERENCE_IMAGE_DIMENSION,
  type ImageProvider
} from "@/lib/image-providers";
import { estimateImageNeurons, reserveNeurons, releaseNeurons } from "@/lib/workers-ai-budget";
import { logInfo, logWarn, type TelemetryContext } from "@/lib/observability";
import { inspectMediaUploadBytes } from "@/lib/media-upload-policy";
import { bytesToArrayBuffer, IMAGE_CONTENT_TYPES, readBytesWithLimit, safeExternalFetch } from "@/lib/safe-url";

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_REFERENCE_IMAGE_BYTES = 15 * 1024 * 1024;

// ─── Types ───────────────────────────────────────────────────────────

export interface ImageGenerationResult {
  url: string;
  revisedPrompt: string | null;
}

// ─── Config Check ────────────────────────────────────────────────────

export function isImageGenConfigured(): boolean {
  return resolveImageProviders().length > 0;
}

// ─── Core Generation ─────────────────────────────────────────────────

/**
 * Generate an image from a text prompt, trying each configured provider in
 * order (Workers AI first, Agnes AI as fallback).
 *
 * @param prompt             The image generation prompt
 * @param size               Image dimensions (default 1024x1024)
 * @param referenceImageUrl  Optional public URL of an uploaded product image.
 *                           When provided (and reference support isn't
 *                           disabled via IMAGE_REFERENCE=false), it's passed
 *                           as an image-to-image reference so the cover
 *                           inherits the real product's look. Workers AI
 *                           (flux-2-klein-4b) accepts a reference as
 *                           input_image_0 ONLY when it decodes to under
 *                           512x512 (Cloudflare's documented limit) —
 *                           anything larger, unreachable, or unrecognized
 *                           silently makes Workers AI ineligible for this
 *                           request, falling back to Agnes, which has no
 *                           such size limit.
 * @param telemetry          Optional context for ai_provider_attempt logging.
 * @returns       Either a hosted URL (Agnes) or raw bytes (Workers AI) —
 *                see ImageGenerationOutcome.
 */
export type ImageGenerationOutcome =
  | { kind: "url"; url: string; revisedPrompt: string | null }
  | { kind: "bytes"; bytes: Uint8Array; contentType: string; revisedPrompt: string | null };

export async function generateImage(
  prompt: string,
  size: string = "1024x1024",
  referenceImageUrl?: string,
  telemetry?: TelemetryContext
): Promise<ImageGenerationOutcome> {
  const allProviders = resolveImageProviders();
  if (allProviders.length === 0) {
    throw new Error("Image generation is not configured.");
  }

  const useReference = Boolean(referenceImageUrl) && process.env.IMAGE_REFERENCE !== "false";
  // flux-2-klein-4b supports reference images (input_image_0..3), but only
  // under 512x512 — fetch and validate once up front so every provider in
  // the chain sees the same decision. A too-large, unreachable, or
  // unrecognized reference simply makes Workers AI ineligible for THIS
  // request (never throws): the request still proceeds, either without a
  // reference on Workers AI or with the full-size reference on Agnes
  // (which has no such limit).
  const workersAiReference = useReference
    ? await prepareWorkersAiReferenceImage(referenceImageUrl!)
    : null;

  const providers = allProviders.filter((provider) => {
    if (provider.name !== "workers-ai") return true;
    if (!useReference) return workersAiSupportsSize();
    return workersAiReference !== null;
  });
  if (providers.length === 0) {
    throw new Error("Image generation is not configured for this request.");
  }

  let lastError: unknown;
  for (const provider of providers) {
    const startedAt = Date.now();
    try {
      const outcome = await runProvider(
        provider,
        prompt,
        size,
        useReference ? referenceImageUrl : undefined,
        workersAiReference
      );
      logInfo("image_provider_attempt", telemetry, {
        provider: provider.name,
        outcome: "succeeded",
        latency_ms: Date.now() - startedAt
      });
      return outcome;
    } catch (error) {
      lastError = error;
      const status = error instanceof LLMRequestError ? error.status : null;
      const skipped = error instanceof NeuronBudgetExhaustedError;
      const fields = {
        provider: provider.name,
        outcome: skipped ? "skipped" : "failed",
        status,
        latency_ms: Date.now() - startedAt,
        reason: skipped ? "neuron_budget_exhausted" : undefined
      };
      if (skipped) {
        logInfo("image_provider_skipped", telemetry, fields);
      } else {
        logWarn("image_provider_attempt", telemetry, fields);
        console.warn(
          `[ImageGen] provider "${provider.name}" failed, trying next provider:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All configured image providers failed.");
}

class NeuronBudgetExhaustedError extends Error {
  constructor() {
    super("Workers AI daily Neuron budget exhausted.");
  }
}

type WorkersAiReferenceImage = { bytes: Uint8Array; contentType: string };

/**
 * Fetches a reference image URL and validates it fits flux-2-klein-4b's
 * input_image_N contract (under 512x512, recognized format). Returns null
 * on ANY failure — network error, over-size, unrecognized bytes — so the
 * caller can silently treat Workers AI as ineligible for this request and
 * fall back to Agnes (which has no such size limit) rather than fail the
 * whole generation.
 */
async function prepareWorkersAiReferenceImage(url: string): Promise<WorkersAiReferenceImage | null> {
  try {
    const response = await safeExternalFetch(
      url,
      { headers: { Accept: "image/webp,image/png,image/jpeg" } },
      {
        allowedContentTypes: IMAGE_CONTENT_TYPES,
        timeoutMs: 15_000,
        auditPurpose: "workers_ai_reference_image"
      }
    );
    if (!response.ok) return null;

    const bytes = await readBytesWithLimit(response, MAX_REFERENCE_IMAGE_BYTES);
    const inspection = inspectMediaUploadBytes(bytes);
    if (!inspection.ok) return null;
    if (
      inspection.width > WORKERS_AI_MAX_REFERENCE_IMAGE_DIMENSION ||
      inspection.height > WORKERS_AI_MAX_REFERENCE_IMAGE_DIMENSION
    ) {
      return null;
    }

    return { bytes, contentType: inspection.contentType };
  } catch {
    return null;
  }
}

async function runProvider(
  provider: ImageProvider,
  prompt: string,
  size: string,
  referenceImageUrl: string | undefined,
  workersAiReference: WorkersAiReferenceImage | null
): Promise<ImageGenerationOutcome> {
  if (provider.name === "workers-ai") {
    return runWorkersAi(provider, prompt, size, workersAiReference);
  }
  return runAgnes(provider, prompt, size, referenceImageUrl);
}

async function runWorkersAi(
  provider: ImageProvider & { name: "workers-ai" },
  prompt: string,
  size: string,
  reference: WorkersAiReferenceImage | null
): Promise<ImageGenerationOutcome> {
  const estimatedNeurons = estimateImageNeurons(size, reference ? 1 : 0);
  const reservation = await reserveNeurons(estimatedNeurons);
  if (!reservation.allowed) {
    throw new NeuronBudgetExhaustedError();
  }

  let succeeded = false;
  try {
    // flux-2-klein-4b's REST input is a required `multipart` object (NOT a
    // plain JSON body — confirmed against Cloudflare's own changelog
    // example, since the model page's schema viewer only shows the
    // collapsed { body, contentType } shape without documenting it inline).
    // Passing a FormData body directly to fetch lets it set the
    // boundary-bearing multipart Content-Type header itself.
    const [width, height] = size.split("x");
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("width", width);
    form.append("height", height);
    if (reference) {
      // The model requires this exact field name for a single reference
      // image (see the Cloudflare changelog's multi-reference example,
      // which uses input_image_0..input_image_3 for up to 4 images).
      form.append(
        "input_image_0",
        new Blob([bytesToArrayBuffer(reference.bytes)], { type: reference.contentType })
      );
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${provider.accountId}/ai/run/${provider.model}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiToken}`
      },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      await response.text().catch(() => "");
      throw new LLMRequestError(response.status, `Workers AI image request failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      result?: { image?: string };
      success?: boolean;
    };
    const base64Image = data.result?.image;
    if (!data.success || !base64Image) {
      throw new Error("Workers AI returned no image data.");
    }

    succeeded = true;
    return {
      kind: "bytes",
      bytes: base64ToBytes(base64Image),
      contentType: "image/jpeg",
      revisedPrompt: null
    };
  } finally {
    if (!succeeded) {
      await releaseNeurons(estimatedNeurons);
    }
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function runAgnes(
  provider: ImageProvider & { name: "agnes" },
  prompt: string,
  size: string,
  referenceImageUrl: string | undefined
): Promise<ImageGenerationOutcome> {
  const url = `${provider.apiBase}/v1/images/generations`;

  async function post(withReference: boolean): Promise<ImageGenerationOutcome> {
    const body: Record<string, unknown> = { model: provider.model, prompt, n: 1, size };
    if (withReference && referenceImageUrl) {
      body.image = referenceImageUrl;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new LLMRequestError(res.status, `Image API ${res.status}: ${errBody || res.statusText}`);
    }

    const data = (await res.json()) as {
      data?: Array<{ url?: string; b64_json?: string | null; revised_prompt?: string | null }>;
    };

    const image = data.data?.[0];
    if (!image?.url) {
      throw new Error("Image API returned no image URL.");
    }

    return {
      kind: "url",
      url: image.url,
      revisedPrompt: image.revised_prompt ?? null
    };
  }

  if (!referenceImageUrl) {
    return post(false);
  }

  try {
    return await post(true);
  } catch (error) {
    // The endpoint may not accept the reference param — degrade to plain
    // text-to-image (still visually guided by the vision-informed prompt).
    console.warn(
      "[ImageGen] Reference-image request failed, retrying text-only:",
      error instanceof Error ? error.message : String(error)
    );
    return post(false);
  }
}

/**
 * Build an image generation prompt tailored to a specific platform and content.
 *
 * The prompt is designed to produce a visually striking cover image
 * that matches the tone and style of the platform's content.
 */
export function buildImagePrompt(params: {
  platform: string;
  title: string;
  body: string;
  ideaText: string;
  locale: "zh" | "en";
}): string {
  const { platform, title, ideaText } = params;

  // Extract key themes from the content
  const coreIdea = ideaText.slice(0, 200);
  const headline = title.slice(0, 80);

  const platformStyle: Record<string, string> = {
    wechat: "professional editorial magazine cover, sophisticated layout, Chinese text overlay style",
    xiaohongshu: "lifestyle aesthetic, soft pastel tones, clean minimal flat lay, trendy Gen-Z visual style",
    zhihu: "knowledge-led editorial illustration, credible explanatory visual, clean blue accents, thoughtful Chinese long-form aesthetic",
    moments: "casual authentic, warm tones, personal story vibe, smartphone photography feel",
    x: "bold minimalist, high contrast, striking single visual, modern tech aesthetic",
    linkedin: "corporate professional, clean data visualization style, business insight visual",
    instagram: "lifestyle visual storytelling, vibrant aspirational aesthetic, influencer-grade photography, bold saturated color, social media trend visual",
    facebook: "community social visual, friendly approachable, clear headline-driven composition, warm authentic social sharing aesthetic",
    reddit: "community-driven, meme-aware, authentic discussion visual, tech-savvy aesthetic",
    "product-hunt": "startup launch energy, product showcase, clean tech aesthetic, innovation visual",
    threads: "conversational, authentic, warm community feel, social discussion visual",
    "hacker-news": "technical minimalism, code/terminal aesthetic, hacker culture visual",
    "indie-hackers": "bootstrap hustle, maker community, indie developer aesthetic",
    "medium-substack": "thought leadership, editorial illustration, intellectual visual",
  };

  const style = platformStyle[platform] ?? "modern digital marketing visual";

  return `Create a visually striking social media cover image for a ${platform} post. Style: ${style}. The post is about: "${coreIdea}". Headline: "${headline}". The image should be eye-catching, professional, and suitable for ${platform}. No text overlay. High quality, 4K resolution.`;
}

/**
 * Converts any model-authored image prompt into a background-only visual brief.
 * All readable copy is rendered later by CoverCanvas, so the image model never
 * gets a chance to misspell a Chinese headline or invent fake UI labels.
 */
export function buildTextFreeVisualPrompt(prompt: string, platform: string): string {
  const cleanPrompt = prompt.trim().replace(/\s+/g, " ");

  return [
    `Create a premium background visual plate for a ${platform} social cover.`,
    cleanPrompt,
    "BACKGROUND ART ONLY: absolutely no text, letters, words, typography, captions, numbers, logos, watermarks, signatures, UI labels, signs, posters, book covers, packaging copy, or readable screens.",
    "Leave deliberate negative space for a separately typeset headline and subtitle. Use one clear focal subject, editorial lighting, strong depth, and a composition that remains legible under a dark gradient overlay.",
    "Do not draw a finished poster or add any graphic headline. Finfold will typeset every visible word after image generation."
  ].join(" ");
}

// Content generation intentionally does not call the image model. Cover Studio
// invokes /api/image/generate only after an explicit user action.
