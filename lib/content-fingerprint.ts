/**
 * Content input fingerprint — detects when a user re-requests the SAME
 * generation configuration (same product update + goal + persona + platforms
 * + language) so the UI can offer to open the existing kit instead of
 * charging another generation.
 *
 * Deliberately narrower than {@link hashGenerationRequest}: that one hashes
 * the whole payload to catch idempotency-key reuse; this one only covers the
 * fields that define "the same content request", so non-essential deltas
 * (brand brain tweaks, custom rule edits, media re-uploads) don't split the
 * dedup signal and create false negatives.
 *
 * The digest is persisted on content_kits.input_fingerprint (migration 075)
 * and indexed for an O(log n) duplicate lookup at the top of /api/generate.
 */
export interface ContentFingerprintInput {
  ideaText: string;
  goal: string;
  persona: string;
  platforms: readonly string[];
  language?: string;
}

/**
 * Normalize free text so trivial whitespace / casing diffs don't spawn a new
 * fingerprint. Lower-casing is safe here — the key is never shown back to the
 * user, it only drives an equality check — and it collapses the bulk of
 * accidental re-runs (retyped the same idea, trailing space, etc.).
 */
function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Stable, pre-hash key. Exposed (not just the digest) so callers can do cheap
 * client-side equality checks without a Web Crypto async hop, and so the
 * normalization rules have a single source of truth.
 */
export function contentInputKey(input: ContentFingerprintInput): string {
  return [
    normalizeText(input.ideaText),
    input.goal,
    input.persona,
    // Platform ORDER must not split fingerprints — generating [x, linkedin]
    // then [linkedin, x] is the same intent.
    [...input.platforms].sort().join(","),
    input.language ?? "auto"
  ].join("|");
}

/**
 * SHA-256 of {@link contentInputKey}, hex-encoded. Async because Web Crypto's
 * `digest` is async on both Cloudflare Workers and Node runtimes — matches the
 * shape of {@link hashGenerationRequest}.
 */
export async function contentInputFingerprint(input: ContentFingerprintInput): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(contentInputKey(input))
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
