-- ============================================================
-- Migration 073: contain unbounded generation re-claims
--
-- Production incident (2026-08-06): queue invocations were dying silently
-- after the paid model call (most likely the Worker CPU limit, Cloudflare
-- Error 1102) with no exception ever raised, so nothing in
-- app/api/generate/route.ts's catch block ran. The lease (900s) would
-- expire, the every-minute cron's dispatchGenerationOutbox would see the
-- job as "abandoned" (lease_expires_at < now()) and republish it, and
-- claim_generation_job would happily re-claim and re-run generation from
-- scratch — including re-billing DeepSeek/GLM — every ~15-20 minutes,
-- forever. One production job reached attempt_count = 21. Nothing capped
-- attempt_count, and nothing checked whether the work the job was
-- supposed to do (persist a content_kit) had already succeeded before
-- re-running it. 7 of 9 stuck runs already had their content_kit
-- persisted; only the terminal write never landed.
--
-- This migration adds the two missing guards directly in
-- claim_generation_job (the single choke point every re-claim passes
-- through, whether from the outbox, a duplicate Queue delivery, or a
-- manual retry):
--   1. Reconcile-before-reclaim: if a content_kits row already exists for
--      the run, finish it as succeeded instead of re-running the model.
--   2. Attempt cap: once attempt_count reaches MAX_GENERATION_ATTEMPTS,
--      stop claiming, refund the reserved credits, and fail the run.
--
-- recover_stale_generation_run's heartbeat-freshness busy guard is also
-- relaxed with an absolute-age escape hatch, because attempt (1) above
-- kept every re-claim's heartbeat fresh, which made the run permanently
-- "busy" from every existing recovery path (client poll, /recover route,
-- this RPC itself).
-- ============================================================

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
  v_kit_id uuid;
  v_refunded boolean := false;
  v_max_attempts CONSTANT integer := 5;
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

  -- The prior invocation may have died silently after already persisting
  -- the content kit (paid model call succeeded, only the terminal write
  -- never landed). Reconcile instead of re-running generation and
  -- re-billing the LLM provider for work that is already done.
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
       SET status = 'succeeded',
           payload = '{}'::jsonb,
           lease_token = NULL,
           lease_expires_at = NULL,
           updated_at = now()
     WHERE id = v_job.id;
    UPDATE public.generation_run_attempts
       SET outcome = 'succeeded',
           completed_at = now()
     WHERE run_id = p_run_id
       AND outcome = 'running';
    RETURN jsonb_build_object(
      'outcome', 'reconciled',
      'status', 'succeeded',
      'contentKitId', v_kit_id
    );
  END IF;

  -- No kit exists and this job has already been re-claimed
  -- v_max_attempts times without reaching a terminal state — the work is
  -- not completing. Stop re-running it and refund instead of looping
  -- forever.
  IF v_job.attempt_count >= v_max_attempts THEN
    IF v_run.credits_reserved
       AND NOT v_run.credits_refunded
       AND v_run.credit_cost > 0 THEN
      PERFORM public.refund_credits(
        v_run.user_id,
        v_run.credit_cost,
        'refund',
        jsonb_build_object(
          'reason', 'attempt_limit_exhausted',
          'generationRunId', p_run_id,
          'requestId', v_run.request_id
        )
      );
      v_refunded := true;
    END IF;

    UPDATE public.generation_runs
       SET status = 'failed',
           error_code = 'attempt_limit_exhausted',
           error_message = 'Generation was retried too many times without completing.',
           retryable = false,
           credits_refunded = v_run.credits_refunded OR v_refunded,
           completed_at = now(),
           last_heartbeat_at = now(),
           updated_at = now()
     WHERE id = p_run_id
     RETURNING * INTO v_run;
    UPDATE public.generation_jobs
       SET status = 'failed',
           payload = '{}'::jsonb,
           lease_token = NULL,
           lease_expires_at = NULL,
           last_error_code = 'attempt_limit_exhausted',
           last_error_message = 'Generation was retried too many times without completing.',
           updated_at = now()
     WHERE id = v_job.id;
    UPDATE public.generation_run_attempts
       SET outcome = 'failed',
           normalized_error_code = 'attempt_limit_exhausted',
           normalized_error = 'Generation was retried too many times without completing.',
           completed_at = now()
     WHERE run_id = p_run_id
       AND outcome = 'running';

    RETURN jsonb_build_object(
      'outcome', 'terminal',
      'status', 'failed',
      'run', to_jsonb(v_run)
    );
  END IF;

  -- A prior attempt is being superseded by this claim. Close its dangling
  -- attempt row rather than leaving it at outcome='running' forever — the
  -- new attempt row inserted below is the one now in flight.
  UPDATE public.generation_run_attempts
     SET outcome = 'failed',
         normalized_error_code = 'execution_interrupted',
         normalized_error = 'Generation invocation did not report a terminal outcome.',
         completed_at = now()
   WHERE run_id = p_run_id
     AND outcome = 'running';

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

-- Relax the busy guard with an absolute-age escape hatch. Every re-claim
-- under the old claim_generation_job kept last_heartbeat_at fresh, which
-- made the "> now() - interval '5 minutes'" check below permanently true
-- for a run stuck in the re-claim loop — recovery could never reach it.
-- A run this old with a kit already persisted is safe to reconcile
-- regardless of heartbeat freshness; a run this old with no kit yet is
-- still refunded and failed, same as before.
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

  SELECT id INTO v_kit_id
    FROM public.content_kits
   WHERE generation_run_id = p_run_id
   LIMIT 1;

  IF v_kit_id IS NULL
     AND ((v_job.id IS NOT NULL
           AND v_job.status = 'processing'
           AND v_job.lease_expires_at > now())
          OR COALESCE(v_run.last_heartbeat_at, v_run.created_at)
             > now() - interval '5 minutes')
     AND v_run.created_at > now() - interval '20 minutes' THEN
    RETURN jsonb_build_object('outcome', 'busy');
  END IF;

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
    UPDATE public.generation_run_attempts
       SET outcome = 'succeeded',
           completed_at = COALESCE(completed_at, now())
     WHERE run_id = p_run_id
       AND outcome = 'running';
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

REVOKE ALL ON FUNCTION public.claim_generation_job(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_generation_job(uuid, uuid, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.recover_stale_generation_run(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_generation_run(uuid, uuid)
  TO service_role;
