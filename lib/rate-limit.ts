/**
 * Best-effort in-memory rate limiter.
 *
 * Cloudflare Workers run each request on one of many isolated
 * instances with no shared memory between them, so this only throttles
 * traffic that happens to land on the same isolate — it raises the cost
 * of casual abuse but is NOT a hard cap. A real cap needs a shared store
 * (Cloudflare KV/D1) and/or Turnstile in front of the route.
 */

type Bucket = { count: number; resetAt: number };

const globalRef = globalThis as typeof globalThis & { __finfoldRateLimit?: Map<string, Bucket> };

const buckets: Map<string, Bucket> =
  globalRef.__finfoldRateLimit ?? (globalRef.__finfoldRateLimit = new Map());

/**
 * Returns true if `key` is currently within its allowance, and records
 * this call against the window. `windowMs` is the sliding-window size;
 * `limit` is the max calls allowed per window.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  return true;
}

/** Best-effort client identifier from Cloudflare/standard proxy headers. */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
