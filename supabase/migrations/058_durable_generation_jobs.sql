-- ============================================================
-- Migration 058: Durable generation jobs, outbox, and attempts
--
-- A generation_runs row records durable state, but migration 055/056 still
-- executes the model call inside the original HTTP request. This migration
-- adds the database half of a transactional outbox:
--
--   create run + create private job payload in one transaction
--   publish only the opaque job id to Cloudflare Queues
--   claim every delivery with a database lease
--   retain one auditable row per consumer attempt
--
-- Queue delivery is at-least-once. The functions below therefore make a
-- duplicate delivery a harmless busy/terminal result rather than a second
-- charge or a second content kit.
-- ============================================================

ALTER TABLE public.generation_runs
  DROP CONSTRAINT IF EXISTS generation_runs_status_check;

ALTER TABLE public.generation_runs
  ADD CONSTRAINT generation_runs_status_check
  CHECK (status IN (
    'queued',
    'running',
    'partial_success',
    'succeeded',
    'failed',
    'cancelled'
  ));

ALTER TABLE public.generation_runs
  DROP CONSTRAINT IF EXISTS generation_runs_terminal_time_check;

ALTER TABLE public.generation_runs
  ADD CONSTRAINT generation_runs_terminal_time_check
  CHECK (
    (status IN ('partial_success', 'succeeded', 'failed', 'cancelled')
      AND completed_at IS NOT NULL)
    OR
    (status IN ('queued', 'running') AND completed_at IS NULL)
  );

CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                  uuid        NOT NULL UNIQUE
                                      REFERENCES public.generation_runs(id)
                                      ON DELETE CASCADE,
  user_id                 uuid        NOT NULL REFERENCES auth.users(id)
                                      ON DELETE CASCADE,
  schema_version          integer     NOT NULL DEFAULT 1,
  payload                 jsonb       NOT NULL,
  status                  text        NOT NULL DEFAULT 'pending',
  dispatch_attempt_count  integer     NOT NULL DEFAULT 0,
  attempt_count           integer     NOT NULL DEFAULT 0,
  available_at            timestamptz NOT NULL DEFAULT now(),
  published_at            timestamptz,
  lease_token             uuid,
  lease_expires_at        timestamptz,
  last_heartbeat_at       timestamptz,
  last_error_code         text,
  last_error_message      text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generation_jobs_schema_version_check
    CHECK (schema_version > 0),
  CONSTRAINT generation_jobs_payload_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT generation_jobs_status_check
    CHECK (status IN (
      'pending',
      'published',
      'processing',
      'partial_success',
      'succeeded',
      'failed',
      'cancelled'
    )),
  CONSTRAINT generation_jobs_dispatch_attempt_check
    CHECK (dispatch_attempt_count >= 0),
  CONSTRAINT generation_jobs_attempt_count_check
    CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS generation_jobs_dispatch_idx
  ON public.generation_jobs(available_at, created_at)
  WHERE status IN ('pending', 'published');

CREATE INDEX IF NOT EXISTS generation_jobs_stale_lease_idx
  ON public.generation_jobs(lease_expires_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS generation_jobs_user_created_idx
  ON public.generation_jobs(user_id, created_at DESC);

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;
-- No client policies. The payload can contain private source material and is
-- available only to service-role producer/consumer code.

CREATE TABLE IF NOT EXISTS public.generation_run_attempts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                uuid        NOT NULL REFERENCES public.generation_runs(id)
                                    ON DELETE CASCADE,
  user_id               uuid        NOT NULL REFERENCES auth.users(id)
                                    ON DELETE CASCADE,
  attempt_number        integer     NOT NULL,
  step                  text        NOT NULL DEFAULT 'validate_request',
  provider              text,
  model                 text,
  prompt_version        text,
  started_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  input_tokens          integer,
  output_tokens         integer,
  total_tokens          integer,
  estimated_cost_usd    numeric(14, 8),
  outcome               text        NOT NULL DEFAULT 'running',
  normalized_error_code text,
  normalized_error      text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generation_run_attempts_number_check
    CHECK (attempt_number > 0),
  CONSTRAINT generation_run_attempts_outcome_check
    CHECK (outcome IN (
      'running', 'succeeded', 'partial_success', 'failed', 'cancelled'
    )),
  CONSTRAINT generation_run_attempts_token_check
    CHECK (
      COALESCE(input_tokens, 0) >= 0
      AND COALESCE(output_tokens, 0) >= 0
      AND COALESCE(total_tokens, 0) >= 0
      AND COALESCE(estimated_cost_usd, 0) >= 0
    ),
  UNIQUE (run_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS generation_run_attempts_user_created_idx
  ON public.generation_run_attempts(user_id, created_at DESC);

ALTER TABLE public.generation_run_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "generation run attempts: select own"
  ON public.generation_run_attempts;
CREATE POLICY "generation run attempts: select own"
  ON public.generation_run_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.create_generation_job(
  p_user_id uuid,
  p_request_id text,
  p_request_fingerprint text,
  p_platform_count integer,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.generation_runs%ROWTYPE;
  v_job public.generation_jobs%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR char_length(p_request_id) NOT BETWEEN 8 AND 128
     OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_platform_count < 1
     OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid_generation_job';
  END IF;

  BEGIN
    INSERT INTO public.generation_runs (
      user_id,
      request_id,
      request_fingerprint,
      status,
      current_step,
      platform_count,
      last_heartbeat_at,
      updated_at
    ) VALUES (
      p_user_id,
      p_request_id,
      p_request_fingerprint,
      'queued',
      'validate_request',
      p_platform_count,
      now(),
      now()
    ) RETURNING * INTO v_run;

    INSERT INTO public.generation_jobs (
      run_id,
      user_id,
      payload,
      status,
      available_at
    ) VALUES (
      v_run.id,
      p_user_id,
      p_payload,
      'pending',
      now()
    ) RETURNING * INTO v_job;

    RETURN jsonb_build_object(
      'outcome', 'claimed',
      'run', to_jsonb(v_run),
      'job', to_jsonb(v_job)
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_run
      FROM public.generation_runs
     WHERE user_id = p_user_id
       AND request_id = p_request_id;

    IF NOT FOUND THEN
      RAISE;
    END IF;

    SELECT * INTO v_job
      FROM public.generation_jobs
     WHERE run_id = v_run.id;

    RETURN jsonb_build_object(
      'outcome', CASE
        WHEN v_run.request_fingerprint = p_request_fingerprint
          THEN 'duplicate'
        ELSE 'conflict'
      END,
      'run', to_jsonb(v_run),
      'job', CASE WHEN v_job.id IS NULL THEN NULL ELSE to_jsonb(v_job) END
    );
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_generation_job_published(
  p_job_id uuid,
  p_run_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.generation_jobs
     SET status = CASE
           WHEN status = 'pending' THEN 'published'
           ELSE status
         END,
         dispatch_attempt_count = dispatch_attempt_count + 1,
         published_at = now(),
         updated_at = now()
   WHERE id = p_job_id
     AND run_id = p_run_id
     AND status IN ('pending', 'published');
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_generation_job(
  p_job_id uuid,
  p_run_id uuid,
  p_lease_seconds integer DEFAULT 900
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.generation_jobs%ROWTYPE;
  v_run public.generation_runs%ROWTYPE;
  v_lease uuid := gen_random_uuid();
  v_attempt integer;
BEGIN
  SELECT * INTO v_job
    FROM public.generation_jobs
   WHERE id = p_job_id
     AND run_id = p_run_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  SELECT * INTO v_run
    FROM public.generation_runs
   WHERE id = v_job.run_id
     AND user_id = v_job.user_id
   FOR UPDATE;

  IF v_run.status IN (
    'partial_success', 'succeeded', 'failed', 'cancelled'
  ) OR v_job.status IN (
    'partial_success', 'succeeded', 'failed', 'cancelled'
  ) THEN
    RETURN jsonb_build_object(
      'outcome', 'terminal',
      'status', v_run.status,
      'run', to_jsonb(v_run)
    );
  END IF;

  IF v_job.status = 'processing'
     AND v_job.lease_expires_at IS NOT NULL
     AND v_job.lease_expires_at > now() THEN
    RETURN jsonb_build_object('outcome', 'busy');
  END IF;

  -- An older duplicate Queue delivery must not bypass the backoff window
  -- recorded by retry_generation_job.
  IF v_job.status IN ('pending', 'published')
     AND v_job.available_at > now() THEN
    RETURN jsonb_build_object('outcome', 'busy');
  END IF;

  v_attempt := v_job.attempt_count + 1;

  UPDATE public.generation_jobs
     SET status = 'processing',
         attempt_count = v_attempt,
         lease_token = v_lease,
         lease_expires_at = now() + make_interval(
           secs => LEAST(GREATEST(p_lease_seconds, 60), 3600)
         ),
         last_heartbeat_at = now(),
         last_error_code = NULL,
         last_error_message = NULL,
         updated_at = now()
   WHERE id = v_job.id
   RETURNING * INTO v_job;

  UPDATE public.generation_runs
     SET status = 'running',
         lease_token = v_lease,
         attempt_count = v_attempt,
         started_at = COALESCE(started_at, now()),
         last_heartbeat_at = now(),
         updated_at = now(),
         completed_at = NULL,
         error_code = NULL,
         error_message = NULL,
         retryable = false
   WHERE id = v_run.id
   RETURNING * INTO v_run;

  INSERT INTO public.generation_run_attempts (
    run_id,
    user_id,
    attempt_number,
    step,
    outcome
  ) VALUES (
    v_run.id,
    v_run.user_id,
    v_attempt,
    v_run.current_step,
    'running'
  );

  RETURN jsonb_build_object(
    'outcome', 'claimed',
    'leaseToken', v_lease,
    'attemptNumber', v_attempt,
    'run', to_jsonb(v_run),
    'job', to_jsonb(v_job)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_generation_job(
  p_job_id uuid,
  p_run_id uuid,
  p_lease_token uuid,
  p_step text,
  p_lease_seconds integer DEFAULT 900
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt integer;
BEGIN
  UPDATE public.generation_jobs
     SET last_heartbeat_at = now(),
         lease_expires_at = now() + make_interval(
           secs => LEAST(GREATEST(p_lease_seconds, 60), 3600)
         ),
         updated_at = now()
   WHERE id = p_job_id
     AND run_id = p_run_id
     AND lease_token = p_lease_token
     AND status = 'processing'
   RETURNING attempt_count INTO v_attempt;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.generation_runs
     SET status = 'running',
         current_step = p_step,
         last_heartbeat_at = now(),
         updated_at = now()
   WHERE id = p_run_id
     AND lease_token = p_lease_token
     AND status IN ('queued', 'running');

  UPDATE public.generation_run_attempts
     SET step = p_step
   WHERE run_id = p_run_id
     AND attempt_number = v_attempt
     AND outcome = 'running';

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_generation_attempt_model(
  p_run_id uuid,
  p_lease_token uuid,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_input_tokens integer DEFAULT NULL,
  p_output_tokens integer DEFAULT NULL,
  p_total_tokens integer DEFAULT NULL,
  p_estimated_cost_usd numeric DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt integer;
BEGIN
  SELECT attempt_count INTO v_attempt
    FROM public.generation_runs
   WHERE id = p_run_id
     AND lease_token = p_lease_token
     AND status = 'running';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.generation_run_attempts
     SET provider = left(p_provider, 100),
         model = left(p_model, 200),
         prompt_version = left(p_prompt_version, 200),
         input_tokens = p_input_tokens,
         output_tokens = p_output_tokens,
         total_tokens = p_total_tokens,
         estimated_cost_usd = p_estimated_cost_usd
   WHERE run_id = p_run_id
     AND attempt_number = v_attempt;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_generation_job(
  p_job_id uuid,
  p_run_id uuid,
  p_lease_token uuid,
  p_status text,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt integer;
BEGIN
  IF p_status NOT IN (
    'partial_success', 'succeeded', 'failed', 'cancelled'
  ) THEN
    RAISE EXCEPTION 'invalid_generation_job_terminal_status';
  END IF;

  UPDATE public.generation_jobs
     SET status = p_status,
         payload = '{}'::jsonb,
         lease_expires_at = NULL,
         last_heartbeat_at = now(),
         last_error_code = CASE
           WHEN p_status IN ('failed', 'partial_success')
             THEN left(p_error_code, 100)
           ELSE NULL
         END,
         last_error_message = CASE
           WHEN p_status IN ('failed', 'partial_success')
             THEN left(p_error_message, 1000)
           ELSE NULL
         END,
         updated_at = now()
   WHERE id = p_job_id
     AND run_id = p_run_id
     AND lease_token = p_lease_token
     AND status = 'processing'
   RETURNING attempt_count INTO v_attempt;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.generation_run_attempts
     SET outcome = p_status,
         normalized_error_code = CASE
           WHEN p_status IN ('failed', 'partial_success')
             THEN left(p_error_code, 100)
           ELSE NULL
         END,
         normalized_error = CASE
           WHEN p_status IN ('failed', 'partial_success')
             THEN left(p_error_message, 1000)
           ELSE NULL
         END,
         completed_at = now()
   WHERE run_id = p_run_id
     AND attempt_number = v_attempt;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_generation_job(
  p_job_id uuid,
  p_run_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_error_message text,
  p_delay_seconds integer DEFAULT 60
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt integer;
BEGIN
  UPDATE public.generation_jobs
     SET status = 'published',
         available_at = now() + make_interval(
           secs => LEAST(GREATEST(p_delay_seconds, 1), 43200)
         ),
         lease_token = NULL,
         lease_expires_at = NULL,
         last_heartbeat_at = now(),
         last_error_code = left(p_error_code, 100),
         last_error_message = left(p_error_message, 1000),
         updated_at = now()
   WHERE id = p_job_id
     AND run_id = p_run_id
     AND lease_token = p_lease_token
     AND status = 'processing'
   RETURNING attempt_count INTO v_attempt;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.generation_runs
     SET status = 'queued',
         error_code = left(p_error_code, 100),
         error_message = left(p_error_message, 1000),
         retryable = true,
         completed_at = NULL,
         last_heartbeat_at = now(),
         updated_at = now()
   WHERE id = p_run_id
     AND lease_token = p_lease_token
     AND status = 'running';

  UPDATE public.generation_run_attempts
     SET outcome = 'failed',
         normalized_error_code = left(p_error_code, 100),
         normalized_error = left(p_error_message, 1000),
         completed_at = now()
   WHERE run_id = p_run_id
     AND attempt_number = v_attempt
     AND outcome = 'running';

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.dead_letter_generation_job(
  p_job_id uuid,
  p_run_id uuid,
  p_error_message text DEFAULT 'Generation exhausted its queue retries.'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.generation_jobs%ROWTYPE;
  v_run public.generation_runs%ROWTYPE;
  v_failure jsonb;
BEGIN
  SELECT * INTO v_job
    FROM public.generation_jobs
   WHERE id = p_job_id
     AND run_id = p_run_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  SELECT * INTO v_run
    FROM public.generation_runs
   WHERE id = p_run_id
     AND user_id = v_job.user_id
   FOR UPDATE;

  IF v_run.status IN (
    'partial_success', 'succeeded', 'failed', 'cancelled'
  ) THEN
    UPDATE public.generation_jobs
       SET status = v_run.status,
           payload = '{}'::jsonb,
           lease_token = NULL,
           lease_expires_at = NULL,
           updated_at = now()
     WHERE id = p_job_id;
    RETURN jsonb_build_object('outcome', 'terminal', 'status', v_run.status);
  END IF;

  -- A duplicate delivery can reach the DLQ while another copy still owns a
  -- healthy database lease. Do not terminalize or refund the active worker.
  IF v_job.status = 'processing'
     AND v_job.lease_expires_at IS NOT NULL
     AND v_job.lease_expires_at > now() THEN
    RETURN jsonb_build_object('outcome', 'busy');
  END IF;

  SELECT public.fail_generation_run(
    p_run_id,
    v_run.user_id,
    v_run.lease_token,
    'queue_retries_exhausted',
    left(p_error_message, 1000),
    true
  ) INTO v_failure;

  UPDATE public.generation_jobs
     SET status = 'failed',
         payload = '{}'::jsonb,
         lease_token = NULL,
         lease_expires_at = NULL,
         last_heartbeat_at = now(),
         last_error_code = 'queue_retries_exhausted',
         last_error_message = left(p_error_message, 1000),
         updated_at = now()
   WHERE id = p_job_id;

  UPDATE public.generation_run_attempts
     SET outcome = 'failed',
         normalized_error_code = 'queue_retries_exhausted',
         normalized_error = left(p_error_message, 1000),
         completed_at = COALESCE(completed_at, now())
   WHERE run_id = p_run_id
     AND outcome = 'running';

  RETURN COALESCE(
    v_failure,
    jsonb_build_object('outcome', 'failed', 'creditsRefunded', false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_generation_run(
  p_run_id uuid,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.generation_jobs%ROWTYPE;
  v_run public.generation_runs%ROWTYPE;
  v_refunded boolean := false;
  v_kit_id uuid;
BEGIN
  -- Match the consumer lock order (job, then run) to avoid a cancel/claim
  -- deadlock when both arrive at the same time.
  SELECT * INTO v_job
    FROM public.generation_jobs
   WHERE run_id = p_run_id
     AND user_id = p_user_id
   FOR UPDATE;

  SELECT * INTO v_run
    FROM public.generation_runs
   WHERE id = p_run_id
     AND user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  IF v_run.status IN (
    'partial_success', 'succeeded', 'failed', 'cancelled'
  ) THEN
    RETURN jsonb_build_object(
      'outcome', 'terminal',
      'status', v_run.status,
      'creditsRefunded', v_run.credits_refunded
    );
  END IF;

  SELECT id INTO v_kit_id
    FROM public.content_kits
   WHERE generation_run_id = p_run_id
   LIMIT 1;

  IF v_kit_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'outcome', 'terminal',
      'status', 'succeeded',
      'contentKitId', v_kit_id,
      'creditsRefunded', false
    );
  END IF;

  IF v_run.credits_reserved
     AND NOT v_run.credits_refunded
     AND v_run.credit_cost > 0 THEN
    PERFORM public.refund_credits(
      p_user_id,
      v_run.credit_cost,
      'refund',
      jsonb_build_object(
        'reason', 'cancelled',
        'generationRunId', p_run_id,
        'requestId', v_run.request_id
      )
    );
    v_refunded := true;
  END IF;

  UPDATE public.generation_runs
     SET status = 'cancelled',
         error_code = 'cancelled',
         error_message = 'Generation was cancelled by the user.',
         retryable = false,
         credits_refunded = credits_refunded OR v_refunded,
         completed_at = now(),
         last_heartbeat_at = now(),
         lease_token = gen_random_uuid(),
         updated_at = now()
   WHERE id = p_run_id;

  UPDATE public.generation_jobs
     SET status = 'cancelled',
         payload = '{}'::jsonb,
         lease_token = NULL,
         lease_expires_at = NULL,
         last_heartbeat_at = now(),
         updated_at = now()
   WHERE run_id = p_run_id
     AND user_id = p_user_id
     AND status IN ('pending', 'published', 'processing');

  UPDATE public.generation_run_attempts
     SET outcome = 'cancelled',
         normalized_error_code = 'cancelled',
         normalized_error = 'Generation was cancelled by the user.',
         completed_at = now()
   WHERE run_id = p_run_id
     AND outcome = 'running';

  RETURN jsonb_build_object(
    'outcome', 'cancelled',
    'creditsRefunded', v_run.credits_refunded OR v_refunded
  );
END;
$$;

-- Migration 056 predates partial_success. Keep every later failure/recovery
-- path from overwriting that terminal state, and make stale recovery close the
-- private job/attempt rows as well as the public run.
CREATE OR REPLACE FUNCTION public.fail_generation_run(
  p_run_id uuid,
  p_user_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.generation_runs%ROWTYPE;
  v_refunded boolean := false;
  v_kit_id uuid;
BEGIN
  SELECT * INTO v_run
    FROM public.generation_runs
   WHERE id = p_run_id
     AND user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  IF v_run.lease_token <> p_lease_token THEN
    RETURN jsonb_build_object('outcome', 'lease_lost');
  END IF;
  IF v_run.status IN (
    'partial_success', 'succeeded', 'failed', 'cancelled'
  ) THEN
    RETURN jsonb_build_object(
      'outcome', 'terminal',
      'status', v_run.status,
      'creditsRefunded', v_run.credits_refunded
    );
  END IF;

  SELECT id INTO v_kit_id
    FROM public.content_kits
   WHERE generation_run_id = p_run_id
   LIMIT 1;

  IF v_kit_id IS NOT NULL THEN
    UPDATE public.generation_runs
       SET status = 'succeeded',
           current_step = 'finalize',
           content_kit_id = v_kit_id,
           error_code = NULL,
           error_message = NULL,
           retryable = false,
           completed_at = now(),
           last_heartbeat_at = now(),
           updated_at = now()
     WHERE id = p_run_id
       AND lease_token = p_lease_token;
    RETURN jsonb_build_object(
      'outcome', 'succeeded',
      'contentKitId', v_kit_id,
      'creditsRefunded', false
    );
  END IF;

  IF v_run.credits_reserved
     AND NOT v_run.credits_refunded
     AND v_run.credit_cost > 0 THEN
    PERFORM public.refund_credits(
      p_user_id,
      v_run.credit_cost,
      'refund',
      jsonb_build_object(
        'reason', p_error_code,
        'generationRunId', p_run_id,
        'requestId', v_run.request_id
      )
    );
    v_refunded := true;
  END IF;

  UPDATE public.generation_runs
     SET status = 'failed',
         error_code = left(p_error_code, 100),
         error_message = left(p_error_message, 1000),
         retryable = p_retryable,
         credits_refunded = v_run.credits_refunded OR v_refunded,
         completed_at = now(),
         last_heartbeat_at = now(),
         updated_at = now()
   WHERE id = p_run_id
     AND lease_token = p_lease_token;

  RETURN jsonb_build_object(
    'outcome', 'failed',
    'creditsRefunded', v_run.credits_refunded OR v_refunded
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_generation_run(
  p_run_id uuid,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.generation_jobs%ROWTYPE;
  v_run public.generation_runs%ROWTYPE;
  v_refunded boolean := false;
  v_kit_id uuid;
BEGIN
  SELECT * INTO v_job
    FROM public.generation_jobs
   WHERE run_id = p_run_id
     AND user_id = p_user_id
   FOR UPDATE;

  SELECT * INTO v_run
    FROM public.generation_runs
   WHERE id = p_run_id
     AND user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  IF v_run.status IN (
    'partial_success', 'succeeded', 'failed', 'cancelled'
  ) THEN
    RETURN jsonb_build_object(
      'outcome', 'terminal',
      'status', v_run.status,
      'creditsRefunded', v_run.credits_refunded
    );
  END IF;
  IF (v_job.id IS NOT NULL
      AND v_job.status = 'processing'
      AND v_job.lease_expires_at > now())
     OR COALESCE(v_run.last_heartbeat_at, v_run.created_at)
        > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('outcome', 'busy');
  END IF;

  SELECT id INTO v_kit_id
    FROM public.content_kits
   WHERE generation_run_id = p_run_id
   LIMIT 1;
  IF v_kit_id IS NOT NULL THEN
    UPDATE public.generation_runs
       SET status = 'succeeded',
           current_step = 'finalize',
           content_kit_id = v_kit_id,
           error_code = NULL,
           error_message = NULL,
           retryable = false,
           completed_at = now(),
           last_heartbeat_at = now(),
           updated_at = now()
     WHERE id = p_run_id;
    UPDATE public.generation_jobs
       SET status = 'succeeded', payload = '{}'::jsonb,
           lease_token = NULL, lease_expires_at = NULL, updated_at = now()
     WHERE run_id = p_run_id;
    RETURN jsonb_build_object(
      'outcome', 'reconciled',
      'status', 'succeeded',
      'contentKitId', v_kit_id,
      'creditsRefunded', false
    );
  END IF;

  IF v_run.credits_reserved
     AND NOT v_run.credits_refunded
     AND v_run.credit_cost > 0 THEN
    PERFORM public.refund_credits(
      p_user_id,
      v_run.credit_cost,
      'refund',
      jsonb_build_object(
        'reason', 'execution_interrupted',
        'generationRunId', p_run_id,
        'requestId', v_run.request_id
      )
    );
    v_refunded := true;
  END IF;

  UPDATE public.generation_runs
     SET status = 'failed',
         error_code = 'execution_interrupted',
         error_message = 'Generation was interrupted before it completed.',
         retryable = true,
         credits_refunded = v_run.credits_refunded OR v_refunded,
         completed_at = now(),
         last_heartbeat_at = now(),
         updated_at = now()
   WHERE id = p_run_id;
  UPDATE public.generation_jobs
     SET status = 'failed', payload = '{}'::jsonb,
         lease_token = NULL, lease_expires_at = NULL,
         last_error_code = 'execution_interrupted',
         last_error_message = 'Generation was interrupted before it completed.',
         updated_at = now()
   WHERE run_id = p_run_id;
  UPDATE public.generation_run_attempts
     SET outcome = 'failed',
         normalized_error_code = 'execution_interrupted',
         normalized_error = 'Generation was interrupted before it completed.',
         completed_at = COALESCE(completed_at, now())
   WHERE run_id = p_run_id
     AND outcome = 'running';

  RETURN jsonb_build_object(
    'outcome', 'recovered',
    'creditsRefunded', v_run.credits_refunded OR v_refunded
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_generation_job(
  uuid, text, text, integer, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_generation_job(
  uuid, text, text, integer, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.mark_generation_job_published(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_generation_job_published(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.claim_generation_job(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_generation_job(uuid, uuid, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.heartbeat_generation_job(
  uuid, uuid, uuid, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_generation_job(
  uuid, uuid, uuid, text, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.record_generation_attempt_model(
  uuid, uuid, text, text, text, integer, integer, integer, numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_generation_attempt_model(
  uuid, uuid, text, text, text, integer, integer, integer, numeric
) TO service_role;

REVOKE ALL ON FUNCTION public.finish_generation_job(
  uuid, uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_generation_job(
  uuid, uuid, uuid, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.retry_generation_job(
  uuid, uuid, uuid, text, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_generation_job(
  uuid, uuid, uuid, text, text, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.dead_letter_generation_job(
  uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dead_letter_generation_job(
  uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_generation_run(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_generation_run(uuid, uuid)
  TO service_role;
