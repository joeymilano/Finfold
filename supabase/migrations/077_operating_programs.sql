-- 077: Business-first operating program setup.
--
-- One active program gives the Research -> Strategy -> Create -> Acquire flow
-- a durable definition of the offer, audience, conversion goal, qualification
-- rule, watchlist, cadence, and baseline. Platform-specific workflows can
-- reference this shared contract without duplicating onboarding data.

CREATE TABLE IF NOT EXISTS public.operating_programs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform            text        NOT NULL DEFAULT 'xiaohongshu',
  status              text        NOT NULL DEFAULT 'draft',
  offer               jsonb       NOT NULL DEFAULT '{}',
  audience            jsonb       NOT NULL DEFAULT '{}',
  objective           jsonb       NOT NULL DEFAULT '{}',
  qualified_lead_rule jsonb       NOT NULL DEFAULT '{}',
  watchlist           jsonb       NOT NULL DEFAULT '{"competitors":[],"keywords":[]}',
  cadence_per_week    integer     NOT NULL DEFAULT 3,
  baseline            jsonb       NOT NULL DEFAULT '{"publishedPosts":0,"qualifiedLeads":0,"wonRevenue":0}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operating_programs_user_platform_unique UNIQUE (user_id, platform),
  CONSTRAINT operating_programs_platform_check
    CHECK (platform IN ('xiaohongshu', 'linkedin', 'wechat')),
  CONSTRAINT operating_programs_status_check
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  CONSTRAINT operating_programs_cadence_check
    CHECK (cadence_per_week BETWEEN 2 AND 5),
  CONSTRAINT operating_programs_offer_object_check
    CHECK (jsonb_typeof(offer) = 'object'),
  CONSTRAINT operating_programs_audience_object_check
    CHECK (jsonb_typeof(audience) = 'object'),
  CONSTRAINT operating_programs_objective_object_check
    CHECK (jsonb_typeof(objective) = 'object'),
  CONSTRAINT operating_programs_qualified_lead_rule_object_check
    CHECK (jsonb_typeof(qualified_lead_rule) = 'object'),
  CONSTRAINT operating_programs_watchlist_object_check
    CHECK (jsonb_typeof(watchlist) = 'object'),
  CONSTRAINT operating_programs_baseline_object_check
    CHECK (jsonb_typeof(baseline) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS operating_programs_one_active_user_idx
  ON public.operating_programs(user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS operating_programs_user_updated_idx
  ON public.operating_programs(user_id, updated_at DESC);

ALTER TABLE public.operating_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operating programs: select own" ON public.operating_programs;
CREATE POLICY "operating programs: select own"
  ON public.operating_programs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "operating programs: insert own" ON public.operating_programs;
CREATE POLICY "operating programs: insert own"
  ON public.operating_programs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "operating programs: update own" ON public.operating_programs;
CREATE POLICY "operating programs: update own"
  ON public.operating_programs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "operating programs: delete own" ON public.operating_programs;
CREATE POLICY "operating programs: delete own"
  ON public.operating_programs FOR DELETE
  USING (auth.uid() = user_id);
