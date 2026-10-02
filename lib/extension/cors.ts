import { NextResponse } from "next/server";

const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/([a-p]{32})$/;

export function normalizeExtensionOrigin(value: string | null | undefined): string | null {
  const candidate = value?.trim().toLowerCase();
  return candidate && EXTENSION_ORIGIN_PATTERN.test(candidate) ? candidate : null;
}

export function configuredExtensionOrigins(): Set<string> {
  return new Set(
    (process.env.FINFOLD_EXTENSION_ORIGINS ?? "")
      .split(",")
      .map((value) => normalizeExtensionOrigin(value))
      .filter((value): value is string => Boolean(value))
  );
}

export function isAllowedExtensionOrigin(value: string | null | undefined): boolean {
  const origin = normalizeExtensionOrigin(value);
  return Boolean(origin && configuredExtensionOrigins().has(origin));
}

/**
 * Chrome 153+ may label extension-context fetches with the opaque origin
 * "null" instead of chrome-extension://<id> (observed on side-panel POST
 * preflights). Every extension endpoint authenticates via Bearer tokens or
 * single-use PKCE codes — never ambient cookies — so an opaque origin alone
 * grants no authority. Real extension origins still require exact allowlist
 * membership.
 */
export function isAllowedExtensionRequestOrigin(value: string | null | undefined): boolean {
  return value === "null" || isAllowedExtensionOrigin(value);
}

function corsAllowValue(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin === "null") return "null";
  return isAllowedExtensionOrigin(origin) ? origin : null;
}

export function applyExtensionCors(request: Request, headers: Headers): void {
  const allow = corsAllowValue(request);
  if (!allow) return;

  headers.set("Access-Control-Allow-Origin", allow);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Idempotency-Key, X-Request-Id"
  );
  headers.set("Access-Control-Max-Age", "3600");
  headers.append("Vary", "Origin");
}

export function extensionJson(
  request: Request,
  body: unknown,
  init: { status?: number; headers?: HeadersInit } = {}
) {
  const response = NextResponse.json(body, init);
  applyExtensionCors(request, response.headers);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function extensionPreflight(request: Request) {
  if (!corsAllowValue(request)) {
    return new NextResponse(null, { status: 403 });
  }
  const response = new NextResponse(null, { status: 204 });
  applyExtensionCors(request, response.headers);
  return response;
}
