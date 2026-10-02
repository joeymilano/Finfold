-- 081: Mission execution, attribution, and outcome ledger
-- Gives every commercial Growth Mission a deterministic state, a public
-- tracking link, and append-only outcome events that can be rolled up into
-- visits, leads, signups, purchases, and revenue.

ALTER TABLE public.growth_missions
  ADD COLUMN IF NOT EXISTS execution_state text NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS tracking_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.growth_missions DROP CONSTRAINT IF EXISTS growth_missions_execution_state_check;
ALTER TABLE public.growth_missions ADD CONSTRAINT growth_missions_execution_state_check
  CHECK (execution_state IN (
    'planned', 'generating', 'awaiting_decision', 'running', 'measuring', 'completed', 'closed'
  ));

-- Preserve the lifecycle of missions created before this state machine
-- existed. The default only represents genuinely accepted/planned work.
UPDATE public.growth_missions
SET execution_state = CASE status
  WHEN 'draft_ready' THEN 'awaiting_decision'
  WHEN 'posted' THEN 'measuring'
  WHEN 'completed' THEN 'completed'
  WHEN 'dismissed' THEN 'closed'
  WHEN 'superseded' THEN 'closed'
  ELSE 'planned'
END
WHERE execution_state = 'planned'
  AND status <> 'accepted';

CREATE TABLE IF NOT EXISTS public.tracking_links (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id         uuid        NOT NULL REFERENCES public.growth_missions(id) ON DELETE CASCADE,
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code               text        NOT NULL UNIQUE,
  destination_url    text        NOT NULL,
  source             text        NOT NULL,
  medium             text        NOT NULL DEFAULT 'organic_social',
  campaign           text        NOT NULL,
  content            text,
  status             text        NOT NULL DEFAULT 'active',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tracking_links_status_check CHECK (status IN ('active', 'disabled')),
  CONSTRAINT tracking_links_mission_unique UNIQUE (mission_id)
);

CREATE INDEX IF NOT EXISTS tracking_links_user_created_idx
  ON public.tracking_links(user_id, created_at DESC);

ALTER TABLE public.tracking_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tracking links: select own" ON public.tracking_links;
CREATE POLICY "tracking links: select own" ON public.tracking_links FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "tracking links: insert own" ON public.tracking_links;
CREATE POLICY "tracking links: insert own" ON public.tracking_links FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "tracking links: update own" ON public.tracking_links;
CREATE POLICY "tracking links: update own" ON public.tracking_links FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "tracking links: delete own" ON public.tracking_links;
CREATE POLICY "tracking links: delete own" ON public.tracking_links FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.outcome_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id       uuid        NOT NULL REFERENCES public.growth_missions(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tracking_link_id uuid        REFERENCES public.tracking_links(id) ON DELETE SET NULL,
  event_type       text        NOT NULL,
  source           text        NOT NULL DEFAULT 'finfold',
  visitor_id       text,
  lead_id          text,
  quantity         integer     NOT NULL DEFAULT 1,
  value            numeric     NOT NULL DEFAULT 0,
  currency         text        NOT NULL DEFAULT 'CNY',
  metadata         jsonb       NOT NULL DEFAULT '{}',
  dedupe_key       text,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outcome_events_type_check
    CHECK (event_type IN ('view', 'click', 'lead', 'signup', 'trial', 'purchase', 'revenue')),
  CONSTRAINT outcome_events_quantity_check CHECK (quantity BETWEEN 1 AND 10000),
  CONSTRAINT outcome_events_value_check CHECK (value >= 0),
  CONSTRAINT outcome_events_currency_check CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS outcome_events_dedupe_idx
  ON public.outcome_events(mission_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS outcome_events_mission_time_idx
  ON public.outcome_events(mission_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS outcome_events_user_time_idx
  ON public.outcome_events(user_id, occurred_at DESC);

ALTER TABLE public.outcome_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "outcome events: select own" ON public.outcome_events;
CREATE POLICY "outcome events: select own" ON public.outcome_events FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "outcome events: insert own" ON public.outcome_events;
CREATE POLICY "outcome events: insert own" ON public.outcome_events FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.mission_actions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'finfold',
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

DROP INDEX IF EXISTS public.mission_actions_idempotency_idx;
CREATE UNIQUE INDEX mission_actions_idempotency_idx
  ON public.mission_actions(mission_id, idempotency_key);

-- Adopt active missions created under migration 080 into the decision inbox.
-- Both inserts are rerunnable because their predicates and idempotency keys
-- describe one deterministic next action per mission.
INSERT INTO public.mission_actions (
  mission_id, user_id, kind, status, risk_level, requires_approval,
  input, provider, idempotency_key, created_at, updated_at
)
SELECT
  mission.id,
  mission.user_id,
  'prepare_execution_draft',
  'awaiting_approval',
  'low',
  true,
  jsonb_build_object(
    'workbenchIdea', mission.workbench_idea,
    'platform', mission.platform
  ),
  'finfold_studio',
  'prepare-execution-draft:' || mission.id::text,
  now(),
  now()
FROM public.growth_missions mission
WHERE mission.status = 'accepted'
  AND mission.kit_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.mission_actions action
    WHERE action.mission_id = mission.id
      AND action.kind = 'prepare_execution_draft'
  );

INSERT INTO public.mission_actions (
  mission_id, user_id, kind, status, risk_level, requires_approval,
  input, provider, idempotency_key, created_at, updated_at
)
SELECT
  mission.id,
  mission.user_id,
  'review_and_publish',
  'awaiting_approval',
  'medium',
  true,
  jsonb_build_object('kitId', mission.kit_id),
  'manual_channel',
  'review-and-publish:' || mission.id::text,
  now(),
  now()
FROM public.growth_missions mission
WHERE mission.status = 'draft_ready'
  AND mission.kit_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.mission_actions action
    WHERE action.mission_id = mission.id
      AND action.kind = 'review_and_publish'
  );

-- Keep the execution ledger attached to the mission row itself. Application
-- routes update one source-of-truth row; this trigger creates the matching
-- action/event records in the same database transaction.
CREATE OR REPLACE FUNCTION public.sync_growth_mission_execution_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := COALESCE(NEW.updated_at, now());
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.mission_actions (
      mission_id, user_id, kind, status, risk_level, requires_approval,
      input, provider, idempotency_key, created_at, updated_at
    ) VALUES (
      NEW.id, NEW.user_id, 'prepare_execution_draft', 'awaiting_approval',
      'low', true,
      jsonb_build_object('workbenchIdea', NEW.workbench_idea, 'platform', NEW.platform),
      'finfold_studio', 'prepare-execution-draft:' || NEW.id::text, v_now, v_now
    ) ON CONFLICT (mission_id, idempotency_key) DO NOTHING;

    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      NEW.id,
      NEW.user_id,
      'mission_created',
      jsonb_build_object('missionKind', NEW.mission_kind, 'platform', NEW.platform),
      v_now
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'draft_ready'
     AND NEW.kit_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.kit_id IS DISTINCT FROM NEW.kit_id) THEN
    UPDATE public.mission_actions
    SET status = 'succeeded',
        output = jsonb_build_object('kitId', NEW.kit_id),
        completed_at = v_now,
        updated_at = v_now
    WHERE mission_id = NEW.id
      AND user_id = NEW.user_id
      AND kind = 'prepare_execution_draft'
      AND status IN ('queued', 'running', 'awaiting_approval');

    INSERT INTO public.mission_actions (
      mission_id, user_id, kind, status, risk_level, requires_approval,
      input, provider, idempotency_key, created_at, updated_at
    ) VALUES (
      NEW.id, NEW.user_id, 'review_and_publish', 'awaiting_approval',
      'medium', true, jsonb_build_object('kitId', NEW.kit_id),
      'manual_channel', 'review-and-publish:' || NEW.id::text, v_now, v_now
    )
    ON CONFLICT (mission_id, idempotency_key) DO UPDATE
      SET input = EXCLUDED.input,
          status = CASE
            WHEN public.mission_actions.status IN ('failed', 'cancelled') THEN 'awaiting_approval'
            ELSE public.mission_actions.status
          END,
          updated_at = EXCLUDED.updated_at;

    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (NEW.id, NEW.user_id, 'draft_ready', jsonb_build_object('kitId', NEW.kit_id), v_now);
  END IF;

  IF NEW.status = 'posted' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.mission_actions
    SET status = 'succeeded',
        output = jsonb_build_object('platform', NEW.platform, 'publication', 'confirmed_by_user'),
        completed_at = v_now,
        updated_at = v_now
    WHERE mission_id = NEW.id
      AND user_id = NEW.user_id
      AND kind = 'review_and_publish'
      AND status IN ('awaiting_approval', 'running');

    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      NEW.id,
      NEW.user_id,
      'distribution_confirmed',
      jsonb_build_object('platform', NEW.platform, 'source', 'user_confirmation'),
      v_now
    );
  END IF;

  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      NEW.id,
      NEW.user_id,
      'mission_completed',
      jsonb_build_object(
        'metric', NEW.primary_metric_key,
        'actualValue', NEW.outcome -> 'actualValue',
        'targetValue', NEW.target_value,
        'verdict', NEW.verdict
      ),
      v_now
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS growth_mission_execution_ledger ON public.growth_missions;
CREATE TRIGGER growth_mission_execution_ledger
AFTER INSERT OR UPDATE OF status, kit_id ON public.growth_missions
FOR EACH ROW EXECUTE FUNCTION public.sync_growth_mission_execution_ledger();

CREATE OR REPLACE FUNCTION public.apply_mission_action_decision(
  p_user_id uuid,
  p_mission_id uuid,
  p_action_id uuid,
  p_decision text,
  p_workbench_href text DEFAULT NULL,
  p_execution_state text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action public.mission_actions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_decision NOT IN ('approve', 'cancel') THEN
    RAISE EXCEPTION 'Invalid mission decision.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_action
  FROM public.mission_actions
  WHERE id = p_action_id AND mission_id = p_mission_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission action not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_action.status <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'This action is no longer waiting for approval.' USING ERRCODE = 'P0001';
  END IF;

  IF p_decision = 'cancel' THEN
    UPDATE public.mission_actions
    SET status = 'cancelled', completed_at = v_now, updated_at = v_now
    WHERE id = p_action_id AND user_id = p_user_id;

    UPDATE public.growth_missions
    SET status = 'dismissed', execution_state = 'closed', updated_at = v_now
    WHERE id = p_mission_id AND user_id = p_user_id;

    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      p_mission_id,
      p_user_id,
      'action_cancelled',
      jsonb_build_object('actionId', p_action_id, 'kind', v_action.kind),
      v_now
    );
    RETURN 'cancelled';
  END IF;

  IF v_action.kind NOT IN ('prepare_execution_draft', 'review_and_publish') THEN
    RAISE EXCEPTION 'This action type cannot be executed here yet.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.mission_actions
  SET status = 'running',
      output = jsonb_build_object('workbenchHref', p_workbench_href, 'execution', 'opened_studio'),
      attempt_count = attempt_count + 1,
      started_at = v_now,
      completed_at = NULL,
      updated_at = v_now
  WHERE id = p_action_id AND user_id = p_user_id;

  UPDATE public.growth_missions
  SET execution_state = p_execution_state, updated_at = v_now
  WHERE id = p_mission_id AND user_id = p_user_id;

  INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
  VALUES (
    p_mission_id,
    p_user_id,
    'action_approved',
    jsonb_build_object('actionId', p_action_id, 'kind', v_action.kind, 'next', p_workbench_href),
    v_now
  );
  RETURN 'approved';
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_mission_tracking_link(
  p_user_id uuid,
  p_mission_id uuid,
  p_code text,
  p_destination_url text,
  p_source text,
  p_medium text,
  p_campaign text,
  p_content text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existed boolean;
  v_now timestamptz := now();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.growth_missions WHERE id = p_mission_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Growth Mission not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tracking_links WHERE mission_id = p_mission_id AND user_id = p_user_id
  ) INTO v_existed;

  INSERT INTO public.tracking_links (
    mission_id, user_id, code, destination_url, source, medium,
    campaign, content, status, created_at, updated_at
  ) VALUES (
    p_mission_id, p_user_id, p_code, p_destination_url, p_source, p_medium,
    p_campaign, p_content, 'active', v_now, v_now
  )
  ON CONFLICT (mission_id) DO UPDATE
    SET destination_url = EXCLUDED.destination_url,
        source = EXCLUDED.source,
        medium = EXCLUDED.medium,
        campaign = EXCLUDED.campaign,
        content = EXCLUDED.content,
        status = 'active',
        updated_at = EXCLUDED.updated_at;

  UPDATE public.growth_missions
  SET tracking_enabled = true, updated_at = v_now
  WHERE id = p_mission_id AND user_id = p_user_id;

  INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
  VALUES (
    p_mission_id,
    p_user_id,
    CASE WHEN v_existed THEN 'tracking_link_updated' ELSE 'tracking_enabled' END,
    jsonb_build_object('destinationUrl', p_destination_url, 'source', p_source, 'campaign', p_campaign),
    v_now
  );
  RETURN v_existed;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_mission_outcome(
  p_user_id uuid,
  p_mission_id uuid,
  p_event_type text,
  p_quantity integer,
  p_value numeric,
  p_currency text,
  p_note text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mission public.growth_missions%ROWTYPE;
  v_inserted integer := 0;
  v_actual numeric := 0;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_mission
  FROM public.growth_missions
  WHERE id = p_mission_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Growth Mission not found.' USING ERRCODE = 'P0002';
  END IF;

  IF p_event_type = 'revenue' AND EXISTS (
    SELECT 1 FROM public.outcome_events
    WHERE mission_id = p_mission_id
      AND user_id = p_user_id
      AND event_type = 'revenue'
      AND currency <> p_currency
  ) THEN
    RAISE EXCEPTION 'Revenue for this mission uses a different currency.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.outcome_events (
    mission_id, user_id, event_type, source, quantity, value, currency,
    metadata, dedupe_key, occurred_at
  ) VALUES (
    p_mission_id, p_user_id, p_event_type, 'manual', p_quantity,
    CASE WHEN p_event_type = 'revenue' THEN p_value ELSE 0 END,
    p_currency,
    CASE WHEN p_note = '' THEN '{}'::jsonb ELSE jsonb_build_object('note', p_note) END,
    p_idempotency_key,
    v_now
  )
  ON CONFLICT (mission_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      p_mission_id,
      p_user_id,
      'outcome_recorded',
      jsonb_build_object(
        'eventType', p_event_type,
        'count', p_quantity,
        'value', p_value,
        'currency', p_currency,
        'source', 'manual'
      ),
      v_now
    );
  END IF;

  SELECT CASE v_mission.primary_metric_key
    WHEN 'leads' THEN COALESCE(SUM(quantity) FILTER (WHERE event_type = 'lead'), 0)
    WHEN 'signups' THEN COALESCE(SUM(quantity) FILTER (WHERE event_type = 'signup'), 0)
    WHEN 'revenue' THEN COALESCE(SUM(value) FILTER (WHERE event_type = 'revenue'), 0)
    ELSE 0
  END
  INTO v_actual
  FROM public.outcome_events
  WHERE mission_id = p_mission_id AND user_id = p_user_id;

  IF v_actual >= v_mission.target_value AND v_mission.status <> 'completed' THEN
    UPDATE public.growth_missions
    SET status = 'completed',
        execution_state = 'completed',
        verdict = 'won',
        outcome = jsonb_build_object(
          'actualValue', v_actual,
          'baselineValue', 0,
          'targetValue', v_mission.target_value,
          'measuredAt', v_now,
          'explanation', 'The recorded mission result reached its target.'
        ),
        completed_at = v_now,
        updated_at = v_now
    WHERE id = p_mission_id AND user_id = p_user_id;
  ELSIF v_mission.status <> 'completed' THEN
    UPDATE public.growth_missions
    SET execution_state = 'measuring', updated_at = v_now
    WHERE id = p_mission_id AND user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object('replayed', v_inserted = 0, 'actualValue', v_actual);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_mission_tracking_click(
  p_tracking_link_id uuid,
  p_visitor_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link public.tracking_links%ROWTYPE;
  v_inserted integer := 0;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_link
  FROM public.tracking_links
  WHERE id = p_tracking_link_id AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.outcome_events (
    mission_id, user_id, tracking_link_id, event_type, source, visitor_id,
    quantity, metadata, dedupe_key, occurred_at
  ) VALUES (
    v_link.mission_id,
    v_link.user_id,
    v_link.id,
    'click',
    v_link.source,
    p_visitor_id,
    1,
    jsonb_build_object('medium', v_link.medium, 'campaign', v_link.campaign, 'content', v_link.content),
    'click:' || p_visitor_id,
    v_now
  )
  ON CONFLICT (mission_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      v_link.mission_id,
      v_link.user_id,
      'tracking_click',
      jsonb_build_object('source', v_link.source, 'medium', v_link.medium, 'campaign', v_link.campaign),
      v_now
    );

    UPDATE public.growth_missions
    SET execution_state = 'measuring', updated_at = v_now
    WHERE id = v_link.mission_id
      AND user_id = v_link.user_id
      AND status NOT IN ('completed', 'dismissed', 'superseded');
  END IF;
  RETURN v_inserted > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_growth_mission_execution_ledger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_mission_action_decision(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_mission_tracking_link(uuid, uuid, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_mission_outcome(uuid, uuid, text, integer, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_mission_tracking_click(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mission_action_decision(uuid, uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_mission_tracking_link(uuid, uuid, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_mission_outcome(uuid, uuid, text, integer, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_mission_tracking_click(uuid, text) TO service_role;
