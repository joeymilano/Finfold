-- 085: Multiplatform Account Health diagnosis
-- Extends the existing evidence-first investigation ledger without changing
-- tenant isolation or storing raw credentials/cookies.

ALTER TABLE public.account_investigations
  DROP CONSTRAINT IF EXISTS account_investigations_platform_check;
ALTER TABLE public.account_investigations
  ADD CONSTRAINT account_investigations_platform_check
  CHECK (platform IN ('xiaohongshu', 'x', 'reddit'));

ALTER TABLE public.account_investigations
  DROP CONSTRAINT IF EXISTS account_investigations_concern_check;
ALTER TABLE public.account_investigations
  ADD CONSTRAINT account_investigations_concern_check
  CHECK (concern IN ('general', 'low_reach', 'suspected_restriction', 'suspended', 'content_removed'));

ALTER TABLE public.account_investigations
  DROP CONSTRAINT IF EXISTS account_investigations_evidence_level_check;
ALTER TABLE public.account_investigations
  ADD CONSTRAINT account_investigations_evidence_level_check
  CHECK (evidence_level IN ('link_only', 'public_profile', 'content_sample', 'creator_analytics', 'platform_notice'));

ALTER TABLE public.account_investigations
  DROP CONSTRAINT IF EXISTS account_investigations_collection_method_check;
ALTER TABLE public.account_investigations
  ADD CONSTRAINT account_investigations_collection_method_check
  CHECK (collection_method IN ('public_web', 'unavailable', 'user_upload', 'oauth'));
