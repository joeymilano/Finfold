// Edge-compatible HMAC-SHA256 verification using Web Crypto API
// Works on Cloudflare Pages / Vercel Edge / any runtime with crypto.subtle

/**
 * Verify an HMAC-SHA256 signature (hex-encoded) against a payload and secret.
 * Used for Creem.io webhook verification (creem-signature header).
 *
 * @returns true if the signature matches
 */
export async function verifyHmacSHA256(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expectedHex = bufferToHex(sigBuffer);

  return timingSafeEqual(expectedHex, signature);
}

/** Convert an ArrayBuffer to a lowercase hex string */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Both strings must be the same length (both are hex-encoded SHA-256 = 64 chars).
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
