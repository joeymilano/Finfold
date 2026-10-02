-- ============================================================
-- Migration 027: Industry rule packs (opt-in compliance libraries)
--
-- Users can now toggle built-in industry rule packs (medical, legal,
-- advertising, finance — see lib/industry-rules/) on top of their own
-- custom guardrails. custom_guardrails is already one row per user, so
-- this just adds which pack ids are enabled; the pack content itself
-- lives in code (lib/industry-rules/*.ts), not the database, so it can be
-- extended by shipping a new deploy rather than a migration.
-- ============================================================

ALTER TABLE public.custom_guardrails
  ADD COLUMN IF NOT EXISTS enabled_packs text[] NOT NULL DEFAULT '{}';
