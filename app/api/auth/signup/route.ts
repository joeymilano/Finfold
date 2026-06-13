export const runtime = "edge";

import { NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";

/**
 * POST /api/auth/signup
 *
 * Register a new user with email and password.
 * The Supabase server client handles session cookie management,
 * so the secret key is never exposed to the browser.
 *
 * Expected body: { email: string, password: string }
 */
export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Auth system not configured." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };

  const email = body.email?.trim();
  const password = body.password;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback`,
      data: {
        plan: "free",
      },
    },
  });

  if (error) {
    // Map common Supabase error messages to user-friendly messages
    const message = error.message.toLowerCase();
    if (message.includes("already registered") || message.includes("user already registered")) {
      return NextResponse.json(
        { error: "This email is already registered. Try logging in instead." },
        { status: 409 }
      );
    }
    if (message.includes("password")) {
      return NextResponse.json(
        { error: "Password does not meet requirements." },
        { status: 400 }
      );
    }
    if (message.includes("email")) {
      return NextResponse.json(
        { error: "Invalid email address." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Sign-up failed. Please try again." },
      { status: 400 }
    );
  }

  // Check if email confirmation is required
  const needsConfirmation = !data.session && data.user && !data.user.confirmed_at;

  return NextResponse.json({
    user: data.user
      ? {
          id: data.user.id,
          email: data.user.email,
        }
      : null,
    session: data.session
      ? {
          access_token: data.session.access_token,
        }
      : null,
    needsConfirmation,
  });
}
