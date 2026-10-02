-- ============================================================
-- Migration 099: Source-first cover provenance and render state.
-- 098 is intentionally left untouched because it belongs to the parallel
-- social multi-account rollout.
-- ============================================================

ALTER TABLE public.content_kits
  ADD COLUMN IF NOT EXISTS visual_source jsonb;

ALTER TABLE public.kit_outputs
  ADD COLUMN IF NOT EXISTS image_source jsonb;

ALTER TABLE public.content_kits
  DROP CONSTRAINT IF EXISTS content_kits_visual_source_object_check;

ALTER TABLE public.content_kits
  ADD CONSTRAINT content_kits_visual_source_object_check
  CHECK (visual_source IS NULL OR jsonb_typeof(visual_source) = 'object');

ALTER TABLE public.kit_outputs
  DROP CONSTRAINT IF EXISTS kit_outputs_image_source_object_check;

ALTER TABLE public.kit_outputs
  ADD CONSTRAINT kit_outputs_image_source_object_check
  CHECK (image_source IS NULL OR jsonb_typeof(image_source) = 'object');

-- Preserve old covers as readable legacy assets. Their provenance and rights
-- cannot be inferred retroactively, so both stay explicitly unknown.
UPDATE public.kit_outputs
SET image_source = jsonb_build_object(
  'id', 'legacy-' || id::text,
  'cachedUrl', image_url,
  'originalUrl', image_url,
  'pageUrl', image_url,
  'provider', 'legacy',
  'domain', regexp_replace(image_url, '^https?://([^/]+).*$' , '\1'),
  'width', 0,
  'height', 0,
  'rightsStatus', 'unknown',
  'confidence', 'low',
  'capturedAt', COALESCE(created_at, now()),
  'renderStatus', 'ready',
  'renderAttemptCount', 0
)
WHERE image_url IS NOT NULL
  AND btrim(image_url) <> ''
  AND image_source IS NULL;

-- A kit-level source lets one explicit rights confirmation cover every output
-- that still uses the same selected image.
UPDATE public.content_kits AS kit
SET visual_source = (
  SELECT output.image_source
  FROM public.kit_outputs AS output
  WHERE output.kit_id = kit.id
    AND output.image_source IS NOT NULL
  ORDER BY output.created_at ASC
  LIMIT 1
)
WHERE kit.visual_source IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.kit_outputs AS output
    WHERE output.kit_id = kit.id
      AND output.image_source IS NOT NULL
  );

COMMENT ON COLUMN public.content_kits.visual_source IS
  'Selected source-first image provenance. Official source does not imply reuse rights.';

COMMENT ON COLUMN public.kit_outputs.image_source IS
  'Cover provenance plus pending, ready, or failed deterministic render state.';
