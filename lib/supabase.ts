import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
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
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        }
      }
    }
  );
}

/**
 * Create a Supabase admin client that bypasses Row-Level Security.
 * This client uses the secret service-role key and should ONLY be used
 * on the server side — never exposed to the browser.
 *
 * Typical uses: creating users, updating profiles, reading subscription
 * data that the authenticated user should not access directly.
 */
export function createSupabaseAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Return the current authenticated user ID from the session cookie.
 * Throws "Unauthorized" if no valid session is found.
 */
export async function getCurrentUserId(): Promise<string> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    if (process.env.NEXT_PUBLIC_ALLOW_MOCK === "true") {
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
