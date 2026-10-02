/**
 * Minimal Server-Sent Events encoder for streaming route handlers.
 * Edge-runtime safe (TextEncoder is a standard Web API).
 */
export function encodeSSE(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no"
};
