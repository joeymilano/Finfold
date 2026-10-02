-- 064_human_writing_quality.sql
-- Persist the server-side human-writing rule version used for every new kit.
-- `quality_scores.score_version` already exists (migration 023); the app now
-- writes version 2 when the Human Voice dimension is present.

ALTER TABLE public.content_kits
  ADD COLUMN IF NOT EXISTS human_writing_version text;

CREATE INDEX IF NOT EXISTS content_kits_human_writing_version_created_idx
  ON public.content_kits(human_writing_version, created_at DESC)
  WHERE human_writing_version IS NOT NULL;