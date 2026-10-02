import { createClient } from "@supabase/supabase-js";

/**
 * Create a Supabase admin client that bypasses Row-Level Security.
 * This client uses the secret service-role key and should ONLY be used
 * on the server side — never exposed to the browser.
 *
 * Typical uses: creating users, updating profiles, reading subscription
 * data that the authenticated user should not access directly.
 *
 * Kept in a dedicated module (separate from lib/supabase.ts) because it
 * must NOT import next/headers: server utilities that are statically
 * reachable from client bundles (e.g. lib/llm via lib/agent/*) import
 * this file, and next/headers is only legal in Server Components.
 */
export function createSupabaseAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}
