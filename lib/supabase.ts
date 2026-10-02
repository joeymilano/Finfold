import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Check whether the required Supabase environment variables are present.
 * The server-side client uses the publishable (anon) key for cookie-based
 * session management, while the admin client uses the secret service-role key.
 */
export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Create a Supabase server client that reads/writes auth cookies.
 * This client uses the publishable (anon) key so that Row-Level Security
 * policies are enforced, and session state is carried in cookies.
 */
export async function createSupabaseServerClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components receive a read-only cookie store. Session refreshes are
            // still persisted by middleware, which runs before these components render.
          }
        }
      }
    }
  );
}

/**
 * Create a Supabase admin client that bypasses Row-Level Security.
 * Defined in lib/supabase-admin.ts (no next/headers) so that modules
 * statically reachable from client bundles can use it safely.
 */
export { createSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Return the current authenticated user ID from the session cookie.
 * Throws "Unauthorized" if no valid session is found.
 */
export async function getCurrentUserId(): Promise<string> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    // Server-only (not NEXT_PUBLIC_*) and explicitly restricted to non-production,
    // so a stray `true` in a preview/staging deploy config can't let every
    // anonymous visitor authenticate as the same shared "local-preview-user".
    if (process.env.NODE_ENV !== "production" && process.env.ALLOW_MOCK === "true") {
      return "local-preview-user";
    }
    throw new Error("Unauthorized");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user.id;
}
