-- 119: Jev reply-triage replay cache column.
--
-- The extension reply envelope gains an optional triage summary (audience
-- type + worth-replying probability). Persisting it in the 24h replay cache
-- keeps a replay byte-compatible with the original response; the comment
-- text itself is still never stored here.
ALTER TABLE public.extension_reply_results
  ADD COLUMN IF NOT EXISTS triage jsonb
  CHECK (triage IS NULL OR jsonb_typeof(triage) = 'object');
