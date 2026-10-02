-- ============================================================
-- Migration 013: Persist custom brand guardrails server-side
--
-- Guardrails were previously localStorage-only (finfold-custom-guardrails),
-- so a customer configuring banned phrases on one device got none of that
-- enforcement on another device or a teammate's browser — silent
-- brand-compliance failure for a core feature. This mirrors the
-- brand_brains pattern: one row per user, upserted from the server.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.custom_guardrails (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  rules      jsonb       not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

ALTER TABLE public.custom_guardrails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom guardrails: select own" ON public.custom_guardrails;
CREATE POLICY "custom guardrails: select own"
  ON public.custom_guardrails FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "custom guardrails: insert own" ON public.custom_guardrails;
CREATE POLICY "custom guardrails: insert own"
  ON public.custom_guardrails FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "custom guardrails: update own" ON public.custom_guardrails;
CREATE POLICY "custom guardrails: update own"
  ON public.custom_guardrails FOR UPDATE
  USING (auth.uid() = user_id);
