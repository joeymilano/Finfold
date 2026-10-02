-- ============================================================
-- Migration 026: User-supplied X (Twitter) API credentials
--
-- Reddit/HN/Product Hunt backflow (migration 022) uses public endpoints or
-- an app-level token — no per-user credential needed. X has no free public
-- read API (Basic tier, $200/mo, is the cheapest tier that can read tweet
-- metrics), so this is opt-in: the user brings their own bearer token and
-- pays X directly; Finfold only stores and uses the token to poll metrics
-- for that same user's own published posts.
--
-- Deliberately NO RLS policy is created (RLS is enabled, but with zero
-- policies, Postgres denies ALL access by default) — every read/write of
-- this table goes through the admin (service-role) client from a server
-- route, so the token is never reachable via the anon/publishable key path
-- a browser session would use, and app/api/settings/integrations/route.ts
-- never returns the full token back to the client (see that route's GET).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_integrations (
  user_id         uuid        primary key references auth.users(id) on delete cascade,
  x_bearer_token  text,
  x_token_added_at timestamptz,
  updated_at      timestamptz not null default now()
);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
