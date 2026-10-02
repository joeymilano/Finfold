/**
 * Minimal edge-compatible PostHog capture for server-side events (e.g. the
 * Creem webhook's "paid" event, which has no browser context to call
 * posthog-js from). Uses the plain HTTP capture endpoint instead of the
 * posthog-node SDK, which relies on Node APIs not available on the edge
 * runtime.
 */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
  delivery?: { idempotencyKey: string; timestamp: string }
): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) {
    return;
  }

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  try {
    const uuid = delivery ? await analyticsEventUuid(delivery.idempotencyKey) : undefined;
    const response = await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(2500),
      body: JSON.stringify({
        api_key: apiKey,
        ...(delivery ? { uuid, timestamp: delivery.timestamp } : {}),
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: "finfold-server" }
      })
    });
    if (!response.ok) console.warn(`[posthog-server] capture rejected: ${response.status}`);
  } catch (error) {
    // Analytics must never break the calling flow (billing, webhooks, etc.)
    console.error(`[posthog-server] failed to capture "${event}":`, error);
  }
}

/** Stable, valid UUID for at-least-once delivery of one persisted event. */
export async function analyticsEventUuid(key: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
