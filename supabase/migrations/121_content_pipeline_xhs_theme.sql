-- 121: Xiaohongshu card-channel polish. (a) Align
-- content_pipeline_settings.xhs_theme with the VisualStory theme enum —
-- migration 120 mistakenly defaulted it to a CoverStudio editorial theme id
-- ("indigo-porcelain") while the card pipeline renders through
-- VisualStoryCanvas (editorial | signal | field-notes). (b) Give the card
-- channel its own review-mode switch so zip-gating is not coupled to the
-- article channel's draft-box automation.

ALTER TABLE public.content_pipeline_settings
  ALTER COLUMN xhs_theme SET DEFAULT 'editorial';

UPDATE public.content_pipeline_settings
  SET xhs_theme = 'editorial'
  WHERE xhs_theme NOT IN ('editorial', 'signal', 'field-notes');

ALTER TABLE public.content_pipeline_settings
  ADD COLUMN IF NOT EXISTS xhs_review_mode text NOT NULL DEFAULT 'every_post';

ALTER TABLE public.content_pipeline_settings
  DROP CONSTRAINT IF EXISTS content_pipeline_settings_xhs_review_mode_check;

ALTER TABLE public.content_pipeline_settings
  ADD CONSTRAINT content_pipeline_settings_xhs_review_mode_check
    CHECK (xhs_review_mode IN ('every_post', 'jev_guarded'));
