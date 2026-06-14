export const runtime = "edge";

import { NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";

/**
 * POST /api/auth/login
 *
 * Sign in an existing user with email and password.
 * The server client sets the session cookie, so the secret key
 * is never exposed to the browser.
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

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Auth system not available." },
      { status: 503 }
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("invalid login credentials") || message.includes("invalid credentials")) {
      return NextResponse.json(
        { error: "Invalid email or password. Please check your credentials and try again." },
        { status: 401 }
      );
    }
    if (message.includes("email not confirmed")) {
      return NextResponse.json(
        { error: "Please confirm your email address before signing in. Check your inbox for the confirmation link." },
        { status: 403 }
      );
    }
    if (message.includes("too many requests")) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Login failed. Please try again." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    user: data.user
      ? {
          id: data.user.id,
          email: data.user.email,
        }
      : null,
  });
}
