-- 094: First-party, consented lead capture for commercial Growth Missions.
--
-- Public visitors submit contact details through a Turnstile-protected Finfold
-- form. PII is encrypted by the application before this service-role-only
-- table is touched. A submission remains a candidate until the mission owner
-- explicitly confirms that it satisfies their qualified-lead rule; only then
-- does it enter the append-only outcome ledger.

CREATE TABLE IF NOT EXISTS public.native_lead_submissions (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_owner_user_id    uuid        NOT NULL,
  mission_id               uuid        NOT NULL,
  tracking_link_id         uuid        NOT NULL,
  submission_hash          text        NOT NULL,
  payload_hash             text        NOT NULL,
  email_hash               text        NOT NULL,
  encrypted_work_email     text        NOT NULL,
  encrypted_company        text        NOT NULL,
  encrypted_need           text        NOT NULL,
  locale                   text        NOT NULL DEFAULT 'en',
  consent_version          text        NOT NULL,
  status                   text        NOT NULL DEFAULT 'new',
  consented_at             timestamptz NOT NULL,
  reviewed_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT native_lead_submissions_mission_owner_fk
    FOREIGN KEY (mission_id, mission_owner_user_id)
    REFERENCES public.growth_missions(id, user_id) ON DELETE CASCADE,
  CONSTRAINT native_lead_submissions_link_owner_mission_fk
    FOREIGN KEY (tracking_link_id, mission_owner_user_id, mission_id)
    REFERENCES public.tracking_links(id, user_id, mission_id) ON DELETE CASCADE,
  CONSTRAINT native_lead_submissions_link_submission_unique
    UNIQUE (tracking_link_id, submission_hash),
  CONSTRAINT native_lead_submissions_submission_hash_check
    CHECK (submission_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT native_lead_submissions_payload_hash_check
    CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT native_lead_submissions_email_hash_check
    CHECK (email_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT native_lead_submissions_encrypted_email_check
    CHECK (encrypted_work_email LIKE 'enc:v1:%'),
  CONSTRAINT native_lead_submissions_encrypted_company_check
    CHECK (encrypted_company LIKE 'enc:v1:%'),
  CONSTRAINT native_lead_submissions_encrypted_need_check
    CHECK (encrypted_need LIKE 'enc:v1:%'),
  CONSTRAINT native_lead_submissions_locale_check
    CHECK (locale IN ('en', 'zh')),
  CONSTRAINT native_lead_submissions_status_check
    CHECK (status IN ('new', 'qualified', 'rejected'))
);

CREATE INDEX IF NOT EXISTS native_lead_submissions_owner_mission_status_idx
  ON public.native_lead_submissions(
    mission_owner_user_id,
    mission_id,
    status,
    created_at DESC
  );

ALTER TABLE public.native_lead_submissions ENABLE ROW LEVEL SECURITY;
-- Deliberately no browser policies. Public capture and authenticated owner
-- review both pass through server routes using the service role.

CREATE OR REPLACE FUNCTION public.ingest_native_lead_candidate(
  p_tracking_code text,
  p_submission_hash text,
  p_payload_hash text,
  p_email_hash text,
  p_encrypted_work_email text,
  p_encrypted_company text,
  p_encrypted_need text,
  p_locale text,
  p_consent_version text,
  p_occurred_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link public.tracking_links%ROWTYPE;
  v_mission public.growth_missions%ROWTYPE;
  v_lead public.native_lead_submissions%ROWTYPE;
  v_inserted integer := 0;
  v_now timestamptz := now();
BEGIN
  IF NULLIF(trim(COALESCE(p_tracking_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Tracking code is required.' USING ERRCODE = '22023';
  END IF;
  IF p_submission_hash IS NULL OR p_submission_hash !~ '^[a-f0-9]{64}$'
     OR p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$'
     OR p_email_hash IS NULL OR p_email_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Lead submission hashes are invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_encrypted_work_email NOT LIKE 'enc:v1:%'
     OR p_encrypted_company NOT LIKE 'enc:v1:%'
     OR p_encrypted_need NOT LIKE 'enc:v1:%' THEN
    RAISE EXCEPTION 'Lead contact details must be encrypted.' USING ERRCODE = '22023';
  END IF;
  IF p_locale IS NULL OR p_locale NOT IN ('en', 'zh') THEN
    RAISE EXCEPTION 'Lead locale is invalid.' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(trim(COALESCE(p_consent_version, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Consent version is required.' USING ERRCODE = '22023';
  END IF;
  IF p_occurred_at IS NULL
     OR p_occurred_at < v_now - interval '10 minutes'
     OR p_occurred_at > v_now + interval '5 minutes' THEN
    RAISE EXCEPTION 'Lead occurrence time is outside the accepted range.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_link
  FROM public.tracking_links
  WHERE code = trim(p_tracking_code)
    AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead form not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_mission
  FROM public.growth_missions
  WHERE id = v_link.mission_id
    AND user_id = v_link.user_id
  FOR SHARE;
  IF NOT FOUND
     OR v_mission.mission_kind <> 'growth_opportunity'
     OR v_mission.status <> 'posted'
     OR v_mission.execution_state NOT IN ('measuring', 'review_due') THEN
    RAISE EXCEPTION 'This lead form is not accepting submissions.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.native_lead_submissions (
    mission_owner_user_id,
    mission_id,
    tracking_link_id,
    submission_hash,
    payload_hash,
    email_hash,
    encrypted_work_email,
    encrypted_company,
    encrypted_need,
    locale,
    consent_version,
    consented_at,
    created_at,
    updated_at
  ) VALUES (
    v_link.user_id,
    v_link.mission_id,
    v_link.id,
    p_submission_hash,
    p_payload_hash,
    p_email_hash,
    p_encrypted_work_email,
    p_encrypted_company,
    p_encrypted_need,
    p_locale,
    trim(p_consent_version),
    p_occurred_at,
    p_occurred_at,
    p_occurred_at
  )
  ON CONFLICT (tracking_link_id, submission_hash) DO NOTHING
  RETURNING * INTO v_lead;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT * INTO v_lead
    FROM public.native_lead_submissions
    WHERE tracking_link_id = v_link.id
      AND submission_hash = p_submission_hash;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lead submission disappeared during ingestion.' USING ERRCODE = 'P0002';
    END IF;
    IF v_lead.payload_hash <> p_payload_hash THEN
      RAISE EXCEPTION 'Submission identifier was already used with different content.' USING ERRCODE = '22023';
    END IF;
  ELSE
    INSERT INTO public.mission_events (
      mission_id,
      user_id,
      event_type,
      payload,
      occurred_at
    ) VALUES (
      v_link.mission_id,
      v_link.user_id,
      'lead_submitted',
      jsonb_build_object(
        'leadSubmissionId', v_lead.id,
        'source', 'finfold-native-lead-form',
        'status', 'candidate',
        'piiStoredInOutcomeLedger', false
      ),
      p_occurred_at
    );
  END IF;

  RETURN jsonb_build_object(
    'accepted', true,
    'replayed', v_inserted = 0,
    'leadSubmissionId', v_lead.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_native_lead_candidate(
  text, text, text, text, text, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_native_lead_candidate(
  text, text, text, text, text, text, text, text, text, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.review_native_lead_candidate(
  p_user_id uuid,
  p_mission_id uuid,
  p_lead_submission_id uuid,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lead public.native_lead_submissions%ROWTYPE;
  v_mission public.growth_missions%ROWTYPE;
  v_outcome_event_id uuid;
  v_inserted integer := 0;
  v_actual numeric := 0;
  v_now timestamptz := now();
  v_target_status text;
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('qualify', 'reject') THEN
    RAISE EXCEPTION 'Lead review decision is invalid.' USING ERRCODE = '22023';
  END IF;
  v_target_status := CASE p_decision WHEN 'qualify' THEN 'qualified' ELSE 'rejected' END;

  SELECT * INTO v_lead
  FROM public.native_lead_submissions
  WHERE id = p_lead_submission_id
    AND mission_id = p_mission_id
    AND mission_owner_user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead submission not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_lead.status = v_target_status THEN
    SELECT id INTO v_outcome_event_id
    FROM public.outcome_events
    WHERE mission_id = p_mission_id
      AND user_id = p_user_id
      AND dedupe_key = 'native:lead:' || v_lead.id::text;
    RETURN jsonb_build_object(
      'replayed', true,
      'status', v_lead.status,
      'missionId', p_mission_id,
      'outcomeEventId', v_outcome_event_id
    );
  END IF;
  IF v_lead.status <> 'new' THEN
    RAISE EXCEPTION 'This lead submission already has a final review decision.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_mission
  FROM public.growth_missions
  WHERE id = p_mission_id
    AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Growth Mission not found.' USING ERRCODE = 'P0002';
  END IF;

  IF p_decision = 'qualify' THEN
    IF v_mission.mission_kind <> 'growth_opportunity'
       OR v_mission.status <> 'posted'
       OR v_mission.execution_state NOT IN ('measuring', 'review_due') THEN
      RAISE EXCEPTION 'This mission is not accepting qualified leads.' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.outcome_events (
      mission_id,
      user_id,
      tracking_link_id,
      event_type,
      source,
      lead_id,
      quantity,
      value,
      currency,
      metadata,
      dedupe_key,
      occurred_at
    ) VALUES (
      p_mission_id,
      p_user_id,
      v_lead.tracking_link_id,
      'lead',
      'finfold-native-lead-form',
      v_lead.id::text,
      1,
      0,
      'XXX',
      jsonb_build_object(
        'ingestion', 'first_party_consent_form',
        'leadSubmissionId', v_lead.id,
        'consentVersion', v_lead.consent_version,
        'piiStoredInOutcomeLedger', false
      ),
      'native:lead:' || v_lead.id::text,
      v_lead.created_at
    )
    ON CONFLICT (mission_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_outcome_event_id;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted = 0 THEN
      SELECT id INTO v_outcome_event_id
      FROM public.outcome_events
      WHERE mission_id = p_mission_id
        AND user_id = p_user_id
        AND dedupe_key = 'native:lead:' || v_lead.id::text;
    ELSE
      INSERT INTO public.mission_events (
        mission_id,
        user_id,
        event_type,
        payload,
        occurred_at
      ) VALUES (
        p_mission_id,
        p_user_id,
        'outcome_recorded',
        jsonb_build_object(
          'eventType', 'lead',
          'count', 1,
          'value', 0,
          'currency', 'XXX',
          'source', 'finfold-native-lead-form',
          'ingestion', 'owner_qualified_first_party_form'
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
    WHERE mission_id = p_mission_id
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
    WHERE id = p_mission_id
      AND user_id = p_user_id;
  END IF;

  UPDATE public.native_lead_submissions
  SET status = v_target_status,
      reviewed_at = v_now,
      updated_at = v_now
  WHERE id = v_lead.id
    AND mission_id = p_mission_id
    AND mission_owner_user_id = p_user_id;

  INSERT INTO public.mission_events (
    mission_id,
    user_id,
    event_type,
    payload,
    occurred_at
  ) VALUES (
    p_mission_id,
    p_user_id,
    'lead_reviewed',
    jsonb_build_object(
      'leadSubmissionId', v_lead.id,
      'decision', p_decision,
      'countedAsLead', p_decision = 'qualify'
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'replayed', false,
    'status', v_target_status,
    'missionId', p_mission_id,
    'outcomeEventId', v_outcome_event_id,
    'actualValue', v_actual
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_native_lead_candidate(
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_native_lead_candidate(
  uuid, uuid, uuid, text
) TO service_role;
