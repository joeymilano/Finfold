-- ============================================================
-- Migration 016: Brand Memory URL bootstrap metadata
--
-- Pro+ plans can populate Brand Memory from a product URL instead of
-- typing every field by hand (plan §4 "Bootstrap 回路"). These columns
-- track where an auto-filled brain came from and when, so the UI can show
-- "imported from your site on <date>" and so a future re-bootstrap can
-- diff against what was auto-extracted vs. hand-edited afterward.
-- ============================================================

ALTER TABLE public.brand_brains
  ADD COLUMN IF NOT EXISTS source_url text;

ALTER TABLE public.brand_brains
  ADD COLUMN IF NOT EXISTS auto_extracted boolean NOT NULL DEFAULT false;

ALTER TABLE public.brand_brains
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz;
