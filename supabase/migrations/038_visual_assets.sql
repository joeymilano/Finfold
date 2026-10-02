-- ============================================================
-- 038: Persisted visual assets per generated output
--
-- Stores article illustrations (and leaves room for future carousel pages)
-- as first-class content-kit data. Generated files live in the existing
-- public `media` bucket; this table stores placement, provenance, and the
-- metadata required for export and later performance learning.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.visual_assets (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kit_id            uuid        NOT NULL REFERENCES public.content_kits(id) ON DELETE CASCADE,
  output_id         uuid        NOT NULL REFERENCES public.kit_outputs(id) ON DELETE CASCADE,
  platform          text        NOT NULL,
  asset_type        text        NOT NULL CHECK (asset_type IN ('article_illustration')),
  position_index    integer     NOT NULL CHECK (position_index >= 0 AND position_index < 12),
  visual_role       text        NOT NULL CHECK (visual_role IN ('concept', 'process', 'comparison', 'evidence')),
  source_excerpt    text        NOT NULL DEFAULT '',
  placement_hint    text        NOT NULL DEFAULT '',
  prompt            text        NOT NULL DEFAULT '',
  image_url         text        NOT NULL,
  alt_text          text        NOT NULL DEFAULT '',
  metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (output_id, asset_type, position_index)
);

CREATE INDEX IF NOT EXISTS visual_assets_output_idx
  ON public.visual_assets(output_id, position_index);
CREATE INDEX IF NOT EXISTS visual_assets_kit_idx
  ON public.visual_assets(kit_id);

ALTER TABLE public.visual_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visual assets: select own" ON public.visual_assets;
CREATE POLICY "visual assets: select own"
  ON public.visual_assets FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "visual assets: insert own" ON public.visual_assets;
CREATE POLICY "visual assets: insert own"
  ON public.visual_assets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "visual assets: update own" ON public.visual_assets;
CREATE POLICY "visual assets: update own"
  ON public.visual_assets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "visual assets: delete own" ON public.visual_assets;
CREATE POLICY "visual assets: delete own"
  ON public.visual_assets FOR DELETE
  USING (auth.uid() = user_id);
