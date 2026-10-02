-- 048: Persistent account-level analytics memory for proactive agents
-- Xiaohongshu has no public analytics API. When a user uploads Creator Center
-- screenshots or pastes dashboard data, the Agent stores the normalized
-- snapshot so future briefings can continue from the last known account state.

CREATE TABLE IF NOT EXISTS public.account_performance_snapshots (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform                 text        NOT NULL,
  impressions              integer     NOT NULL DEFAULT 0,
  views                    integer     NOT NULL DEFAULT 0,
  cover_click_rate         numeric     NOT NULL DEFAULT 0,
  average_view_seconds     numeric     NOT NULL DEFAULT 0,
  likes                    integer     NOT NULL DEFAULT 0,
  comments                 integer     NOT NULL DEFAULT 0,
  saves                    integer     NOT NULL DEFAULT 0,
  shares                   integer     NOT NULL DEFAULT 0,
  follower_growth          integer     NOT NULL DEFAULT 0,
  profile_visits           integer     NOT NULL DEFAULT 0,
  report                   jsonb       NOT NULL DEFAULT '{}',
  source                   text        NOT NULL DEFAULT 'pasted_text',
  measured_at              timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_performance_snapshots_cover_ctr_check
    CHECK (cover_click_rate >= 0 AND cover_click_rate <= 100),
  CONSTRAINT account_performance_snapshots_source_check
    CHECK (source IN ('pasted_text', 'screenshot', 'screenshot_and_text'))
);

CREATE INDEX IF NOT EXISTS account_performance_snapshots_user_platform_measured_idx
  ON public.account_performance_snapshots(user_id, platform, measured_at DESC);

ALTER TABLE public.account_performance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account snapshots: select own" ON public.account_performance_snapshots;
CREATE POLICY "account snapshots: select own"
  ON public.account_performance_snapshots FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "account snapshots: insert own" ON public.account_performance_snapshots;
CREATE POLICY "account snapshots: insert own"
  ON public.account_performance_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "account snapshots: delete own" ON public.account_performance_snapshots;
CREATE POLICY "account snapshots: delete own"
  ON public.account_performance_snapshots FOR DELETE
  USING (auth.uid() = user_id);
