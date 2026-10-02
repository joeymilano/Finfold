import { z } from "zod";

export const sourceImageProviderSchema = z.enum([
  "official_page",
  "official_social",
  "pexels",
  "pixabay",
  "user_upload",
  "ai",
  "legacy"
]);

export const sourceImageRightsStatusSchema = z.enum([
  "licensed",
  "official_unverified",
  "user_provided",
  "generated",
  "unknown"
]);

export const sourceImageConfidenceSchema = z.enum(["high", "medium", "low"]);

export const focalPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1)
});

/** A durable, first-party copy of the selected source image and its provenance. */
export const sourceImageAssetSchema = z.object({
  id: z.string().min(1).max(180),
  cachedUrl: z.string().url().max(2048),
  originalUrl: z.string().url().max(2048),
  pageUrl: z.string().url().max(2048),
  provider: sourceImageProviderSchema,
  title: z.string().max(300).optional(),
  domain: z.string().min(1).max(253),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  alt: z.string().max(500).optional(),
  rightsStatus: sourceImageRightsStatusSchema,
  attribution: z.string().max(500).optional(),
  confidence: sourceImageConfidenceSchema,
  focalPoint: focalPointSchema.optional(),
  capturedAt: z.string().datetime({ offset: true }),
  rightsConfirmedAt: z.string().datetime({ offset: true }).optional()
});

/** Per-output render state is intentionally separate from the reusable source. */
export const outputImageSourceSchema = sourceImageAssetSchema.extend({
  renderStatus: z.enum(["pending", "ready", "failed"]).optional(),
  renderAttemptCount: z.number().int().min(0).max(2).optional()
});

export const sourceImageCandidateSchema = z.object({
  id: z.string().min(1).max(180),
  originalUrl: z.string().url().max(2048),
  pageUrl: z.string().url().max(2048),
  provider: z.enum(["official_page", "official_social"]),
  title: z.string().max(300).optional(),
  domain: z.string().min(1).max(253),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  alt: z.string().max(500).optional(),
  confidence: sourceImageConfidenceSchema,
  focalPoint: focalPointSchema.optional(),
  score: z.number().finite(),
  selectionToken: z.string().min(20).max(12_000)
});

export const captureSourceSchema = z.object({
  url: z.string().url().max(2048),
  canonicalUrl: z.string().url().max(2048),
  domain: z.string().min(1).max(253),
  title: z.string().max(300),
  siteName: z.string().max(200).optional()
});

export type SourceImageAsset = z.infer<typeof sourceImageAssetSchema>;
export type OutputImageSource = z.infer<typeof outputImageSourceSchema>;
export type SourceImageCandidate = z.infer<typeof sourceImageCandidateSchema>;
export type CaptureSource = z.infer<typeof captureSourceSchema>;
export type VisualMode = "source_first" | "none" | "ai_generate";

export function requiresImageRightsConfirmation(
  source: Pick<SourceImageAsset, "rightsStatus" | "rightsConfirmedAt"> | null | undefined
): boolean {
  return Boolean(
    source
      && (source.rightsStatus === "official_unverified" || source.rightsStatus === "unknown")
      && !source.rightsConfirmedAt
  );
}

export function sourceImageIsReadyForPublishing(
  source: Pick<SourceImageAsset, "rightsStatus" | "rightsConfirmedAt"> | null | undefined
): boolean {
  return !requiresImageRightsConfirmation(source);
}

export function sameSourceImage(
  left: Pick<SourceImageAsset, "id" | "originalUrl"> | null | undefined,
  right: Pick<SourceImageAsset, "id" | "originalUrl"> | null | undefined
): boolean {
  return Boolean(left && right && (left.id === right.id || left.originalUrl === right.originalUrl));
}

/**
 * Source metadata sent while replacing a cover is descriptive, not an
 * authorization grant. Derive the rights state from the provider and always
 * discard a client-supplied confirmation timestamp.
 */
export function normalizeReplacementImageSource(
  source: OutputImageSource
): OutputImageSource {
  const { rightsConfirmedAt: _untrustedConfirmation, ...rest } = source;
  void _untrustedConfirmation;
  const rightsStatus = source.provider === "ai"
    ? "generated" as const
    : source.provider === "user_upload"
      ? "user_provided" as const
      : source.provider === "pexels" || source.provider === "pixabay"
        ? "licensed" as const
        : source.provider === "legacy"
          ? "unknown" as const
          : "official_unverified" as const;
  return { ...rest, rightsStatus };
}

/** Rejects client-authored hotlinks posing as cached source assets. */
export async function isOwnedCachedSourceImage(
  source: SourceImageAsset,
  userId: string
): Promise<boolean> {
  try {
    const storageBase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const cached = new URL(source.cachedUrl);
    if (cached.origin !== storageBase.origin || cached.protocol !== "https:") return false;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source.originalUrl));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const expectedSuffix = `/storage/v1/object/public/media/${userId}/source-images/${hash}`;
    return decodeURIComponent(cached.pathname).endsWith(expectedSuffix)
      && source.id === `source-${hash.slice(0, 24)}`;
  } catch {
    return false;
  }
}
