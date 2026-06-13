export const runtime = "edge";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";

/**
 * GET /api/auth/user
 *
 * Return the current authenticated user's profile information.
 * Uses the server client to read the session cookie, then fetches
 * additional profile data using the admin client.
 *
 * Profile data (plan, locale) is stored in two places:
 *  1. The `profiles` table (if it exists) — preferred
 *  2. `user_metadata` — fallback when the profiles table hasn't been
 *     created yet
 *
 * This dual-source approach means the app works immediately after
 * connecting Supabase, even before running the SQL migration.
 */
export async function GET() {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ user: null });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ user: null });
  }

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ user: null });
  }

  // Try to fetch profile data from the profiles table first
  let plan: string | null = null;
  let locale: string | null = null;

  const admin = createSupabaseAdminClient();
  if (admin) {
    const { data: profileRow } = await admin
      .from("profiles")
      .select("plan, locale")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profileRow) {
      plan = profileRow.plan;
      locale = profileRow.locale ?? null;
    }
  }

  // Fallback to user_metadata if profiles table doesn't exist or has no row
  const meta = authUser.user_metadata ?? {};
  if (plan === null) plan = meta.plan ?? "free";
  if (locale === null) locale = meta.locale ?? null;

  return NextResponse.json({
    user: {
      id: authUser.id,
      email: authUser.email,
      avatarUrl: meta.avatar_url ?? null,
      plan,
      locale,
    },
  });
}
