
import { NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";

const PROFILE_LOOKUP_TIMEOUT_MS = 2_500;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

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

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const userId = claims?.sub;

  if (!userId) {
    return NextResponse.json({ user: null });
  }

  const meta = record(claims.user_metadata);

  // Try to fetch profile data from the profiles table first
  let plan: string | null = null;
  let locale: string | null = null;
  const admin = createSupabaseAdminClient();
  if (admin) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROFILE_LOOKUP_TIMEOUT_MS);
    try {
      const { data: profileRow } = await admin
        .from("profiles")
        .select("plan, locale")
        .eq("id", userId)
        .abortSignal(controller.signal)
        .maybeSingle();

      if (profileRow) {
        plan = profileRow.plan;
        locale = profileRow.locale ?? null;
      }
    } catch (error) {
      console.warn("[auth/user] profile lookup unavailable; using token metadata", error);
    } finally {
      clearTimeout(timeout);
    }
  }

  // Fallback to user_metadata if profiles table doesn't exist or has no row
  if (plan === null) plan = typeof meta.plan === "string" ? meta.plan : "free";
  if (locale === null) locale = typeof meta.locale === "string" ? meta.locale : null;

  return NextResponse.json({
    user: {
      id: userId,
      email: typeof claims.email === "string" ? claims.email : "",
      avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
      plan,
      locale,
    }
  });
}
