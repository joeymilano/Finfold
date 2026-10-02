-- 114: X pipeline "jev_guarded" review mode.
--
-- Third review mode alongside every_post / spot_check: a Jev (TypeSafe
-- System One) decision call gates each generated job. High-confidence
-- content is auto-approved through the same approve transition as a human
-- click (fingerprint re-pinned); everything else stays in the human queue.
-- Jev outages fail closed to needs_approval. auto_review stores the
-- decision audit trail rendered in the review console.

ALTER TABLE public.x_pipeline_settings
  DROP CONSTRAINT IF EXISTS x_pipeline_settings_review_mode_check;
ALTER TABLE public.x_pipeline_settings
  ADD CONSTRAINT x_pipeline_settings_review_mode_check
    CHECK (review_mode IN ('every_post', 'spot_check', 'jev_guarded'));

ALTER TABLE public.x_publication_jobs
  ADD COLUMN IF NOT EXISTS auto_review jsonb
  CHECK (auto_review IS NULL OR jsonb_typeof(auto_review) = 'object');
