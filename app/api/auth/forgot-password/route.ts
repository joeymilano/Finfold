
import { NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { getAuthCallbackUrl } from "@/lib/auth-callback-url";

/**
 * POST /api/auth/forgot-password
 *
 * Send a Supabase recovery email so the user can set a new password.
 * The recovery link lands on /auth/callback?next=/reset-password, which
 * exchanges the code for a session and forwards to the reset form.
 *
 * Expected body: { email: string }
 *
 * Anti-enumeration: the response is identical whether or not the address
 * has an account (Supabase's own enumeration protection is NOT guaranteed
 * across project settings, so we normalize here and never echo provider
 * errors for unknown addresses). Only provider delivery rate limits get a
 * distinguishable 429, consistent with /api/auth/signup's resend branch.
 */
export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, { scope: "auth:forgot-password", limit: 5, windowMs: 60 * 60 * 1000 });
  if (rateLimited) return rateLimited;

  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Auth system not configured." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
  };

  const email = body.email?.trim().toLowerCase();

  if (!email || !email.includes("@") || email.length > 320) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Auth system not available." },
      { status: 503 }
    );
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAuthCallbackUrl(request, undefined, "/reset-password", {
      mode: "login",
      method: "email"
    })
  });

  if (error) {
    // Delivery quotas are actionable for the user and say nothing about
    // account existence that the attacker doesn't already know (only an
    // address that just received several reset emails trips this).
    if (error.code === "over_email_send_rate_limit" || /rate limit/i.test(error.message)) {
      return NextResponse.json(
        { error: "Too many reset requests. Please wait a moment and try again.", retryAfter: 60 },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    // Everything else (unknown address, provider hiccup) → same shape as
    // success. Never log the email, only the provider error code.
    console.warn("[auth:forgot-password] request rejected", { provider_code: error.code ?? "unknown" });
  }

  return NextResponse.json({ ok: true });
}
