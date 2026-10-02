"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Create a Supabase browser client for client-side session management.
 *
 * IMPORTANT: This client uses the publishable (anon) key only.
 * The secret service-role key is NEVER exposed to the browser.
 * All privileged operations (sign-up, sign-in, password update, etc.)
 * are routed through backend API routes that use the secret key server-side.
 *
 * The browser client is kept for:
 *  - Listening to auth state changes (onAuthStateChange)
 *  - OAuth redirect handling (exchangeCodeForSession via /auth/callback)
 *  - Cookie-based session refresh
 */
export function createSupabaseBrowserClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Supabase browser config is missing.");
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
