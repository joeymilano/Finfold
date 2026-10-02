-- 076: Evidence-first social account investigations
--
-- Stores the bounded diagnosis result and evidence provenance, never raw page
-- HTML, cookies, credentials, or authenticated browser state. The service role
-- writes snapshots after a user-triggered Agent investigation; users can read
-- and delete only their own history.

CREATE TABLE IF NOT EXISTS public.account_investigations (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform           text        NOT NULL,
  account_url        text        NOT NULL CHECK (char_length(account_url) <= 2048),
  concern            text        NOT NULL DEFAULT 'general',
  case_state         text        NOT NULL,
  confidence         text        NOT NULL,
  evidence_level     text        NOT NULL,
  collection_method  text        NOT NULL,
  evidence_summary   jsonb       NOT NULL DEFAULT '{}',
  report             jsonb       NOT NULL DEFAULT '{}',
  measured_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_investigations_platform_check
    CHECK (platform IN ('xiaohongshu', 'x')),
  CONSTRAINT account_investigations_concern_check
    CHECK (concern IN ('general', 'low_reach', 'suspected_restriction', 'suspended')),
  CONSTRAINT account_investigations_case_state_check
    CHECK (case_state IN (
      'healthy_or_normal_variance',
      'low_reach',
      'suspected_visibility_restriction',
      'confirmed_enforcement',
      'account_suspended',
      'profile_unavailable',
      'insufficient_evidence'
    )),
  CONSTRAINT account_investigations_confidence_check
    CHECK (confidence IN ('low', 'medium', 'high')),
  CONSTRAINT account_investigations_evidence_level_check
    CHECK (evidence_level IN ('link_only', 'public_profile', 'creator_analytics', 'platform_notice')),
  CONSTRAINT account_investigations_collection_method_check
    CHECK (collection_method IN ('public_web', 'unavailable'))
);

CREATE INDEX IF NOT EXISTS account_investigations_user_measured_idx
  ON public.account_investigations(user_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS account_investigations_user_platform_measured_idx
  ON public.account_investigations(user_id, platform, measured_at DESC);

ALTER TABLE public.account_investigations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account investigations: select own" ON public.account_investigations;
CREATE POLICY "account investigations: select own"
  ON public.account_investigations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "account investigations: delete own" ON public.account_investigations;
CREATE POLICY "account investigations: delete own"
  ON public.account_investigations FOR DELETE
  USING (auth.uid() = user_id);
