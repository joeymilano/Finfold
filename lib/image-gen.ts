/**
 * Image Generation Client — server-side only.
 *
 * Generates Workbench visuals through a purpose-aware provider chain (see
 * lib/image-providers.ts). Manual covers reserve Pro quota and can use the
 * higher-quality FLUX.2 Klein 9B / paid Qwen Pro path; batch illustrations
 * use the lower-cost Qwen Standard / FLUX.2 Klein 4B path. Brand-reference
 * covers route to Wan Pro. Every Workers AI call remains under the hard daily
 * Neuron guard, and Agnes remains the final cross-vendor fallback.
 *
 * Uses the standard fetch API for Workers compatibility and a small bundle.
 */

import { z } from "zod";
import { LLMRequestError } from "@/lib/llm-providers";
import {
  resolveImageProviders,
  workersAiSupportsSize,
  WORKERS_AI_MAX_REFERENCE_IMAGE_DIMENSION,
  type ImageGenerationPurpose,
  type ImageProvider
} from "@/lib/image-providers";
import { estimateImageNeurons, reserveNeurons, releaseNeurons } from "@/lib/workers-ai-budget";
import { logInfo, logWarn, type TelemetryContext } from "@/lib/observability";
import { inspectMediaUploadBytes } from "@/lib/media-upload-policy";
import {
  bytesToArrayBuffer,
  IMAGE_CONTENT_TYPES,
  readBytesWithLimit,
  readTextWithLimit,
  safeExternalFetch
} from "@/lib/safe-url";

const REQUEST_TIMEOUT_MS = 60_000;
const WAN_REQUEST_TIMEOUT_MS = 120_000;
const MAX_REFERENCE_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_GENERATED_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES = 1024 * 1024;
const wanGenerationResponseSchema = z.object({
  output: z.object({
    choices: z.array(z.object({
      message: z.object({
        content: z.array(z.object({ image: z.string().url().optional() }).passthrough())
      }).optional()
    }).passthrough())
  }).optional()
}).passthrough();

// ─── Types ───────────────────────────────────────────────────────────

export interface ImageGenerationResult {
  url: string;
  revisedPrompt: string | null;
}

// ─── Config Check ────────────────────────────────────────────────────

export function isImageGenConfigured(purpose: ImageGenerationPurpose = "cover"): boolean {
  return resolveImageProviders({ purpose }).length > 0;
}

// ─── Core Generation ─────────────────────────────────────────────────

/**
 * Generate an image from a text prompt, trying each configured provider in
 * order selected for the requested purpose.
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
 *                           request, continuing to the next provider.
 * @param options            Purpose-aware routing and optional telemetry.
 * @returns       Either a hosted URL (Agnes) or raw bytes (Workers AI) —
 *                see ImageGenerationOutcome.
 */
export type ImageGenerationOutcome =
  | { kind: "url"; url: string; revisedPrompt: string | null }
  | { kind: "bytes"; bytes: Uint8Array; contentType: string; revisedPrompt: string | null };

export interface GenerateImageOptions {
  purpose?: ImageGenerationPurpose;
  telemetry?: TelemetryContext;
}

export async function generateImage(
  prompt: string,
  size: string = "1024x1024",
  referenceImageUrl?: string,
  options: GenerateImageOptions = {}
): Promise<ImageGenerationOutcome> {
  const purpose = options.purpose ?? "cover";
  const telemetry = options.telemetry;
  const useReference = Boolean(referenceImageUrl) && process.env.IMAGE_REFERENCE !== "false";
  const allProviders = resolveImageProviders({ purpose, hasReferenceImage: useReference });
  if (allProviders.length === 0) {
    throw new Error("Image generation is not configured.");
  }

  // FLUX.2 Klein 4B supports reference images (input_image_0..3), but only
  // under 512x512 — fetch and validate once up front so every provider in
  // the chain sees the same decision. A too-large, unreachable, or
  // unrecognized reference simply makes Workers AI ineligible for THIS
  // request (never throws): the request still proceeds through the remaining
  // DashScope/Agnes providers with the original full-size reference.
  const workersAiReference = useReference && allProviders.some((provider) => provider.name === "workers-ai")
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
        model: provider.model,
        purpose,
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
        model: provider.model,
        purpose,
        outcome: skipped ? "skipped" : "failed",
        status,
        latency_ms: Date.now() - startedAt,
        reason: skipped ? error.reason : undefined
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
  constructor(readonly reason: "neuron_budget_exhausted" | "unpriced_model" = "neuron_budget_exhausted") {
    super(reason === "unpriced_model"
      ? "Workers AI model has no approved local Neuron estimate."
      : "Workers AI daily Neuron budget exhausted.");
  }
}

type WorkersAiReferenceImage = { bytes: Uint8Array; contentType: string };

/**
 * Fetches a reference image URL and validates it fits flux-2-klein-4b's
 * input_image_N contract (under 512x512, recognized format). Returns null
 * on ANY failure — network error, over-size, unrecognized bytes — so the
 * caller can silently treat Workers AI as ineligible for this request and
 * continue to the next provider rather than fail the whole generation.
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
  if (provider.kind === "dashscope-multimodal") {
    return runDashScopeImage(provider, prompt, size, referenceImageUrl);
  }
  if (provider.name === "workers-ai") {
    return runWorkersAi(provider, prompt, size, workersAiReference);
  }
  return runAgnes(provider, prompt, size, referenceImageUrl);
}

/**
 * Wan 2.7 is billed per successful image rather than per output pixel. Scale
 * the requested social-cover aspect ratio up to a 2K long edge so the quality
 * upgrade is obtained without increasing the per-image model charge.
 */
export function normalizeWanOutputSize(size: string): string {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return "2K";

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "2K";
  }

  const scale = 2048 / Math.max(width, height);
  const roundTo16 = (value: number) => Math.max(16, Math.round(value / 16) * 16);
  const outputWidth = roundTo16(width * scale);
  const outputHeight = roundTo16(height * scale);
  return `${outputWidth}*${outputHeight}`;
}

/**
 * Qwen Image 3.0 accepts custom dimensions. Finfold's native publish sizes
 * are all at or below 1024x1024 total pixels, so paid Qwen Pro can retain the
 * exact final aspect and dimensions while staying in the lower 1K price tier.
 */
export function normalizeNativeDashScopeOutputSize(size: string): string {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return "1024*1024";
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "1024*1024";
  }
  return `${width}*${height}`;
}

async function runDashScopeImage(
  provider: Extract<ImageProvider, { kind: "dashscope-multimodal" }>,
  prompt: string,
  size: string,
  referenceImageUrl: string | undefined
): Promise<ImageGenerationOutcome> {
  const content: Array<{ image: string } | { text: string }> = [];
  if (referenceImageUrl) content.push({ image: referenceImageUrl });
  content.push({ text: prompt });

  const response = await fetch(
    `${provider.apiBase}/api/v1/services/aigc/multimodal-generation/generation`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        input: {
          messages: [{ role: "user", content }]
        },
        parameters: {
          size: provider.outputResolution === "native"
            ? normalizeNativeDashScopeOutputSize(size)
            : normalizeWanOutputSize(size),
          n: 1,
          watermark: false,
          ...(provider.requestStyle === "qwen-image"
            ? {
                prompt_extend: true,
                prompt_extend_mode: referenceImageUrl ? "direct" : "agent"
              }
            : !referenceImageUrl
              ? { thinking_mode: provider.thinkingMode }
              : {})
        }
      }),
      signal: AbortSignal.timeout(WAN_REQUEST_TIMEOUT_MS)
    }
  );

  const raw = await readTextWithLimit(response, MAX_PROVIDER_RESPONSE_BYTES).catch(() => "");
  if (!response.ok) {
    throw new LLMRequestError(
      response.status,
      `DashScope image request failed: ${response.status}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("DashScope image provider returned invalid JSON.");
  }
  const validated = wanGenerationResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("DashScope image provider returned an invalid response shape.");
  }

  const imageUrl = validated.data.output?.choices?.[0]?.message?.content?.find(
    (part) => typeof part.image === "string"
  )?.image;
  if (!imageUrl) {
    throw new Error("DashScope image provider returned no image URL.");
  }

  // DashScope URLs expire after 24 hours. Download immediately and let the
  // existing route persist bytes to Finfold-owned storage.
  const imageResponse = await safeExternalFetch(
    imageUrl,
    { headers: { Accept: "image/png,image/webp,image/jpeg" } },
    {
      allowedContentTypes: IMAGE_CONTENT_TYPES,
      timeoutMs: 30_000,
      auditPurpose: "wan_generated_image_download"
    }
  );
  if (!imageResponse.ok) {
    throw new LLMRequestError(
      imageResponse.status,
      `DashScope image download failed: ${imageResponse.status}`
    );
  }

  const bytes = await readBytesWithLimit(imageResponse, MAX_GENERATED_IMAGE_BYTES);
  const inspection = inspectMediaUploadBytes(bytes);
  if (!inspection.ok) {
    throw new Error("DashScope image provider returned an unsupported image payload.");
  }

  return {
    kind: "bytes",
    bytes,
    contentType: inspection.contentType,
    revisedPrompt: null
  };
}

async function runWorkersAi(
  provider: ImageProvider & { name: "workers-ai" },
  prompt: string,
  size: string,
  reference: WorkersAiReferenceImage | null
): Promise<ImageGenerationOutcome> {
  const estimatedNeurons = estimateImageNeurons(size, reference ? 1 : 0, provider.model);
  if (estimatedNeurons === null) {
    throw new NeuronBudgetExhaustedError("unpriced_model");
  }
  const reservation = await reserveNeurons(estimatedNeurons);
  if (!reservation.allowed) {
    throw new NeuronBudgetExhaustedError();
  }

  let succeeded = false;
  try {
    // FLUX.2 Klein's REST input is a required `multipart` object (NOT a
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
 * Per-platform cover art direction.
 *
 * The historical failure mode: feeding the model only a theme (the user's
 * idea text) produced "ambient wallpaper" — abstract fluid gradients that
 * look nothing like a social cover. A cover is a LAYOUT problem, so each
 * platform gets an explicit composition (where the subject sits, where the
 * reserved negative space for typesetting sits), art direction, a restrained
 * palette, and the native aspect ratio. Sizes reuse Cover Studio's
 * provider-validated set (see /api/image/generate allowedSizes).
 */
type PlatformCoverArt = {
  /** What this plate IS — grounds the model in the real deliverable. */
  medium: string;
  /** Layout geometry: subject position + reserved copy zone. */
  composition: string;
  /** Style anchors: rendering, lighting, depth. */
  artDirection: string;
  /** Restrained color system: base + one accent. */
  color: string;
  /** Native aspect for this platform's feed. */
  size: string;
};

const PLATFORM_COVER_ART: Record<string, PlatformCoverArt> = {
  wechat: {
    medium: "premium editorial header plate for a WeChat Official Account article",
    composition: "one clear focal subject occupying the right 40% of the frame; the left 60% is calm, low-detail negative space reserved for the headline; light falls from the right so detail fades toward the copy zone without entering it",
    artDirection: "refined tech-magazine art direction, soft directional studio light, subtle depth of field, crisp hero object, generous breathing room",
    color: "deep ink-blue base, single warm accent, muted supporting tones",
    size: "1344x768"
  },
  xiaohongshu: {
    medium: "bright knowledge-card background for a Xiaohongshu (RED) post cover",
    composition: "illustrated subject anchored in the lower two-thirds; the entire top third is flat, even negative space reserved for oversized headline typesetting; clean side margins",
    artDirection: "clean flat editorial illustration, subtle paper grain, friendly geometric shapes, slight hand-drawn warmth",
    color: "warm off-white or soft cream base, one saturated accent color, strong tonal separation between subject and copy zone",
    size: "768x1344"
  },
  zhihu: {
    medium: "knowledge-led explanation plate for a Zhihu long-form answer",
    composition: "a single explanatory subject centered in the right half with clear silhouette; the left half is quiet negative space for the headline; balanced, symmetrical-feeling structure",
    artDirection: "credible editorial illustration, precise line-and-shape language, calm analytical mood, subtle blueprint or diagram undertone",
    color: "paper-white base with calm blue accents, restrained gray tones",
    size: "1344x768"
  },
  moments: {
    medium: "warm square background plate for a WeChat Moments post",
    composition: "single focal subject centered with generous even margins on all four sides; corners kept quiet for corner-badge overlays",
    artDirection: "authentic personal-story feel, natural warm light, gentle depth, smartphone-photography credibility without looking candid-messy",
    color: "warm neutral base, one soft accent, film-like tonal roll-off",
    size: "1024x1024"
  },
  x: {
    medium: "bold scroll-stopping header plate for an X (Twitter) post",
    composition: "one striking subject rendered large but isolated, pushed to one side; at least half the frame is stark empty negative space for the headline",
    artDirection: "bold minimalism, high contrast, graphic single-idea visual, modern tech aesthetic",
    color: "near-black base with one electric accent, extreme tonal economy",
    size: "1344x768"
  },
  linkedin: {
    medium: "professional insight-header plate for a LinkedIn post",
    composition: "subject occupying the right 45%; the left 55% is composed, low-density negative space for the headline; stable horizontal structure",
    artDirection: "corporate editorial polish, clean geometric forms, restrained data-visualization undertone, confident business mood",
    color: "cool slate or navy base, single confident accent, no loud gradients",
    size: "1344x768"
  },
  instagram: {
    medium: "aspirational vertical background plate for an Instagram post",
    composition: "lifestyle subject filling the lower two-thirds with strong presence; the top third stays visually quiet for typesetting; subject leads the eye upward",
    artDirection: "influencer-grade visual storytelling, bold saturated color handled with discipline, crisp light, editorial framing",
    color: "one dominant saturated hue with a complementary accent, controlled palette",
    size: "864x1152"
  },
  facebook: {
    medium: "friendly share-card background plate for a Facebook post",
    composition: "approachable subject on the right half; the left half is open negative space for a clear headline; comfortable, uncluttered structure",
    artDirection: "warm community feel, honest inviting light, clear focal hierarchy",
    color: "warm friendly base tone, one clear accent",
    size: "1344x768"
  },
  reddit: {
    medium: "community-discussion header plate for a Reddit post",
    composition: "one relatable subject with character, off-center placement; broad even negative space around it for the headline",
    artDirection: "authentic internet-native visual, meme-aware but composed, slightly playful rendering",
    color: "neutral base with one punchy accent",
    size: "1344x768"
  },
  "product-hunt": {
    medium: "launch-day header plate for a Product Hunt debut",
    composition: "product or launch metaphor as the single hero on the right; left side kept as clean negative space for the headline; forward-tilting energy",
    artDirection: "startup launch energy, clean tech aesthetic, precise product-render polish, subtle upward motion",
    color: "light base with one vivid launch accent",
    size: "1344x768"
  },
  threads: {
    medium: "conversational vertical background plate for a Threads post",
    composition: "intimate subject in the lower half; upper half is calm negative space for the opening line; loose, breathing layout",
    artDirection: "warm conversational tone, soft light, authentic tactile texture",
    color: "muted warm palette, one gentle accent",
    size: "864x1152"
  },
  "hacker-news": {
    medium: "technical minimal header plate for a Hacker News submission",
    composition: "one stark technical metaphor isolated in the frame; overwhelming deliberate negative space; almost poster-like reduction",
    artDirection: "technical minimalism, terminal aesthetic, monospacing-inspired geometry, hacker-culture restraint",
    color: "off-white or near-black base, minimal accent usage",
    size: "1344x768"
  },
  "indie-hackers": {
    medium: "maker-story header plate for an Indie Hackers post",
    composition: "hands-on maker subject on one side; the other side is practical, uncluttered negative space for the headline",
    artDirection: "bootstrap-hustle authenticity, workbench materiality, pragmatic lighting",
    color: "earthy neutral base, one grounded accent",
    size: "1344x768"
  },
  "medium-substack": {
    medium: "thought-leadership header plate for a Medium or Substack essay",
    composition: "one contemplative conceptual subject off to one side; wide intellectual negative space elsewhere for the essay title",
    artDirection: "editorial illustration in the long-form-essay tradition, conceptual metaphor, painterly but disciplined",
    color: "literary muted palette, one ink accent",
    size: "1344x768"
  },
  default: {
    medium: "designed background plate for a social media cover",
    composition: "one clear focal subject; at least 40% of the frame kept as calm negative space for headline typesetting",
    artDirection: "contemporary editorial art direction, disciplined light, clear focal hierarchy",
    color: "restrained base palette with a single accent",
    size: "1344x768"
  }
};

/**
 * Native cover aspect for a platform, from the provider-validated size set
 * (mirrors /api/image/generate's allowedSizes so every provider in the chain
 * — Workers AI, Wan, Agnes — accepts it).
 */
export function coverImageSizeForPlatform(platform: string): string {
  return (PLATFORM_COVER_ART[platform] ?? PLATFORM_COVER_ART.default).size;
}

/**
 * Converts any model-authored image prompt into a background-only visual
 * brief, laid out per platform. All readable copy is rendered later by
 * CoverCanvas, so the image model never gets a chance to misspell a Chinese
 * headline or invent fake UI labels — but the plate itself still carries a
 * real design structure (subject zone, reserved copy zone, palette) instead
 * of devolving into ambient wallpaper.
 */
export function buildTextFreeVisualPrompt(prompt: string, platform: string): string {
  const cleanPrompt = prompt.trim().replace(/\s+/g, " ");
  const spec = PLATFORM_COVER_ART[platform] ?? PLATFORM_COVER_ART.default;

  return [
    `Create a ${spec.medium} — a structured design plate, not ambient wallpaper.`,
    `Subject: ${cleanPrompt}.`,
    `COMPOSITION: ${spec.composition}.`,
    `ART DIRECTION: ${spec.artDirection}.`,
    `COLOR: ${spec.color}.`,
    "BACKGROUND ART ONLY: absolutely no text, letters, words, typography, captions, numbers, logos, watermarks, signatures, UI labels, signs, posters, book covers, packaging copy, or readable screens.",
    "The reserved negative space must stay genuinely empty and low-detail so a separately typeset headline and subtitle remain fully legible over it, including under a dark gradient overlay.",
    "Do not draw a finished poster or add any graphic headline. Finfold will typeset every visible word after image generation."
  ].join(" ");
}

// Content generation intentionally does not call the image model. Cover Studio
// invokes /api/image/generate only after an explicit user action.
