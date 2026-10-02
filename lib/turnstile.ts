import { z } from "zod";
import { getClientIp } from "@/lib/rate-limit";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const turnstileResponseSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  "error-codes": z.array(z.string()).optional()
});

export type TurnstileVerification =
  | { valid: true }
  | { valid: false; reason: "not_configured" | "unavailable" | "rejected" };

export async function verifyTurnstileRequest(
  request: Request,
  input: {
    token: string;
    action: string;
    idempotencyKey: string;
  }
): Promise<TurnstileVerification> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const expectedHostnames = allowedTurnstileHostnames();
  if (!secret || expectedHostnames.size === 0) {
    return { valid: false, reason: "not_configured" };
  }
  if (!input.token || input.token.length > 2048) {
    return { valid: false, reason: "rejected" };
  }

  let response: Response;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret,
        response: input.token,
        remoteip: getClientIp(request),
        idempotency_key: input.idempotencyKey
      })
    });
  } catch {
    return { valid: false, reason: "unavailable" };
  }
  if (!response.ok) return { valid: false, reason: "unavailable" };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { valid: false, reason: "unavailable" };
  }
  const parsed = turnstileResponseSchema.safeParse(payload);
  if (!parsed.success) return { valid: false, reason: "unavailable" };
  if (
    parsed.data.success !== true
    || parsed.data.action !== input.action
    || !parsed.data.hostname
    || !expectedHostnames.has(parsed.data.hostname.toLowerCase())
  ) {
    return { valid: false, reason: "rejected" };
  }
  return { valid: true };
}

export function allowedTurnstileHostnames(): Set<string> {
  const hostnames = new Set<string>();
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredUrl) {
    try {
      hostnames.add(new URL(configuredUrl).hostname.toLowerCase());
    } catch {
      return new Set();
    }
  }
  if (process.env.NODE_ENV !== "production") {
    hostnames.add("localhost");
    hostnames.add("127.0.0.1");
  }
  return hostnames;
}
