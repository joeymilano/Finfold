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
  properties?: Record<string, unknown>
): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) {
    return;
  }

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: "finfold-server" }
      })
    });
  } catch (error) {
    // Analytics must never break the calling flow (billing, webhooks, etc.)
    console.error(`[posthog-server] failed to capture "${event}":`, error);
  }
}
