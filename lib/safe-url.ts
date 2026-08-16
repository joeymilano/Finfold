import { logInfo } from "@/lib/observability";

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home"];
const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "instance-data"
]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SAFE_CROSS_ORIGIN_REDIRECT_HEADERS = [
  "accept",
  "accept-encoding",
  "accept-language",
  "range",
  "user-agent"
] as const;

export const HTML_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain"
] as const;

export const FEED_CONTENT_TYPES = [
  ...HTML_CONTENT_TYPES,
  "application/xml",
  "text/xml",
  "application/rss+xml",
  "application/atom+xml",
  "application/json"
] as const;

export const JSON_CONTENT_TYPES = [
  "application/json",
  "text/json"
] as const;

export const IMAGE_CONTENT_TYPES = ["image/*"] as const;

export type ExternalFetchPolicy = {
  maxRedirects?: number;
  timeoutMs?: number;
  allowedContentTypes?: readonly string[];
  auditPurpose?: string;
};

/**
 * Turns the domain formats people commonly paste (for example
 * "www.example.com") into an absolute URL before validating or fetching it.
 * Schemed URLs are left intact so validation can return the right message for
 * unsupported schemes such as file: or mailto:.
 */
export function normalizeExternalHttpUrl(input: string): string {
  const value = input.trim();
  if (!value || /^[a-z][a-z\d+.-]*:/i.test(value)) return value;
  return value.startsWith("//") ? `https:${value}` : `https://${value}`;
}

export function validateExternalHttpUrl(input: string): URL {
  if (input.length > 2048) throw new Error("URL is too long.");

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only HTTP and HTTPS URLs are allowed.");
  }
  if (url.username || url.password) throw new Error("URLs containing credentials are not allowed.");
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("Custom network ports are not allowed.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || BLOCKED_HOSTS.has(hostname) || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error("Private or local network addresses are not allowed.");
  }
  if (isBlockedIpv4(hostname) || isBlockedIpv6(hostname)) {
    throw new Error("Private or local network addresses are not allowed.");
  }

  return url;
}

/**
 * Fetches a public HTTP(S) resource with the common safety policy used by
 * every user-controlled remote URL:
 * - GET/HEAD only
 * - bounded lifetime
 * - manual, revalidated redirects
 * - no HTTPS downgrade
 * - no credential forwarding across origins
 * - optional final-response MIME allowlist
 *
 * Cloudflare applies an additional outbound-network boundary at runtime, but
 * this validation is still required so the same rules hold in local/dev
 * environments and before a request reaches the platform boundary.
 */
export async function safeExternalFetch(
  input: string,
  init: RequestInit = {},
  policy: ExternalFetchPolicy = {}
): Promise<Response> {
  const auditId = crypto.randomUUID();
  const startedAt = Date.now();
  const initialHost = auditHostname(input);
  let currentHost = initialHost;
  let redirectCount = 0;

  try {
    const method = (init.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      throw new Error("External fetches only support GET and HEAD requests.");
    }
    if (init.body != null) {
      throw new Error("External fetch requests cannot include a body.");
    }

    const maxRedirects = policy.maxRedirects ?? 3;
    const timeoutMs = policy.timeoutMs ?? 10_000;
    if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) {
      throw new Error("Invalid redirect limit.");
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
      throw new Error("Invalid external fetch timeout.");
    }

    let current = validateExternalHttpUrl(input);
    currentHost = current.hostname;
    let headers = new Headers(init.headers);
    const signal = composeAbortSignal(init.signal, timeoutMs);

    for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
      const response = await fetch(current, {
        ...init,
        method,
        headers: new Headers(headers),
        signal,
        cache: init.cache ?? "no-store",
        redirect: "manual"
      });
      if (!REDIRECT_STATUSES.has(response.status)) {
        assertAllowedContentType(response, policy.allowedContentTypes);
        auditExternalFetch({
          auditId,
          purpose: policy.auditPurpose,
          initialHost,
          finalHost: currentHost,
          redirectCount,
          durationMs: Date.now() - startedAt,
          outcome: "completed",
          status: response.status
        });
        return response;
      }

      const location = response.headers.get("location");
      if (!location) {
        auditExternalFetch({
          auditId,
          purpose: policy.auditPurpose,
          initialHost,
          finalHost: currentHost,
          redirectCount,
          durationMs: Date.now() - startedAt,
          outcome: "completed",
          status: response.status
        });
        return response;
      }
      if (redirects === maxRedirects) throw new Error("Too many redirects.");

      await response.body?.cancel().catch(() => undefined);
      const next = validateExternalHttpUrl(new URL(location, current).toString());
      if (current.protocol === "https:" && next.protocol !== "https:") {
        throw new Error("HTTPS redirects cannot downgrade to HTTP.");
      }
      if (current.origin !== next.origin) {
        const safeHeaders = new Headers();
        for (const name of SAFE_CROSS_ORIGIN_REDIRECT_HEADERS) {
          const value = headers.get(name);
          if (value !== null) safeHeaders.set(name, value);
        }
        headers = safeHeaders;
      }
      current = next;
      currentHost = current.hostname;
      redirectCount += 1;
    }

    throw new Error("Too many redirects.");
  } catch (error) {
    auditExternalFetch({
      auditId,
      purpose: policy.auditPurpose,
      initialHost,
      finalHost: currentHost,
      redirectCount,
      durationMs: Date.now() - startedAt,
      outcome: "failed",
      errorType: classifyExternalFetchError(error)
    });
    throw error;
  }
}

export async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes) throw new Error("Remote response is too large.");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Remote response is too large.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function readBytesWithLimit(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes) throw new Error("Remote response is too large.");
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Remote response is too large.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Copies bytes into a plain ArrayBuffer for Web APIs whose DOM types reject SharedArrayBuffer-backed views. */
export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && octets[2] === 100) ||
    (a === 203 && b === 0 && octets[2] === 113) ||
    a >= 224
  );
}

function isBlockedIpv6(hostname: string): boolean {
  if (!hostname.includes(":")) return false;
  const normalized = hostname.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("ff") || normalized.startsWith("2001:db8:")) return true;
  return false;
}

function composeAbortSignal(callerSignal: AbortSignal | null | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!callerSignal) return timeoutSignal;

  const abortSignalConstructor = AbortSignal as typeof AbortSignal & {
    any?: (signals: AbortSignal[]) => AbortSignal;
  };
  if (typeof abortSignalConstructor.any === "function") {
    return abortSignalConstructor.any([callerSignal, timeoutSignal]);
  }

  const controller = new AbortController();
  const forwardAbort = (source: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(source.reason);
  };
  if (callerSignal.aborted) {
    forwardAbort(callerSignal);
  } else if (timeoutSignal.aborted) {
    forwardAbort(timeoutSignal);
  } else {
    callerSignal.addEventListener("abort", () => forwardAbort(callerSignal), { once: true });
    timeoutSignal.addEventListener("abort", () => forwardAbort(timeoutSignal), { once: true });
  }
  return controller.signal;
}

function assertAllowedContentType(response: Response, allowedContentTypes?: readonly string[]): void {
  if (!allowedContentTypes?.length) return;

  const contentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const allowed = allowedContentTypes.some((candidate) => {
    const normalized = candidate.trim().toLowerCase();
    return normalized.endsWith("/*")
      ? contentType.startsWith(normalized.slice(0, -1))
      : contentType === normalized;
  });
  if (!contentType || !allowed) {
    throw new Error("Remote response has an unsupported content type.");
  }
}

type ExternalFetchAuditEvent = {
  auditId: string;
  purpose?: string;
  initialHost: string;
  finalHost: string;
  redirectCount: number;
  durationMs: number;
  outcome: "completed" | "failed";
  status?: number;
  errorType?: string;
};

function auditHostname(input: string): string {
  try {
    return new URL(input).hostname || "invalid";
  } catch {
    return "invalid";
  }
}

function classifyExternalFetchError(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
  if (!(error instanceof Error)) return "unknown";
  const message = error.message.toLowerCase();
  if (message.includes("private or local")) return "blocked_target";
  if (message.includes("redirect")) return "redirect_policy";
  if (message.includes("content type")) return "mime_policy";
  if (message.includes("too large")) return "response_too_large";
  if (error.name === "AbortError" || message.includes("abort")) return "aborted";
  return error.name || "error";
}

function auditExternalFetch(event: ExternalFetchAuditEvent): void {
  logInfo("external_fetch", undefined, {
    audit_id: event.auditId,
    purpose: event.purpose ?? "unspecified",
    initial_host: event.initialHost,
    final_host: event.finalHost,
    redirects: event.redirectCount,
    duration_ms: event.durationMs,
    outcome: event.outcome,
    status: event.status,
    error_type: event.errorType
  });
}
