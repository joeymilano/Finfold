-- ============================================================
-- Migration 019: Learned style — the edit-learning loop
--
-- Every time a user edits an output's body, that before/after pair already
-- lands in output_edits (migration 015). This adds the other half: a
-- distilled, persistent list of style rules on brand_brains that future
-- generations read back — "it gets more like you every week" (plan §4
-- "编辑回路"). Capped at ~10 rules (enforced in application code, not here)
-- so the prompt injection stays small and the signal stays high-value.
-- ============================================================

ALTER TABLE public.brand_brains
  ADD COLUMN IF NOT EXISTS learned_style text[] NOT NULL DEFAULT '{}';
