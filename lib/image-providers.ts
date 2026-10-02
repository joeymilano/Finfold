/**
 * Multi-provider chain for image generation, mirroring lib/llm-providers.ts.
 *
 * Provider order is purpose-aware: scarce Pro quota and higher-quality models
 * are reserved for manually requested covers, while article illustrations use
 * the lower-cost standard pool. Cloudflare remains hard-capped to its free
 * daily Neuron allocation, and Agnes is the independent last-resort fallback.
 * Cloudflare is still called through REST rather than a paid Worker binding
 * (see docs/zero-cost-upgrade-guardrails.md).
 */

export type ImageProviderName =
  | "dashscope-free-qwen-image-pro"
  | "dashscope-free-qwen-image"
  | "dashscope-qwen-image-pro"
  | "dashscope-qwen-image"
  | "dashscope-wan-pro"
  | "dashscope-wan"
  | "workers-ai"
  | "agnes";

export type ImageGenerationPurpose = "cover" | "illustration";

export interface ResolveImageProvidersOptions {
  purpose?: ImageGenerationPurpose;
  hasReferenceImage?: boolean;
}

export type ImageProvider =
  | {
      name:
        | "dashscope-free-qwen-image-pro"
        | "dashscope-free-qwen-image"
        | "dashscope-qwen-image-pro"
        | "dashscope-qwen-image"
        | "dashscope-wan-pro"
        | "dashscope-wan";
      kind: "dashscope-multimodal";
      apiBase: string;
      apiKey: string;
      model: string;
      requestStyle: "qwen-image" | "wan";
      outputResolution: "native" | "2k";
      thinkingMode?: boolean;
    }
  | {
      name: "workers-ai";
      kind: "cloudflare-rest";
      accountId: string;
      apiToken: string;
      model: string;
    }
  | {
      name: "agnes";
      kind: "openai-compatible";
      apiBase: string;
      apiKey: string;
      model: string;
    };

/**
 * Confirmed via Cloudflare's own changelog example (the model page's
 * schema viewer only shows the collapsed { body, contentType } shape and
 * doesn't document this inline): flux-2-klein-4b's multipart body accepts
 * `width`/`height` fields directly, alongside `prompt`. Every size string
 * is usable — a request the model actually rejects still fails safely over
 * to the next configured provider. Kept as a named
 * function (rather than inlining `true`) so a future size restriction has
 * one call site to change.
 */
export function workersAiSupportsSize(): boolean {
  return true;
}

/**
 * flux-2-klein-4b requires every reference/edit image
 * (input_image_0..input_image_3) to be smaller than 512x512 — anything
 * larger must skip Workers AI and continue through the DashScope/Agnes chain.
 */
export const WORKERS_AI_MAX_REFERENCE_IMAGE_DIMENSION = 512;
/** The model accepts up to 4 reference images (input_image_0..3). */
export const WORKERS_AI_MAX_REFERENCE_IMAGES = 4;

/**
 * Resolves an ordered provider chain for the requested image purpose.
 *
 * Cover without a reference:
 *   free Qwen Pro -> capped FLUX.2 Klein 9B -> paid Qwen Pro at the native
 *   ~1 MP social size -> paid Qwen Standard -> Wan Standard -> Agnes.
 * Cover with a brand/product reference:
 *   free Qwen Pro -> Wan Pro -> paid Qwen Pro -> paid Qwen Standard ->
 *   Wan Standard -> Agnes.
 * Illustration:
 *   free Qwen Standard -> capped FLUX.2 Klein 4B -> paid Qwen Standard ->
 *   Wan Standard -> Agnes.
 *
 * This keeps the scarce Pro free quota and paid quality uplift focused on the
 * most visible asset, while low-cost batch illustrations never consume it.
 */
export function resolveImageProviders(options: ResolveImageProvidersOptions = {}): ImageProvider[] {
  const purpose = options.purpose ?? "cover";
  const hasReferenceImage = options.hasReferenceImage === true;
  const providers: ImageProvider[] = [];

  const freeApiKey = process.env.DASHSCOPE_FREE_API_KEY ?? process.env.DASHSCOPE_API_KEY;
  let freeProProvider: ImageProvider | null = null;
  let freeStandardProvider: ImageProvider | null = null;
  if (freeApiKey && process.env.IMAGE_DASHSCOPE_FREE_ENABLED !== "false") {
    const freeApiBase = (
      process.env.IMAGE_DASHSCOPE_FREE_API_BASE ?? "https://dashscope.aliyuncs.com"
    ).replace(/\/$/, "");
    freeProProvider = {
      name: "dashscope-free-qwen-image-pro",
      kind: "dashscope-multimodal",
      apiBase: freeApiBase,
      apiKey: freeApiKey,
      model: process.env.IMAGE_DASHSCOPE_FREE_PRO_MODEL ?? "qwen-image-3.0-pro",
      requestStyle: "qwen-image",
      outputResolution: "2k"
    };
    freeStandardProvider = {
      name: "dashscope-free-qwen-image",
      kind: "dashscope-multimodal",
      apiBase: freeApiBase,
      apiKey: freeApiKey,
      model: process.env.IMAGE_DASHSCOPE_FREE_MODEL ?? "qwen-image-3.0",
      requestStyle: "qwen-image",
      outputResolution: "2k"
    };
  }

  const dashscopeApiKey = process.env.DASHSCOPE_API_KEY;
  const dashscopeEnabled = Boolean(dashscopeApiKey) && process.env.IMAGE_DASHSCOPE_ENABLED !== "false";
  const workspaceApiBase = (
    process.env.IMAGE_DASHSCOPE_API_BASE ?? "https://dashscope.aliyuncs.com"
  ).replace(/\/$/, "");
  const paidQwenProProvider: ImageProvider | null = dashscopeEnabled
    ? {
        name: "dashscope-qwen-image-pro",
        kind: "dashscope-multimodal",
        apiBase: workspaceApiBase,
        apiKey: dashscopeApiKey!,
        model: process.env.IMAGE_DASHSCOPE_QWEN_PRO_MODEL ?? "qwen-image-3.0-pro",
        requestStyle: "qwen-image",
        // Finfold's native social sizes are all <= 1 MP. Keeping paid Pro at
        // that size selects the lower 1K price tier without downscaling the
        // final asset users actually publish.
        outputResolution: "native"
      }
    : null;
  const paidQwenProvider: ImageProvider | null = dashscopeEnabled
    ? {
        name: "dashscope-qwen-image",
        kind: "dashscope-multimodal",
        apiBase: workspaceApiBase,
        apiKey: dashscopeApiKey!,
        model: process.env.IMAGE_DASHSCOPE_QWEN_MODEL ?? "qwen-image-3.0",
        requestStyle: "qwen-image",
        // Standard Qwen has the same Beijing list price at 1K and 2K.
        outputResolution: "2k"
      }
    : null;
  const wanProProvider: ImageProvider | null = dashscopeEnabled
    ? {
        name: "dashscope-wan-pro",
        kind: "dashscope-multimodal",
        apiBase: workspaceApiBase,
        apiKey: dashscopeApiKey!,
        model: process.env.IMAGE_DASHSCOPE_WAN_PRO_MODEL ?? "wan2.7-image-pro",
        requestStyle: "wan",
        outputResolution: "2k",
        thinkingMode: process.env.IMAGE_DASHSCOPE_THINKING !== "false"
      }
    : null;
  const wanProvider: ImageProvider | null = dashscopeEnabled
    ? {
        name: "dashscope-wan" as const,
        kind: "dashscope-multimodal" as const,
        apiBase: workspaceApiBase,
        apiKey: dashscopeApiKey!,
        model: process.env.IMAGE_DASHSCOPE_MODEL ?? "wan2.7-image",
        requestStyle: "wan" as const,
        outputResolution: "2k" as const,
        thinkingMode: process.env.IMAGE_DASHSCOPE_THINKING !== "false"
      }
    : null;

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_AI_TOKEN;
  const workersProvider: ImageProvider | null = accountId && apiToken && process.env.IMAGE_WORKERS_AI_ENABLED !== "false"
    ? {
      name: "workers-ai",
      kind: "cloudflare-rest",
      accountId,
      apiToken,
      model: purpose === "cover"
        ? process.env.IMAGE_WORKERS_AI_COVER_MODEL ?? "@cf/black-forest-labs/flux-2-klein-9b"
        : process.env.IMAGE_WORKERS_AI_MODEL ?? "@cf/black-forest-labs/flux-2-klein-4b"
    }
    : null;

  if (purpose === "cover") {
    if (freeProProvider) providers.push(freeProProvider);
    if (hasReferenceImage) {
      // Wan Pro's brand-color and multi-reference strengths justify the Pro
      // price only when the user actually supplied brand/product evidence.
      if (wanProProvider) providers.push(wanProProvider);
      if (paidQwenProProvider) providers.push(paidQwenProProvider);
    } else {
      // Klein 9B gets first use of the already-approved free Neuron pool for
      // high-value covers; the model-aware estimator prevents paid overage.
      if (workersProvider) providers.push(workersProvider);
      if (paidQwenProProvider) providers.push(paidQwenProProvider);
    }
    if (paidQwenProvider) providers.push(paidQwenProvider);
    if (wanProvider) providers.push(wanProvider);
  } else {
    if (freeStandardProvider) providers.push(freeStandardProvider);
    if (workersProvider) providers.push(workersProvider);
    if (paidQwenProvider) providers.push(paidQwenProvider);
    if (wanProvider) providers.push(wanProvider);
  }

  const agnesApiKey = process.env.IMAGE_API_KEY;
  if (agnesApiKey) {
    providers.push({
      name: "agnes",
      kind: "openai-compatible",
      apiBase: process.env.IMAGE_API_BASE ?? "https://apihub.agnes-ai.com",
      apiKey: agnesApiKey,
      model: process.env.IMAGE_MODEL ?? "agnes-image-2.1-flash"
    });
  }

  return providers;
}
