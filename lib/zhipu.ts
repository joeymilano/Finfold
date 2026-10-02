import type { LLMProvider, LLMTaskPurpose } from "@/lib/llm-providers";

/** Time-bounded, server-only BigModel routing with explicit billing endpoint. */
export function getZhipuProvider(purpose: LLMTaskPurpose): LLMProvider | null {
  const apiKey = process.env.ZHIPU_API_KEY?.trim();
  if (process.env.ZHIPU_ENABLED !== "true" || !apiKey) return null;
  // The user authorized one month of discounted priority, not an indefinite
  // dependency. Missing/invalid deadlines fail closed to the existing chain.
  const expiresAt = Date.parse(process.env.ZHIPU_PRIORITY_EXPIRES_AT ?? "");
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return null;

  const mode = process.env.ZHIPU_API_MODE ?? "coding-plan";
  if (mode !== "coding-plan" && mode !== "standard") return null;
  const path = mode === "coding-plan" ? "/api/coding/paas/v4" : "/api/paas/v4";
  let url: URL;
  try {
    url = new URL(process.env.ZHIPU_API_BASE ?? `https://open.bigmodel.cn${path}`);
  } catch { return null; }
  // Never silently substitute standard usage billing for a plan endpoint, or
  // send a credential to a typo/proxy. Responses uses a different wire protocol.
  if (url.protocol !== "https:" || url.hostname !== "open.bigmodel.cn"
    || url.username || url.password || url.port || url.search || url.hash
    || ![path, `${path}/`].includes(url.pathname)) return null;

  const standard = process.env.ZHIPU_MODEL?.trim() || "glm-5.3-flash";
  const strong = process.env.ZHIPU_MODEL_STRONG?.trim() || "glm-5.3";
  // Vision is an explicit, separately verified opt-in: ZHIPU_VISION_MODEL
  // must name a model the configured endpoint actually accepts image_url
  // content parts for, re-verified live whenever the endpoint or model
  // changes. Video keeps its own gate so image-only setups never emit
  // video parts, and text routing stays untouched without the var.
  const visionModel = process.env.ZHIPU_VISION_MODEL?.trim() || undefined;
  return {
    name: "zhipu",
    apiBase: `${url.origin}${path}`,
    apiKey,
    models: purpose === "brand_strategist"
      ? { haiku: strong, sonnet: strong, opus: strong }
      : purpose === "agent"
        ? { haiku: standard, sonnet: strong, opus: strong }
        : { haiku: standard, sonnet: standard, opus: standard },
    visionModel,
    // Only enable each media capability after testing with the actual key.
    supportsVideo: Boolean(visionModel) && process.env.ZHIPU_VIDEO === "true",
    zhipu: true,
    jsonMode: "object",
    // A purchased subscription must never serve anonymous free-only traffic.
    costClass: "paid",
    maxAttempts: 1
  };
}
