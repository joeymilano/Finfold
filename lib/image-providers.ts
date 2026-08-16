/**
 * Multi-provider chain for image generation, mirroring lib/llm-providers.ts.
 *
 * Cloudflare Workers AI's `ai` binding is blocked by the project's zero-cost
 * upgrade gate (see scripts/check-zero-cost-upgrade.mjs and
 * docs/zero-cost-upgrade-guardrails.md), so this calls the Workers AI REST
 * API directly instead of adding a Worker binding — no wrangler.toml change
 * needed for cost:check to keep passing.
 */

export type ImageProviderName = "workers-ai" | "agnes";

export type ImageProvider =
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
 * to Agnes via the existing provider-failover loop. Kept as a named
 * function (rather than inlining `true`) so a future size restriction has
 * one call site to change.
 */
export function workersAiSupportsSize(): boolean {
  return true;
}

/**
 * flux-2-klein-4b requires every reference/edit image
 * (input_image_0..input_image_3) to be smaller than 512x512 — anything
 * larger must skip straight to Agnes, which has no such limit.
 */
export const WORKERS_AI_MAX_REFERENCE_IMAGE_DIMENSION = 512;
/** The model accepts up to 4 reference images (input_image_0..3). */
export const WORKERS_AI_MAX_REFERENCE_IMAGES = 4;

/**
 * Resolves the ordered image-provider chain. Workers AI is preferred when
 * configured (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN, and not
 * explicitly disabled); Agnes AI follows as the existing fallback. Returns
 * an empty array only when NEITHER is configured, so isImageGenConfigured()
 * keeps returning its current false in that case.
 */
export function resolveImageProviders(): ImageProvider[] {
  const providers: ImageProvider[] = [];

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_AI_TOKEN;
  if (accountId && apiToken && process.env.IMAGE_WORKERS_AI_ENABLED !== "false") {
    providers.push({
      name: "workers-ai",
      kind: "cloudflare-rest",
      accountId,
      apiToken,
      model: process.env.IMAGE_WORKERS_AI_MODEL ?? "@cf/black-forest-labs/flux-2-klein-4b"
    });
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
