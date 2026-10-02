-- 086: Commercial mission measurement windows and human-reviewed outcomes
--
-- A commercial Growth Mission must not remain in `measuring` forever, and it
-- must not convert missing evidence into an automatic failure. This migration
-- adds an explicit user-confirmed measurement window, a due-review state, and
-- three idempotent human decisions:
--   1. confirm that recorded evidence reached the target;
--   2. confirm that the target was missed and select one breakpoint to repair;
--   3. declare the evidence insufficient and extend collection.

-- Keep additions separate so the production migration probe checks every
-- column instead of only the first column in a multi-add statement.
ALTER TABLE public.growth_missions ADD COLUMN IF NOT EXISTS measurement_window_days integer;
ALTER TABLE public.growth_missions ADD COLUMN IF NOT EXISTS measurement_started_at timestamptz;
ALTER TABLE public.growth_missions ADD COLUMN IF NOT EXISTS measurement_due_at timestamptz;
ALTER TABLE public.growth_missions ADD COLUMN IF NOT EXISTS measurement_window_idempotency_key uuid;
ALTER TABLE public.growth_missions ADD COLUMN IF NOT EXISTS review_decision text;
ALTER TABLE public.growth_missions ADD COLUMN IF NOT EXISTS review_bottleneck text;
ALTER TABLE public.growth_missions ADD COLUMN IF NOT EXISTS review_evidence_note text;
ALTER TABLE public.growth_missions ADD COLUMN IF NOT EXISTS review_idempotency_key uuid;
ALTER TABLE public.growth_missions ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.growth_missions DROP CONSTRAINT IF EXISTS growth_missions_execution_state_check;
ALTER TABLE public.growth_missions ADD CONSTRAINT growth_missions_execution_state_check
  CHECK (execution_state IN (
    'planned', 'generating', 'awaiting_decision', 'running', 'measuring',
    'review_due', 'completed', 'closed'
  ));

ALTER TABLE public.growth_missions DROP CONSTRAINT IF EXISTS growth_missions_measurement_window_check;
ALTER TABLE public.growth_missions ADD CONSTRAINT growth_missions_measurement_window_check
  CHECK (
    (measurement_window_days IS NULL AND measurement_started_at IS NULL AND measurement_due_at IS NULL)
    OR (
      measurement_window_days BETWEEN 1 AND 90
      AND measurement_started_at IS NOT NULL
      AND measurement_due_at IS NOT NULL
      AND measurement_due_at > measurement_started_at
    )
  );

ALTER TABLE public.growth_missions DROP CONSTRAINT IF EXISTS growth_missions_review_decision_check;
ALTER TABLE public.growth_missions ADD CONSTRAINT growth_missions_review_decision_check
  CHECK (review_decision IS NULL OR review_decision IN (
    'goal_achieved', 'fix_bottleneck', 'collect_more_evidence'
  ));

ALTER TABLE public.growth_missions DROP CONSTRAINT IF EXISTS growth_missions_review_bottleneck_check;
ALTER TABLE public.growth_missions ADD CONSTRAINT growth_missions_review_bottleneck_check
  CHECK (review_bottleneck IS NULL OR review_bottleneck IN (
    'acquisition_message', 'landing_page', 'lead_capture', 'signup_flow', 'checkout'
  ));

ALTER TABLE public.growth_missions DROP CONSTRAINT IF EXISTS growth_missions_review_evidence_note_check;
ALTER TABLE public.growth_missions ADD CONSTRAINT growth_missions_review_evidence_note_check
  CHECK (review_evidence_note IS NULL OR char_length(review_evidence_note) <= 500);

CREATE INDEX IF NOT EXISTS growth_missions_measurement_due_idx
  ON public.growth_missions(measurement_due_at)
  WHERE mission_kind = 'growth_opportunity'
    AND status = 'posted'
    AND execution_state IN ('measuring', 'review_due');

CREATE OR REPLACE FUNCTION public.set_business_mission_measurement_window(
  p_user_id uuid,
  p_mission_id uuid,
  p_window_days integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mission public.growth_missions%ROWTYPE;
  v_now timestamptz := now();
  v_due_at timestamptz;
BEGIN
  IF p_window_days IS NULL OR p_window_days NOT BETWEEN 1 AND 90 OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Invalid measurement window.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_mission
  FROM public.growth_missions
  WHERE id = p_mission_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Growth Mission not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_mission.mission_kind <> 'growth_opportunity'
     OR v_mission.status <> 'posted'
     OR v_mission.execution_state <> 'measuring'
     OR (v_mission.measurement_due_at IS NOT NULL AND v_mission.measurement_due_at <= v_now) THEN
    RAISE EXCEPTION 'Only an active commercial mission can set a measurement window.' USING ERRCODE = 'P0001';
  END IF;

  IF v_mission.measurement_window_idempotency_key = p_idempotency_key THEN
    RETURN jsonb_build_object(
      'replayed', true,
      'measurementWindowDays', v_mission.measurement_window_days,
      'measurementStartedAt', v_mission.measurement_started_at,
      'measurementDueAt', v_mission.measurement_due_at
    );
  END IF;

  v_due_at := v_now + make_interval(days => p_window_days);
  UPDATE public.growth_missions
  SET measurement_window_days = p_window_days,
      measurement_started_at = v_now,
      measurement_due_at = v_due_at,
      measurement_window_idempotency_key = p_idempotency_key,
      execution_state = 'measuring',
      updated_at = v_now
  WHERE id = p_mission_id AND user_id = p_user_id;

  INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
  VALUES (
    p_mission_id,
    p_user_id,
    CASE WHEN v_mission.measurement_due_at IS NULL
      THEN 'measurement_window_confirmed'
      ELSE 'measurement_window_changed'
    END,
    jsonb_build_object('windowDays', p_window_days, 'dueAt', v_due_at),
    v_now
  );

  RETURN jsonb_build_object(
    'replayed', false,
    'measurementWindowDays', p_window_days,
    'measurementStartedAt', v_now,
    'measurementDueAt', v_due_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_due_business_mission_reviews(
  p_user_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_advanced integer := 0;
BEGIN
  WITH due AS (
    UPDATE public.growth_missions
    SET execution_state = 'review_due',
        updated_at = p_now
    WHERE user_id = p_user_id
      AND mission_kind = 'growth_opportunity'
      AND status = 'posted'
      AND execution_state = 'measuring'
      AND measurement_due_at IS NOT NULL
      AND measurement_due_at <= p_now
    RETURNING id, user_id, measurement_due_at
  ), recorded AS (
    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    SELECT
      id,
      user_id,
      'measurement_review_due',
      jsonb_build_object('dueAt', measurement_due_at),
      p_now
    FROM due
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_advanced FROM recorded;

  RETURN v_advanced;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_business_growth_mission(
  p_user_id uuid,
  p_mission_id uuid,
  p_decision text,
  p_bottleneck text,
  p_evidence_note text,
  p_extension_days integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mission public.growth_missions%ROWTYPE;
  v_actual numeric := 0;
  v_now timestamptz := now();
  v_extended_due_at timestamptz;
  v_explanation text;
BEGIN
  IF p_decision IS NULL
     OR p_decision NOT IN ('goal_achieved', 'fix_bottleneck', 'collect_more_evidence')
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Invalid mission review decision.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_mission
  FROM public.growth_missions
  WHERE id = p_mission_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Growth Mission not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_mission.review_idempotency_key = p_idempotency_key THEN
    RETURN jsonb_build_object(
      'replayed', true,
      'decision', v_mission.review_decision,
      'missionStatus', v_mission.status,
      'executionState', v_mission.execution_state,
      'measurementDueAt', v_mission.measurement_due_at
    );
  END IF;

  IF v_mission.mission_kind <> 'growth_opportunity'
     OR v_mission.status <> 'posted'
     OR v_mission.measurement_due_at IS NULL
     OR v_mission.measurement_due_at > v_now
     OR v_mission.execution_state NOT IN ('measuring', 'review_due') THEN
    RAISE EXCEPTION 'This commercial mission is not due for review.' USING ERRCODE = 'P0001';
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

  IF p_decision = 'goal_achieved' THEN
    IF v_actual < v_mission.target_value THEN
      RAISE EXCEPTION 'Recorded evidence does not reach this mission target.' USING ERRCODE = '22023';
    END IF;
    v_explanation := 'The user confirmed that recorded business evidence reached the target after the measurement window.';
  ELSIF p_decision = 'fix_bottleneck' THEN
    IF v_actual >= v_mission.target_value THEN
      RAISE EXCEPTION 'Recorded evidence already reaches this mission target.' USING ERRCODE = '22023';
    END IF;
    IF p_bottleneck IS NULL
       OR p_bottleneck NOT IN ('acquisition_message', 'landing_page', 'lead_capture', 'signup_flow', 'checkout') THEN
      RAISE EXCEPTION 'Select one valid breakpoint to repair.' USING ERRCODE = '22023';
    END IF;
    IF char_length(trim(COALESCE(p_evidence_note, ''))) < 10 THEN
      RAISE EXCEPTION 'Describe the evidence used to choose this breakpoint.' USING ERRCODE = '22023';
    END IF;
    v_explanation := 'The user confirmed the target was not reached and selected one evidence-backed breakpoint for the next test. This decision does not prove causality.';
  ELSE
    IF p_extension_days IS NULL OR p_extension_days NOT BETWEEN 1 AND 90 THEN
      RAISE EXCEPTION 'Choose an evidence-collection extension between 1 and 90 days.' USING ERRCODE = '22023';
    END IF;
    IF char_length(trim(COALESCE(p_evidence_note, ''))) < 10 THEN
      RAISE EXCEPTION 'Describe which evidence is still missing.' USING ERRCODE = '22023';
    END IF;

    v_extended_due_at := v_now + make_interval(days => p_extension_days);
    UPDATE public.growth_missions
    SET measurement_window_days = p_extension_days,
        measurement_started_at = v_now,
        measurement_due_at = v_extended_due_at,
        execution_state = 'measuring',
        review_decision = p_decision,
        review_bottleneck = NULL,
        review_evidence_note = trim(p_evidence_note),
        review_idempotency_key = p_idempotency_key,
        reviewed_at = v_now,
        updated_at = v_now
    WHERE id = p_mission_id AND user_id = p_user_id;

    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      p_mission_id,
      p_user_id,
      'mission_review_confirmed',
      jsonb_build_object(
        'decision', p_decision,
        'actualValue', v_actual,
        'targetValue', v_mission.target_value,
        'extensionDays', p_extension_days,
        'extendedDueAt', v_extended_due_at,
        'evidenceNoteProvided', true
      ),
      v_now
    );

    RETURN jsonb_build_object(
      'replayed', false,
      'decision', p_decision,
      'actualValue', v_actual,
      'missionStatus', 'posted',
      'executionState', 'measuring',
      'measurementDueAt', v_extended_due_at
    );
  END IF;

  UPDATE public.growth_missions
  SET status = 'completed',
      execution_state = 'completed',
      verdict = CASE WHEN p_decision = 'goal_achieved' THEN 'won' ELSE 'lost' END,
      outcome = jsonb_build_object(
        'actualValue', v_actual,
        'baselineValue', 0,
        'targetValue', v_mission.target_value,
        'measuredAt', v_now,
        'explanation', v_explanation
      ),
      review_decision = p_decision,
      review_bottleneck = CASE WHEN p_decision = 'fix_bottleneck' THEN p_bottleneck ELSE NULL END,
      review_evidence_note = NULLIF(trim(COALESCE(p_evidence_note, '')), ''),
      review_idempotency_key = p_idempotency_key,
      reviewed_at = v_now,
      completed_at = v_now,
      updated_at = v_now
  WHERE id = p_mission_id AND user_id = p_user_id;

  INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
  VALUES (
    p_mission_id,
    p_user_id,
    'mission_review_confirmed',
    jsonb_build_object(
      'decision', p_decision,
      'actualValue', v_actual,
      'targetValue', v_mission.target_value,
      'bottleneck', CASE WHEN p_decision = 'fix_bottleneck' THEN p_bottleneck ELSE NULL END,
      'evidenceNoteProvided', NULLIF(trim(COALESCE(p_evidence_note, '')), '') IS NOT NULL
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'replayed', false,
    'decision', p_decision,
    'actualValue', v_actual,
    'missionStatus', 'completed',
    'executionState', 'completed'
  );
END;
$$;

-- Preserve the existing content-experiment behavior while removing automatic
-- commercial verdicts. Commercial outcomes become evidence for the due review;
-- only review_business_growth_mission may close them as won or lost.
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

  IF v_mission.mission_kind = 'growth_opportunity'
     AND v_mission.status IN ('completed', 'dismissed', 'superseded') THEN
    RAISE EXCEPTION 'This reviewed commercial mission no longer accepts outcomes.' USING ERRCODE = 'P0001';
  END IF;
  IF v_mission.mission_kind = 'growth_opportunity'
     AND (v_mission.status <> 'posted' OR v_mission.execution_state NOT IN ('measuring', 'review_due')) THEN
    RAISE EXCEPTION 'Confirm distribution before recording commercial outcomes.' USING ERRCODE = 'P0001';
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

  IF v_mission.mission_kind = 'growth_opportunity' THEN
    UPDATE public.growth_missions
    SET execution_state = CASE
          WHEN measurement_due_at IS NOT NULL AND measurement_due_at <= v_now THEN 'review_due'
          ELSE 'measuring'
        END,
        outcome = jsonb_build_object(
          'actualValue', v_actual,
          'baselineValue', 0,
          'targetValue', v_mission.target_value,
          'measuredAt', v_now,
          'explanation', 'Recorded business evidence is awaiting the user review decision.'
        ),
        updated_at = v_now
    WHERE id = p_mission_id AND user_id = p_user_id;
  ELSIF v_actual >= v_mission.target_value AND v_mission.status <> 'completed' THEN
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

-- Attributed clicks remain evidence, but a late click must not move an expired
-- commercial mission back from `review_due` to `measuring`.
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
    SET execution_state = CASE
          WHEN mission_kind = 'growth_opportunity'
               AND measurement_due_at IS NOT NULL
               AND measurement_due_at <= v_now THEN 'review_due'
          ELSE 'measuring'
        END,
        updated_at = v_now
    WHERE id = v_link.mission_id
      AND user_id = v_link.user_id
      AND status NOT IN ('completed', 'dismissed', 'superseded');
  END IF;
  RETURN v_inserted > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.set_business_mission_measurement_window(uuid, uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_due_business_mission_reviews(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_business_growth_mission(uuid, uuid, text, text, text, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_mission_outcome(uuid, uuid, text, integer, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_mission_tracking_click(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_business_mission_measurement_window(uuid, uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_due_business_mission_reviews(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_business_growth_mission(uuid, uuid, text, text, text, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_mission_outcome(uuid, uuid, text, integer, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_mission_tracking_click(uuid, text) TO service_role;
