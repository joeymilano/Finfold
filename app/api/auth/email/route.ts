
import { NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { getAuthCallbackUrl } from "@/lib/auth-callback-url";

/**
 * POST /api/auth/email
 *
 * Update the current user's email address.
 * The server client validates the session cookie before performing
 * the update, so the secret key is never exposed to the browser.
 *
 * Expected body: { email: string }
 */
export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, { scope: "auth:email", limit: 5, windowMs: 60 * 60 * 1000 });
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

  const email = body.email?.trim();

  if (!email) {
    return NextResponse.json(
      { error: "New email address is required." },
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

  // Verify the user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You must be logged in to update your email." },
      { status: 401 }
    );
  }

  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: getAuthCallbackUrl(request) }
  );

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to update email." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
