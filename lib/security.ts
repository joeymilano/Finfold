import {
  AVATAR_MULTIPART_MAX_BYTES,
  IMAGE_MULTIPART_MAX_BYTES,
  MCP_JSON_MAX_BYTES,
  MEDIA_MULTIPART_MAX_BYTES
} from "@/lib/bounded-form-data";
import { isAllowedExtensionOrigin } from "@/lib/extension/cors";

const ONE_MEGABYTE = 1024 * 1024;

const BODY_LIMIT_BYTES_BY_PATH = new Map<string, number>([
  // These shared limits mirror each route's actual stream parser and leave
  // bounded room for multipart framing around the route-level file allowance.
  ["/api/media", MEDIA_MULTIPART_MAX_BYTES],
  ["/api/agent/attachments", MEDIA_MULTIPART_MAX_BYTES],
  ["/api/mcp", MCP_JSON_MAX_BYTES],
  ["/api/auth/avatar", AVATAR_MULTIPART_MAX_BYTES],
  ["/api/capture/image", IMAGE_MULTIPART_MAX_BYTES]
]);

const COVER_UPLOAD_PATH = /^\/api\/kits\/[^/]+\/outputs\/[^/]+\/cover$/;

const SERVER_TO_SERVER_PATHS = new Set([
  "/api/webhooks/creem",
  "/api/performance/poll",
  "/api/performance/distill",
  "/api/agent/patrol",
  // Remote MCP clients are server-to-server and authenticate with their own
  // scoped Bearer token (app/api/mcp/route.ts), not browser cookies.
  "/api/mcp"
]);

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type SecurityDecision =
  | { allowed: true }
  | { allowed: false; status: 403 | 413; message: string };

function normalizedOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Rejects browser-originated cross-site mutations and oversized JSON bodies
 * before they reach auth, database, or LLM routes. Requests without an
 * Origin header are allowed because signed webhooks and cron Workers are
 * server-to-server; those routes authenticate with their own secrets.
 */
export function evaluateRequestSecurity(request: Request): SecurityDecision {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/") || !MUTATION_METHODS.has(request.method.toUpperCase())) {
    return { allowed: true };
  }

  const origin = normalizedOrigin(request.headers.get("origin"));
  const serverToServerRoute =
    SERVER_TO_SERVER_PATHS.has(url.pathname) || /^\/api\/watch-sources\/[^/]+\/check$/.test(url.pathname);
  if (origin && !serverToServerRoute) {
    const requestOrigin = url.origin;
    const configuredOrigin = normalizedOrigin(process.env.NEXT_PUBLIC_APP_URL);
    const localDevEquivalent = process.env.NODE_ENV !== "production" && areEquivalentLoopbackOrigins(origin, requestOrigin);
    const approvedExtensionRequest =
      url.pathname.startsWith("/api/extension/v1/") &&
      isAllowedExtensionOrigin(request.headers.get("origin"));
    if (
      origin !== requestOrigin &&
      origin !== configuredOrigin &&
      !localDevEquivalent &&
      !approvedExtensionRequest
    ) {
      return { allowed: false, status: 403, message: "Cross-site request blocked." };
    }
  }

  const bodyLimit =
    BODY_LIMIT_BYTES_BY_PATH.get(url.pathname) ??
    (COVER_UPLOAD_PATH.test(url.pathname) ? IMAGE_MULTIPART_MAX_BYTES : ONE_MEGABYTE);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > bodyLimit) {
    return { allowed: false, status: 413, message: "Request body is too large." };
  }

  return { allowed: true };
}

function areEquivalentLoopbackOrigins(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    return loopbackHosts.has(leftUrl.hostname) && loopbackHosts.has(rightUrl.hostname) && leftUrl.port === rightUrl.port;
  } catch {
    return false;
  }
}

function connectSource(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(): string {
  const connectSources = new Set([
    "'self'",
    "https://challenges.cloudflare.com",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    "https://us-assets.i.posthog.com",
    "https://eu-assets.i.posthog.com",
    connectSource(process.env.NEXT_PUBLIC_SUPABASE_URL),
    connectSource(process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com")
  ].filter((value): value is string => Boolean(value)));

  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    "https://challenges.cloudflare.com",
    "https://www.googletagmanager.com"
  ];
  if (process.env.NODE_ENV !== "production") scriptSources.push("'unsafe-eval'");

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    `connect-src ${Array.from(connectSources).join(" ")}`,
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    // The extension OAuth consent form POSTs same-origin, but Chrome 153+
    // enforces form-action across the 303 redirect too — without the
    // chromiumapp.org allowance the extension's launchWebAuthFlow callback is
    // blocked and sign-in dies with "Authorization page could not be loaded."
    "form-action 'self' https://*.chromiumapp.org",
    "frame-ancestors 'none'"
  ];
  if (process.env.NODE_ENV === "production") directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Apply browser hardening headers to both pages and API responses. */
export function applySecurityHeaders(headers: Headers, requestId = crypto.randomUUID()): void {
  headers.set("Content-Security-Policy", buildContentSecurityPolicy());
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  headers.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=(), payment=(self)");
  headers.set("X-Request-Id", requestId);

  if (process.env.NODE_ENV === "production") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}
