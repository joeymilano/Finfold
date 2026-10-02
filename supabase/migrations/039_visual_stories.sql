-- ============================================================
-- 039: Cross-device visual-story drafts
--
-- Keeps the current carousel/storyboard attached to its source output so
-- users can continue on another device without managing a separate asset.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.visual_stories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kit_id      uuid        NOT NULL REFERENCES public.content_kits(id) ON DELETE CASCADE,
  output_id   uuid        NOT NULL REFERENCES public.kit_outputs(id) ON DELETE CASCADE,
  platform    text        NOT NULL,
  story_json  jsonb       NOT NULL,
  format_id   text        NOT NULL,
  revision    integer     NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (output_id)
);

CREATE INDEX IF NOT EXISTS visual_stories_kit_idx
  ON public.visual_stories(kit_id);

ALTER TABLE public.visual_stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visual stories: select own" ON public.visual_stories;
CREATE POLICY "visual stories: select own"
  ON public.visual_stories FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "visual stories: insert own" ON public.visual_stories;
CREATE POLICY "visual stories: insert own"
  ON public.visual_stories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "visual stories: update own" ON public.visual_stories;
CREATE POLICY "visual stories: update own"
  ON public.visual_stories FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "visual stories: delete own" ON public.visual_stories;
CREATE POLICY "visual stories: delete own"
  ON public.visual_stories FOR DELETE
  USING (auth.uid() = user_id);
