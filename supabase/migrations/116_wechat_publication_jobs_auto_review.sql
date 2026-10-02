-- 116: Jev pre-approval content review for WeChat publication jobs.
--
-- Scheduling a publication first asks Jev (TypeSafe System One) five typed
-- questions (fabricated data / clickbait hype / compliance risk / AI tell /
-- quality) about the rendered snapshot. A pass stores the audit record
-- here; a block returns 409 findings to the studio, overridable per
-- account with an explicit confirm. Jev outages fail open — a human is
-- clicking approve at that moment.
ALTER TABLE public.wechat_publication_jobs
  ADD COLUMN IF NOT EXISTS auto_review jsonb
  CHECK (auto_review IS NULL OR jsonb_typeof(auto_review) = 'object');
