import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

type RateLimitOptions = {
  scope: string;
  limit: number;
  windowMs: number;
};

/**
 * Fast per-isolate abuse brake for accidental bursts and basic scripts before
 * an upstream auth/AI provider is called. It intentionally makes no claim of
 * distributed enforcement.
 */
export function enforceApiRateLimit(request: Request, options: RateLimitOptions): NextResponse | null {
  const ip = getClientIp(request);
  if (checkRateLimit(`${options.scope}:${ip}`, options.limit, options.windowMs)) {
    return null;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil(options.windowMs / 1000));
  return NextResponse.json(
    { error: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}
