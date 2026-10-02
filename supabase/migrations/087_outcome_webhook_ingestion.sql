-- 087: Signed, tenant-isolated business outcome ingestion.
--
-- A Growth/Digital Employee customer can connect one server-to-server
-- endpoint for lead, signup, and revenue events. Secrets are encrypted by the
-- application and never exposed through browser-readable database policies.
-- Delivery IDs and external references are stored only as SHA-256 hashes so
-- the outcome ledger does not become an accidental PII store.

CREATE TABLE IF NOT EXISTS public.outcome_webhook_endpoints (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status             text        NOT NULL DEFAULT 'active',
  encrypted_secret   text,
  secret_prefix      text,
  secret_version     integer     NOT NULL DEFAULT 1,
  last_received_at   timestamptz,
  rotated_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outcome_webhook_endpoints_user_unique UNIQUE (user_id),
  CONSTRAINT outcome_webhook_endpoints_status_check CHECK (status IN ('active', 'disabled')),
  CONSTRAINT outcome_webhook_endpoints_secret_version_check CHECK (secret_version > 0),
  CONSTRAINT outcome_webhook_endpoints_active_secret_check CHECK (
    (status = 'active' AND encrypted_secret IS NOT NULL AND secret_prefix IS NOT NULL)
    OR (status = 'disabled' AND encrypted_secret IS NULL AND secret_prefix IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS outcome_webhook_endpoints_user_updated_idx
  ON public.outcome_webhook_endpoints(user_id, updated_at DESC);

-- Keep this invariant rerunnable when the migration is re-applied after an
-- interrupted release or a narrowed constraint correction.
ALTER TABLE public.outcome_webhook_endpoints
  DROP CONSTRAINT IF EXISTS outcome_webhook_endpoints_active_secret_check;
ALTER TABLE public.outcome_webhook_endpoints
  ADD CONSTRAINT outcome_webhook_endpoints_active_secret_check CHECK (
    (status = 'active' AND encrypted_secret IS NOT NULL AND secret_prefix IS NOT NULL)
    OR (status = 'disabled' AND encrypted_secret IS NULL AND secret_prefix IS NULL)
  );

ALTER TABLE public.outcome_webhook_endpoints ENABLE ROW LEVEL SECURITY;
-- Deliberately no browser policies. Authenticated management and webhook
-- verification both run through server routes with the service role.

CREATE TABLE IF NOT EXISTS public.outcome_webhook_deliveries (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id           uuid        NOT NULL REFERENCES public.outcome_webhook_endpoints(id) ON DELETE CASCADE,
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id            uuid        REFERENCES public.growth_missions(id) ON DELETE SET NULL,
  event_id_hash         text        NOT NULL,
  event_type            text        NOT NULL,
  source                text        NOT NULL,
  payload_hash          text        NOT NULL,
  status                text        NOT NULL DEFAULT 'processing',
  attempt_count         integer     NOT NULL DEFAULT 1,
  processing_started_at timestamptz,
  response              jsonb,
  error_code            text,
  received_at           timestamptz NOT NULL DEFAULT now(),
  processed_at          timestamptz,
  CONSTRAINT outcome_webhook_deliveries_event_unique UNIQUE (endpoint_id, event_id_hash),
  CONSTRAINT outcome_webhook_deliveries_event_hash_check CHECK (event_id_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT outcome_webhook_deliveries_payload_hash_check CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT outcome_webhook_deliveries_event_type_check CHECK (event_type IN ('lead', 'signup', 'revenue')),
  CONSTRAINT outcome_webhook_deliveries_source_check CHECK (source ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  CONSTRAINT outcome_webhook_deliveries_status_check CHECK (status IN ('processing', 'succeeded', 'failed')),
  CONSTRAINT outcome_webhook_deliveries_attempt_count_check CHECK (attempt_count > 0)
);

CREATE INDEX IF NOT EXISTS outcome_webhook_deliveries_user_received_idx
  ON public.outcome_webhook_deliveries(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS outcome_webhook_deliveries_endpoint_received_idx
  ON public.outcome_webhook_deliveries(endpoint_id, received_at DESC);
CREATE INDEX IF NOT EXISTS outcome_webhook_deliveries_recovery_idx
  ON public.outcome_webhook_deliveries(status, processing_started_at)
  WHERE status IN ('processing', 'failed');

ALTER TABLE public.outcome_webhook_deliveries ENABLE ROW LEVEL SECURITY;
-- Deliberately no browser policies; hashes and delivery diagnostics remain
-- behind authenticated server routes.

ALTER TABLE public.outcome_webhook_deliveries
  DROP CONSTRAINT IF EXISTS outcome_webhook_deliveries_endpoint_user_fk;
-- The composite endpoint constraint may already support the delivery foreign
-- key when this migration is replayed. Drop the dependent foreign key first,
-- then rebuild both constraints in dependency order.
ALTER TABLE public.outcome_webhook_endpoints
  DROP CONSTRAINT IF EXISTS outcome_webhook_endpoints_id_user_unique;
ALTER TABLE public.outcome_webhook_endpoints
  ADD CONSTRAINT outcome_webhook_endpoints_id_user_unique UNIQUE (id, user_id);
ALTER TABLE public.outcome_webhook_deliveries
  ADD CONSTRAINT outcome_webhook_deliveries_endpoint_user_fk
  FOREIGN KEY (endpoint_id, user_id)
  REFERENCES public.outcome_webhook_endpoints(id, user_id)
  ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.ingest_mission_outcome_webhook(
  p_user_id uuid,
  p_endpoint_id uuid,
  p_mission_id uuid,
  p_tracking_code text,
  p_event_type text,
  p_quantity integer,
  p_value numeric,
  p_currency text,
  p_source text,
  p_external_ref_hash text,
  p_dedupe_key text,
  p_occurred_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mission public.growth_missions%ROWTYPE;
  v_link public.tracking_links%ROWTYPE;
  v_resolved_mission_id uuid;
  v_outcome_event_id uuid;
  v_inserted integer := 0;
  v_actual numeric := 0;
  v_now timestamptz := now();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.outcome_webhook_endpoints endpoint
    WHERE endpoint.id = p_endpoint_id
      AND endpoint.user_id = p_user_id
      AND endpoint.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Outcome endpoint is unavailable.' USING ERRCODE = 'P0002';
  END IF;

  IF p_mission_id IS NULL AND NULLIF(trim(COALESCE(p_tracking_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Provide missionId or trackingCode.' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(trim(COALESCE(p_tracking_code, '')), '') IS NOT NULL THEN
    SELECT * INTO v_link
    FROM public.tracking_links
    WHERE code = trim(p_tracking_code)
      AND user_id = p_user_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tracking code was not found for this account.' USING ERRCODE = 'P0002';
    END IF;
    IF p_mission_id IS NOT NULL AND p_mission_id <> v_link.mission_id THEN
      RAISE EXCEPTION 'missionId and trackingCode refer to different missions.' USING ERRCODE = '22023';
    END IF;
    v_resolved_mission_id := v_link.mission_id;
  ELSE
    v_resolved_mission_id := p_mission_id;
  END IF;

  SELECT * INTO v_mission
  FROM public.growth_missions
  WHERE id = v_resolved_mission_id
    AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Growth Mission not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_mission.mission_kind <> 'growth_opportunity' THEN
    RAISE EXCEPTION 'Automatic business outcomes require a commercial Growth Mission.' USING ERRCODE = 'P0001';
  END IF;
  IF v_mission.status IN ('completed', 'dismissed', 'superseded') THEN
    RAISE EXCEPTION 'This reviewed commercial mission no longer accepts outcomes.' USING ERRCODE = 'P0001';
  END IF;
  IF v_mission.status <> 'posted' OR v_mission.execution_state NOT IN ('measuring', 'review_due') THEN
    RAISE EXCEPTION 'Confirm distribution before receiving business outcomes.' USING ERRCODE = 'P0001';
  END IF;

  IF p_event_type IS NULL OR p_event_type NOT IN ('lead', 'signup', 'revenue') THEN
    RAISE EXCEPTION 'Unsupported business outcome type.' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10000 THEN
    RAISE EXCEPTION 'Outcome quantity is outside the supported range.' USING ERRCODE = '22023';
  END IF;
  IF p_value IS NULL OR (p_event_type = 'revenue' AND p_value <= 0) THEN
    RAISE EXCEPTION 'Revenue must be greater than zero.' USING ERRCODE = '22023';
  END IF;
  IF p_event_type <> 'revenue' AND p_value <> 0 THEN
    RAISE EXCEPTION 'Only revenue events may include a value.' USING ERRCODE = '22023';
  END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be an ISO-style three-letter code.' USING ERRCODE = '22023';
  END IF;
  IF p_source IS NULL OR p_source !~ '^[a-z0-9][a-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'Outcome source is invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_external_ref_hash IS NOT NULL AND p_external_ref_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'External reference hash is invalid.' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(trim(COALESCE(p_dedupe_key, '')), '') IS NULL OR char_length(p_dedupe_key) > 200 THEN
    RAISE EXCEPTION 'Outcome idempotency key is invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_occurred_at IS NULL
     OR p_occurred_at < v_now - interval '366 days'
     OR p_occurred_at > v_now + interval '5 minutes' THEN
    RAISE EXCEPTION 'Outcome occurrence time is outside the accepted range.' USING ERRCODE = '22023';
  END IF;
  IF v_mission.measurement_started_at IS NOT NULL
     AND p_occurred_at < v_mission.measurement_started_at - interval '5 minutes' THEN
    RAISE EXCEPTION 'Outcome occurred before this mission started measuring.' USING ERRCODE = '22023';
  END IF;

  IF p_event_type = 'revenue' AND EXISTS (
    SELECT 1 FROM public.outcome_events
    WHERE mission_id = v_resolved_mission_id
      AND user_id = p_user_id
      AND event_type = 'revenue'
      AND currency <> p_currency
  ) THEN
    RAISE EXCEPTION 'Revenue for this mission uses a different currency.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.outcome_events (
    mission_id, user_id, tracking_link_id, event_type, source, quantity, value,
    currency, metadata, dedupe_key, occurred_at
  ) VALUES (
    v_resolved_mission_id,
    p_user_id,
    v_link.id,
    p_event_type,
    p_source,
    p_quantity,
    CASE WHEN p_event_type = 'revenue' THEN p_value ELSE 0 END,
    p_currency,
    jsonb_strip_nulls(jsonb_build_object(
      'endpointId', p_endpoint_id,
      'externalRefHash', p_external_ref_hash
    )),
    p_dedupe_key,
    p_occurred_at
  )
  ON CONFLICT (mission_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_outcome_event_id;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT id INTO v_outcome_event_id
    FROM public.outcome_events
    WHERE mission_id = v_resolved_mission_id
      AND user_id = p_user_id
      AND dedupe_key = p_dedupe_key;
  ELSE
    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      v_resolved_mission_id,
      p_user_id,
      'outcome_recorded',
      jsonb_build_object(
        'eventType', p_event_type,
        'count', p_quantity,
        'value', p_value,
        'currency', p_currency,
        'source', p_source,
        'ingestion', 'signed_webhook'
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
  WHERE mission_id = v_resolved_mission_id
    AND user_id = p_user_id;

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
  WHERE id = v_resolved_mission_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'replayed', v_inserted = 0,
    'missionId', v_resolved_mission_id,
    'outcomeEventId', v_outcome_event_id,
    'actualValue', v_actual
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_mission_outcome_webhook(
  uuid, uuid, uuid, text, text, integer, numeric, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_mission_outcome_webhook(
  uuid, uuid, uuid, text, text, integer, numeric, text, text, text, text, timestamptz
) TO service_role;
