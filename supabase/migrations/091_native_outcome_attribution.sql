-- 091: First-party signup and Creem revenue attribution.
--
-- A tracking click may belong to a future Finfold account, while the Growth
-- Mission belongs to the customer running the campaign. This server-only
-- table records that relationship without copying email, checkout, or raw
-- visitor identifiers into the business outcome ledger. The first successful
-- signup attribution wins so later logins cannot move a person to a different
-- tenant or mission.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'growth_missions_id_user_unique'
      AND conrelid = 'public.growth_missions'::regclass
  ) THEN
    ALTER TABLE public.growth_missions
      ADD CONSTRAINT growth_missions_id_user_unique UNIQUE (id, user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tracking_links_id_user_mission_unique'
      AND conrelid = 'public.tracking_links'::regclass
  ) THEN
    ALTER TABLE public.tracking_links
      ADD CONSTRAINT tracking_links_id_user_mission_unique UNIQUE (id, user_id, mission_id);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.native_outcome_attributions (
  subject_user_id        uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_owner_user_id  uuid        NOT NULL,
  mission_id             uuid        NOT NULL,
  tracking_link_id       uuid        NOT NULL,
  attributed_at          timestamptz NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT native_outcome_attributions_mission_owner_fk
    FOREIGN KEY (mission_id, mission_owner_user_id)
    REFERENCES public.growth_missions(id, user_id) ON DELETE CASCADE,
  CONSTRAINT native_outcome_attributions_link_owner_mission_fk
    FOREIGN KEY (tracking_link_id, mission_owner_user_id, mission_id)
    REFERENCES public.tracking_links(id, user_id, mission_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS native_outcome_attributions_owner_mission_idx
  ON public.native_outcome_attributions(mission_owner_user_id, mission_id, attributed_at DESC);

ALTER TABLE public.native_outcome_attributions ENABLE ROW LEVEL SECURITY;
-- Deliberately no browser policies. Signup callbacks and signed payment
-- webhooks use the service role; campaign owners only see rolled-up outcomes.

CREATE OR REPLACE FUNCTION public.ingest_native_attributed_outcome(
  p_subject_user_id uuid,
  p_visitor_id uuid,
  p_event_type text,
  p_provider_event_hash text,
  p_external_ref_hash text,
  p_value numeric,
  p_currency text,
  p_occurred_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attribution public.native_outcome_attributions%ROWTYPE;
  v_mission public.growth_missions%ROWTYPE;
  v_click record;
  v_outcome_event_id uuid;
  v_inserted integer := 0;
  v_actual numeric := 0;
  v_now timestamptz := now();
  v_dedupe_key text;
BEGIN
  IF p_subject_user_id IS NULL THEN
    RAISE EXCEPTION 'Subject user is required.' USING ERRCODE = '22023';
  END IF;
  IF p_event_type IS NULL OR p_event_type NOT IN ('signup', 'revenue') THEN
    RAISE EXCEPTION 'Unsupported native outcome type.' USING ERRCODE = '22023';
  END IF;
  IF p_provider_event_hash IS NULL OR p_provider_event_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Provider event hash is invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_event_type = 'signup' AND p_visitor_id IS NULL THEN
    RAISE EXCEPTION 'A tracking visitor is required for signup attribution.' USING ERRCODE = '22023';
  END IF;
  IF p_event_type = 'revenue'
     AND (p_external_ref_hash IS NULL OR p_external_ref_hash !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'Revenue requires a valid transaction reference hash.' USING ERRCODE = '22023';
  END IF;
  IF p_event_type = 'revenue' AND (p_value IS NULL OR p_value <= 0) THEN
    RAISE EXCEPTION 'Revenue must be greater than zero.' USING ERRCODE = '22023';
  END IF;
  IF p_event_type = 'signup' AND COALESCE(p_value, 0) <> 0 THEN
    RAISE EXCEPTION 'Signup outcomes cannot include a value.' USING ERRCODE = '22023';
  END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be an ISO-style three-letter code.' USING ERRCODE = '22023';
  END IF;
  IF p_occurred_at IS NULL
     OR p_occurred_at < v_now - interval '366 days'
     OR p_occurred_at > v_now + interval '5 minutes' THEN
    RAISE EXCEPTION 'Outcome occurrence time is outside the accepted range.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_attribution
  FROM public.native_outcome_attributions
  WHERE subject_user_id = p_subject_user_id
  FOR SHARE;

  IF NOT FOUND AND p_event_type = 'signup' THEN
    SELECT
      click.mission_id,
      click.user_id AS mission_owner_user_id,
      click.tracking_link_id,
      click.occurred_at
    INTO v_click
    FROM public.outcome_events click
    JOIN public.tracking_links link
      ON link.id = click.tracking_link_id
     AND link.mission_id = click.mission_id
     AND link.user_id = click.user_id
    JOIN public.growth_missions mission
      ON mission.id = click.mission_id
     AND mission.user_id = click.user_id
    WHERE click.event_type = 'click'
      AND click.visitor_id = p_visitor_id::text
      AND click.occurred_at <= p_occurred_at + interval '5 minutes'
      AND click.occurred_at >= p_occurred_at - interval '90 days'
      AND link.status = 'active'
      AND mission.mission_kind = 'growth_opportunity'
      AND mission.status = 'posted'
      AND mission.execution_state IN ('measuring', 'review_due')
    ORDER BY click.occurred_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('attributed', false, 'reason', 'no_eligible_tracking_click');
    END IF;

    INSERT INTO public.native_outcome_attributions (
      subject_user_id,
      mission_owner_user_id,
      mission_id,
      tracking_link_id,
      attributed_at
    ) VALUES (
      p_subject_user_id,
      v_click.mission_owner_user_id,
      v_click.mission_id,
      v_click.tracking_link_id,
      p_occurred_at
    )
    ON CONFLICT (subject_user_id) DO NOTHING;

    SELECT * INTO v_attribution
    FROM public.native_outcome_attributions
    WHERE subject_user_id = p_subject_user_id
    FOR SHARE;
  END IF;

  IF v_attribution.subject_user_id IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'no_signup_attribution');
  END IF;

  SELECT * INTO v_mission
  FROM public.growth_missions
  WHERE id = v_attribution.mission_id
    AND user_id = v_attribution.mission_owner_user_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_mission.mission_kind <> 'growth_opportunity'
     OR v_mission.status <> 'posted'
     OR v_mission.execution_state NOT IN ('measuring', 'review_due') THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'mission_not_accepting_outcomes');
  END IF;

  IF v_mission.measurement_started_at IS NOT NULL
     AND p_occurred_at < v_mission.measurement_started_at - interval '5 minutes' THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'outcome_before_measurement');
  END IF;

  IF p_event_type = 'revenue' AND EXISTS (
    SELECT 1
    FROM public.outcome_events
    WHERE mission_id = v_attribution.mission_id
      AND user_id = v_attribution.mission_owner_user_id
      AND event_type = 'revenue'
      AND currency <> p_currency
  ) THEN
    RAISE EXCEPTION 'Revenue for this mission uses a different currency.' USING ERRCODE = '22023';
  END IF;

  v_dedupe_key := CASE p_event_type
    WHEN 'signup' THEN 'native:signup:' || p_provider_event_hash
    ELSE 'native:revenue:' || p_external_ref_hash
  END;

  INSERT INTO public.outcome_events (
    mission_id,
    user_id,
    tracking_link_id,
    event_type,
    source,
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
    p_event_type,
    CASE p_event_type WHEN 'signup' THEN 'finfold-native-signup' ELSE 'creem' END,
    1,
    CASE p_event_type WHEN 'revenue' THEN p_value ELSE 0 END,
    CASE p_event_type WHEN 'revenue' THEN p_currency ELSE 'XXX' END,
    jsonb_strip_nulls(jsonb_build_object(
      'ingestion', 'provider_native',
      'providerEventHash', p_provider_event_hash,
      'externalRefHash', p_external_ref_hash
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
        'eventType', p_event_type,
        'count', 1,
        'value', CASE p_event_type WHEN 'revenue' THEN p_value ELSE 0 END,
        'currency', CASE p_event_type WHEN 'revenue' THEN p_currency ELSE 'XXX' END,
        'source', CASE p_event_type WHEN 'signup' THEN 'finfold-native-signup' ELSE 'creem' END,
        'ingestion', 'provider_native'
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

REVOKE ALL ON FUNCTION public.ingest_native_attributed_outcome(
  uuid, uuid, text, text, text, numeric, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_native_attributed_outcome(
  uuid, uuid, text, text, text, numeric, text, timestamptz
) TO service_role;
