/**
 * Minimal binding shapes used by the Next.js/OpenNext source tree.
 *
 * Full workerd runtime declarations intentionally stay out of the main
 * tsconfig because they override DOM fetch types (notably Response.json) and
 * make ordinary Next.js response payloads `unknown`.
 */
interface Queue<Body = unknown> {
  send(
    body: Body,
    options?: {
      contentType?: "text" | "bytes" | "json" | "v8";
      delaySeconds?: number;
    }
  ): Promise<unknown>;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface CloudflareEnv {
  GENERATION_QUEUE: Queue<import("@/lib/generation-jobs").GenerationJobMessage>;
  ASSETS: Fetcher;
  GENERATION_WORKER_SECRET: string;
}
