import type { Page } from "@playwright/test";

export type BrowserFetchResponse = {
  status: number;
  body: unknown;
};

type BrowserFetchOptions = {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
};

/**
 * Run authenticated API probes inside the browser page. Playwright's Node
 * request fixture can include its Cookie header in timeout diagnostics; this
 * helper keeps the session in the browser and returns only status/body.
 */
export async function browserFetch(
  page: Page,
  path: string,
  options: BrowserFetchOptions = {}
): Promise<BrowserFetchResponse> {
  return page.evaluate(
    async ({ path, method, body, idempotencyKey, timeoutMs }): Promise<BrowserFetchResponse> => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(path, {
          method,
          headers: {
            ...(body === undefined ? {} : { "content-type": "application/json" }),
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal
        });
        const text = await response.text();
        let responseBody: unknown = null;
        if (text) {
          try {
            responseBody = JSON.parse(text);
          } catch {
            responseBody = text;
          }
        }
        return { status: response.status, body: responseBody };
      } finally {
        window.clearTimeout(timeout);
      }
    },
    {
      path,
      method: options.method ?? "GET",
      body: options.body,
      idempotencyKey: options.idempotencyKey,
      timeoutMs: options.timeoutMs ?? 15_000
    }
  );
}
