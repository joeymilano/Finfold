-- ============================================================
-- Migration 031: Activation-code creator audit
--
-- Seed cohorts are generated from the private founder dashboard. Recording
-- the authenticated creator keeps that privileged action attributable while
-- preserving the existing single-use redemption behavior.
-- ============================================================

ALTER TABLE public.activation_codes
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS activation_codes_created_by_idx
  ON public.activation_codes(created_by, created_at DESC);
