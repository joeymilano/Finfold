-- 080: Commercial growth audit and accountable mission spine
-- Reuses growth_missions as the execution object while separating observed
-- website evidence, ranked opportunities, actions, and append-only events.

CREATE TABLE IF NOT EXISTS public.growth_audits (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url         text        NOT NULL,
  objective_type     text        NOT NULL,
  summary            text        NOT NULL,
  business_snapshot  jsonb       NOT NULL DEFAULT '{}',
  signals            jsonb       NOT NULL DEFAULT '[]',
  status             text        NOT NULL DEFAULT 'completed',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT growth_audits_objective_check
    CHECK (objective_type IN ('leads', 'signups', 'purchases')),
  CONSTRAINT growth_audits_status_check
    CHECK (status IN ('completed', 'superseded'))
);

CREATE INDEX IF NOT EXISTS growth_audits_user_created_idx
  ON public.growth_audits(user_id, created_at DESC);

ALTER TABLE public.growth_audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "growth audits: select own" ON public.growth_audits;
CREATE POLICY "growth audits: select own" ON public.growth_audits FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth audits: insert own" ON public.growth_audits;
CREATE POLICY "growth audits: insert own" ON public.growth_audits FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth audits: update own" ON public.growth_audits;
CREATE POLICY "growth audits: update own" ON public.growth_audits FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth audits: delete own" ON public.growth_audits;
CREATE POLICY "growth audits: delete own" ON public.growth_audits FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.growth_opportunities (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id              uuid        NOT NULL REFERENCES public.growth_audits(id) ON DELETE CASCADE,
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                text        NOT NULL DEFAULT 'proposed',
  rank                  integer     NOT NULL,
  title                 text        NOT NULL,
  evidence              text        NOT NULL,
  rationale             text        NOT NULL,
  mission_brief         text        NOT NULL,
  recommended_platform  text        NOT NULL,
  objective_type        text        NOT NULL,
  confidence            text        NOT NULL,
  mission_id            uuid        REFERENCES public.growth_missions(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT growth_opportunities_status_check CHECK (status IN ('proposed', 'accepted', 'dismissed')),
  CONSTRAINT growth_opportunities_rank_check CHECK (rank BETWEEN 1 AND 3),
  CONSTRAINT growth_opportunities_platform_check CHECK (recommended_platform IN ('xiaohongshu', 'linkedin', 'wechat')),
  CONSTRAINT growth_opportunities_objective_check CHECK (objective_type IN ('leads', 'signups', 'purchases')),
  CONSTRAINT growth_opportunities_confidence_check CHECK (confidence IN ('high', 'medium', 'low')),
  CONSTRAINT growth_opportunities_audit_rank_unique UNIQUE (audit_id, rank)
);

CREATE INDEX IF NOT EXISTS growth_opportunities_user_status_idx
  ON public.growth_opportunities(user_id, status, created_at DESC);

ALTER TABLE public.growth_opportunities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "growth opportunities: select own" ON public.growth_opportunities;
CREATE POLICY "growth opportunities: select own" ON public.growth_opportunities FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth opportunities: insert own" ON public.growth_opportunities;
CREATE POLICY "growth opportunities: insert own" ON public.growth_opportunities FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth opportunities: update own" ON public.growth_opportunities;
CREATE POLICY "growth opportunities: update own" ON public.growth_opportunities FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth opportunities: delete own" ON public.growth_opportunities;
CREATE POLICY "growth opportunities: delete own" ON public.growth_opportunities FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.growth_missions
  ADD COLUMN IF NOT EXISTS mission_kind text NOT NULL DEFAULT 'content_experiment',
  ADD COLUMN IF NOT EXISTS objective_type text,
  ADD COLUMN IF NOT EXISTS source_opportunity_id uuid REFERENCES public.growth_opportunities(id) ON DELETE SET NULL;

ALTER TABLE public.growth_missions DROP CONSTRAINT IF EXISTS growth_missions_metric_key_check;
ALTER TABLE public.growth_missions ADD CONSTRAINT growth_missions_metric_key_check
  CHECK (primary_metric_key IN (
    'impressions', 'cover_click_rate', 'average_view_seconds',
    'save_share_per_thousand', 'followers_per_thousand', 'leads', 'signups', 'revenue'
  ));

ALTER TABLE public.growth_missions DROP CONSTRAINT IF EXISTS growth_missions_objective_type_check;
ALTER TABLE public.growth_missions ADD CONSTRAINT growth_missions_objective_type_check
  CHECK (objective_type IS NULL OR objective_type IN ('leads', 'signups', 'purchases'));

CREATE INDEX IF NOT EXISTS growth_missions_source_opportunity_idx
  ON public.growth_missions(source_opportunity_id)
  WHERE source_opportunity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.mission_actions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id         uuid        NOT NULL REFERENCES public.growth_missions(id) ON DELETE CASCADE,
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind               text        NOT NULL,
  status             text        NOT NULL DEFAULT 'awaiting_approval',
  risk_level         text        NOT NULL DEFAULT 'low',
  requires_approval  boolean     NOT NULL DEFAULT true,
  input              jsonb       NOT NULL DEFAULT '{}',
  output             jsonb,
  error              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mission_actions_status_check
    CHECK (status IN ('queued', 'running', 'awaiting_approval', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT mission_actions_risk_check CHECK (risk_level IN ('low', 'medium', 'high'))
);

CREATE INDEX IF NOT EXISTS mission_actions_mission_created_idx
  ON public.mission_actions(mission_id, created_at);
ALTER TABLE public.mission_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mission actions: select own" ON public.mission_actions;
CREATE POLICY "mission actions: select own" ON public.mission_actions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "mission actions: insert own" ON public.mission_actions;
CREATE POLICY "mission actions: insert own" ON public.mission_actions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "mission actions: update own" ON public.mission_actions;
CREATE POLICY "mission actions: update own" ON public.mission_actions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "mission actions: delete own" ON public.mission_actions;
CREATE POLICY "mission actions: delete own" ON public.mission_actions FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.mission_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mission_id  uuid        NOT NULL REFERENCES public.growth_missions(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  text        NOT NULL,
  payload     jsonb       NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mission_events_mission_time_idx
  ON public.mission_events(mission_id, occurred_at);
ALTER TABLE public.mission_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mission events: select own" ON public.mission_events;
CREATE POLICY "mission events: select own" ON public.mission_events FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "mission events: insert own" ON public.mission_events;
CREATE POLICY "mission events: insert own" ON public.mission_events FOR INSERT WITH CHECK (auth.uid() = user_id);
