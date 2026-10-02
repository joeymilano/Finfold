-- ============================================================
-- 040: Version history for generated article illustrations
--
-- Regeneration now creates a recoverable version instead of overwriting the
-- previous image. Only one version per placement is current at a time.
-- ============================================================

ALTER TABLE public.visual_assets
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

ALTER TABLE public.visual_assets
  DROP CONSTRAINT IF EXISTS visual_assets_output_id_asset_type_position_index_key;

CREATE UNIQUE INDEX IF NOT EXISTS visual_assets_one_current_version_idx
  ON public.visual_assets(output_id, asset_type, position_index)
  WHERE is_current;

CREATE UNIQUE INDEX IF NOT EXISTS visual_assets_revision_idx
  ON public.visual_assets(output_id, asset_type, position_index, revision);

CREATE INDEX IF NOT EXISTS visual_assets_history_idx
  ON public.visual_assets(output_id, position_index, revision DESC);
