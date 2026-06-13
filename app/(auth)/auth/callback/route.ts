export const runtime = "edge";

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

// Completes the OAuth (Google) flow: exchanges the `?code=` returned by
// Supabase for a session cookie, then redirects into the dashboard.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(next, url.origin));
      }
    }
  }

  // Anything went wrong → back to login with a flag.
  return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
}
