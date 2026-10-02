-- 108: Fix record_native_activation_outcome reference to a non-existent column.
--
-- Migration 107's activation RPC read native_outcome_attributions.visitor_id,
-- but that table (091) never stored the visitor id — plpgsql only surfaces the
-- 42703 at call time. The activation event is deduplicated per subject anyway,
-- so the column is simply omitted (NULL) instead of reconstructed.
--
-- Idempotent: re-running replaces the function with the same body.

CREATE OR REPLACE FUNCTION public.record_native_activation_outcome(
  p_subject_user_id uuid,
  p_occurred_at timestamptz DEFAULT now(),
  p_is_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attribution public.native_outcome_attributions%ROWTYPE;
  v_mission public.growth_missions%ROWTYPE;
  v_outcome_event_id uuid;
  v_inserted integer := 0;
  v_actual numeric := 0;
  v_now timestamptz := now();
  v_dedupe_key text := 'native:activation:' || p_subject_user_id::text;
BEGIN
  IF p_subject_user_id IS NULL THEN
    RAISE EXCEPTION 'Subject user is required.' USING ERRCODE = '22023';
  END IF;
  IF p_occurred_at IS NULL
     OR p_occurred_at < v_now - interval '366 days'
     OR p_occurred_at > v_now + interval '5 minutes' THEN
    RAISE EXCEPTION 'Activation occurrence time is outside the accepted range.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_attribution
  FROM public.native_outcome_attributions
  WHERE subject_user_id = p_subject_user_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'no_signup_attribution');
  END IF;

  SELECT * INTO v_mission
  FROM public.growth_missions
  WHERE id = v_attribution.mission_id
    AND user_id = v_attribution.mission_owner_user_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_mission.mission_kind <> 'growth_loop'
     OR v_mission.status <> 'posted'
     OR v_mission.execution_state NOT IN ('measuring', 'review_due') THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'mission_not_accepting_outcomes');
  END IF;
  IF v_mission.measurement_started_at IS NOT NULL
     AND p_occurred_at < v_mission.measurement_started_at - interval '5 minutes' THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'outcome_before_measurement');
  END IF;

  INSERT INTO public.outcome_events (
    mission_id,
    user_id,
    tracking_link_id,
    event_type,
    source,
    visitor_id,
    quantity,
    value,
    currency,
    metadata,
    dedupe_key,
    occurred_at
  ) VALUES (
    v_attribution.mission_id,
    v_attribution.mission_owner_user_id,
    v_attribution.tracking_link_id,
    'activation',
    'finfold-first-save',
    NULL,
    1,
    0,
    'XXX',
    jsonb_strip_nulls(jsonb_build_object(
      'ingestion', 'provider_native',
      'attributionRule', 'last-click-90d-frozen-v1',
      'isTest', p_is_test
    )),
    v_dedupe_key,
    p_occurred_at
  )
  ON CONFLICT (mission_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_outcome_event_id;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT id INTO v_outcome_event_id
    FROM public.outcome_events
    WHERE mission_id = v_attribution.mission_id
      AND user_id = v_attribution.mission_owner_user_id
      AND dedupe_key = v_dedupe_key;
  ELSE
    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      v_attribution.mission_id,
      v_attribution.mission_owner_user_id,
      'outcome_recorded',
      jsonb_build_object(
        'eventType', 'activation',
        'count', 1,
        'source', 'finfold-first-save',
        'ingestion', 'provider_native',
        'isTest', p_is_test
      ),
      v_now
    );
  END IF;

  SELECT COALESCE(SUM(quantity) FILTER (WHERE event_type = 'signup'), 0)
  INTO v_actual
  FROM public.outcome_events
  WHERE mission_id = v_attribution.mission_id
    AND user_id = v_attribution.mission_owner_user_id;

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
  WHERE id = v_attribution.mission_id
    AND user_id = v_attribution.mission_owner_user_id;

  RETURN jsonb_build_object(
    'attributed', true,
    'replayed', v_inserted = 0,
    'missionId', v_attribution.mission_id,
    'outcomeEventId', v_outcome_event_id,
    'actualValue', v_actual
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_native_activation_outcome(uuid, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_native_activation_outcome(uuid, timestamptz, boolean) TO service_role;
