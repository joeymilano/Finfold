-- 075_content_fingerprint.sql
-- Content configuration dedup: stores a SHA-256 fingerprint of each kit's
-- core generation input (idea text + goal + persona + platforms + language)
-- so /api/generate can detect "you already generated this exact combo" and
-- offer to open the existing kit instead of charging another run.
--
-- NOT a unique constraint — we never hard-block regeneration. The fingerprint
-- only powers a soft pre-check that the UI can override (force regenerate).
-- See lib/content-fingerprint.ts and the "duplicate" SSE event in
-- app/api/generate/route.ts.

ALTER TABLE public.content_kits
  ADD COLUMN IF NOT EXISTS input_fingerprint text;

-- Covering index for the duplicate lookup path used by /api/generate:
--   WHERE user_id = $1 AND input_fingerprint = $2 ORDER BY created_at DESC LIMIT 1
-- Partial (input_fingerprint IS NOT NULL) so legacy rows written before this
-- migration — and any future null-fingerprint rows — don't bloat the index.
CREATE INDEX IF NOT EXISTS idx_content_kits_input_fingerprint
  ON public.content_kits (user_id, input_fingerprint, created_at DESC)
  WHERE input_fingerprint IS NOT NULL;
