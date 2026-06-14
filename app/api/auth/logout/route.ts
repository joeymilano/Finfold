export const runtime = "edge";

import { NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";

/**
 * POST /api/auth/logout
 *
 * Sign out the current user by invalidating the session cookie.
 * The server client handles clearing the cookie.
 */
export async function POST() {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ ok: true });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    return NextResponse.json(
      { error: error.message || "Logout failed." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
