-- ============================================================
-- 037: Persistent visual identity memory
--
-- Optional and backward-compatible. Existing users receive an empty object,
-- which the application interprets as zero-config automatic visual planning.
-- ============================================================

ALTER TABLE public.brand_brains
  ADD COLUMN IF NOT EXISTS visual_identity jsonb NOT NULL DEFAULT '{}'::jsonb;
