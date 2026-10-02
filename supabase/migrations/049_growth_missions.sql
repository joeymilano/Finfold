-- 049: Persistent Growth Missions
-- Binds an Agent diagnosis to one controlled content experiment, the
-- generated kit that executes it, and the real metric used to judge it.

CREATE TABLE IF NOT EXISTS public.growth_missions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform            text        NOT NULL,
  status              text        NOT NULL DEFAULT 'accepted',
  stage               text        NOT NULL,
  title               text        NOT NULL,
  hypothesis          text        NOT NULL,
  primary_metric      text        NOT NULL,
  primary_metric_key  text        NOT NULL,
  baseline_value      numeric     NOT NULL DEFAULT 0,
  target_value        numeric     NOT NULL DEFAULT 0,
  variants            jsonb       NOT NULL DEFAULT '[]',
  workbench_idea      text        NOT NULL,
  source_briefing     jsonb       NOT NULL DEFAULT '{}',
  kit_id              uuid        REFERENCES public.content_kits(id) ON DELETE SET NULL,
  verdict             text,
  outcome             jsonb,
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT growth_missions_status_check
    CHECK (status IN ('accepted', 'draft_ready', 'posted', 'completed', 'dismissed', 'superseded')),
  CONSTRAINT growth_missions_stage_check
    CHECK (stage IN ('measurement', 'distribution', 'click', 'retention', 'value', 'conversion')),
  CONSTRAINT growth_missions_metric_key_check
    CHECK (primary_metric_key IN ('impressions', 'cover_click_rate', 'average_view_seconds', 'save_share_per_thousand', 'followers_per_thousand')),
  CONSTRAINT growth_missions_verdict_check
    CHECK (verdict IS NULL OR verdict IN ('won', 'lost', 'inconclusive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS growth_missions_one_active_platform_idx
  ON public.growth_missions(user_id, platform)
  WHERE status IN ('accepted', 'draft_ready', 'posted');

CREATE INDEX IF NOT EXISTS growth_missions_user_created_idx
  ON public.growth_missions(user_id, created_at DESC);

ALTER TABLE public.content_kits
  ADD COLUMN IF NOT EXISTS growth_mission_id uuid REFERENCES public.growth_missions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS content_kits_growth_mission_idx
  ON public.content_kits(growth_mission_id)
  WHERE growth_mission_id IS NOT NULL;

ALTER TABLE public.growth_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "growth missions: select own" ON public.growth_missions;
CREATE POLICY "growth missions: select own"
  ON public.growth_missions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "growth missions: insert own" ON public.growth_missions;
CREATE POLICY "growth missions: insert own"
  ON public.growth_missions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "growth missions: update own" ON public.growth_missions;
CREATE POLICY "growth missions: update own"
  ON public.growth_missions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "growth missions: delete own" ON public.growth_missions;
CREATE POLICY "growth missions: delete own"
  ON public.growth_missions FOR DELETE
  USING (auth.uid() = user_id);
