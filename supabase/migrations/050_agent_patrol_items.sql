-- 050: Persistent Agent patrol queue
-- The scheduled Agent may discover and rank the user's next action while the
-- user is offline. It never publishes content or starts a Growth Mission:
-- each row is a reviewable, dismissible recommendation with one action URL.

CREATE TABLE IF NOT EXISTS public.agent_patrol_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'open',
  action_kind     text        NOT NULL,
  urgency         text        NOT NULL DEFAULT 'planned',
  title_zh        text        NOT NULL,
  title_en        text        NOT NULL,
  detail_zh       text        NOT NULL,
  detail_en       text        NOT NULL,
  evidence_zh     text        NOT NULL,
  evidence_en     text        NOT NULL,
  action_href     text        NOT NULL,
  fingerprint     text        NOT NULL,
  mission_id      uuid        REFERENCES public.growth_missions(id) ON DELETE SET NULL,
  source_state    jsonb       NOT NULL DEFAULT '{}',
  due_at          timestamptz,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_patrol_items_status_check
    CHECK (status IN ('open', 'done', 'dismissed', 'superseded')),
  CONSTRAINT agent_patrol_items_action_check
    CHECK (action_kind IN (
      'mission_generate',
      'mission_publish',
      'mission_measure',
      'mission_review',
      'measure_results',
      'review_drafts',
      'new_experiment',
      'first_measured_post'
    )),
  CONSTRAINT agent_patrol_items_urgency_check
    CHECK (urgency IN ('planned', 'today', 'overdue'))
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_patrol_one_open_user_idx
  ON public.agent_patrol_items(user_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS agent_patrol_user_created_idx
  ON public.agent_patrol_items(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_patrol_due_idx
  ON public.agent_patrol_items(due_at)
  WHERE status = 'open' AND due_at IS NOT NULL;

ALTER TABLE public.agent_patrol_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent patrol: select own" ON public.agent_patrol_items;
CREATE POLICY "agent patrol: select own"
  ON public.agent_patrol_items FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "agent patrol: insert own" ON public.agent_patrol_items;
CREATE POLICY "agent patrol: insert own"
  ON public.agent_patrol_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "agent patrol: update own" ON public.agent_patrol_items;
CREATE POLICY "agent patrol: update own"
  ON public.agent_patrol_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "agent patrol: delete own" ON public.agent_patrol_items;
CREATE POLICY "agent patrol: delete own"
  ON public.agent_patrol_items FOR DELETE
  USING (auth.uid() = user_id);
