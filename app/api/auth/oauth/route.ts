export const runtime = "edge";

import { NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";

/**
 * POST /api/auth/oauth
 *
 * Initiate an OAuth sign-in flow (e.g., Google).
 * The server client generates the OAuth URL with the correct redirect
 * callback, so the secret key is never exposed to the browser.
 *
 * Expected body: { provider: "google" | "github" | ... }
 */
export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Auth system not configured." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    provider?: string;
  };

  const provider = body.provider;

  if (!provider) {
    return NextResponse.json(
      { error: "OAuth provider is required." },
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

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as "google" | "github" | "azure" | "facebook" | "discord" | "twitter",
    options: {
      redirectTo: `${appUrl}/auth/callback`,
    },
  });

  if (error) {
    return NextResponse.json(
      { error: error.message || "OAuth sign-in failed." },
      { status: 400 }
    );
  }

  // Return the OAuth URL so the frontend can redirect the user
  return NextResponse.json({ url: data.url });
}
