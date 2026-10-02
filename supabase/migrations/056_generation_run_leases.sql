-- ============================================================
-- Migration 056: Generation run leases + atomic credit recovery
--
-- Migration 055 records durable state. This migration closes the two crash
-- windows that remain if credit reservation/refund and run state are written
-- in separate database transactions:
--
--   reserve credits -> process dies -> run does not know it must refund
--   refund credits  -> process dies -> retry refunds the same run twice
--
-- A lease also prevents an old Worker invocation from persisting a kit after
-- a stale run has already been recovered and refunded.
-- ============================================================

ALTER TABLE public.generation_runs
  ADD COLUMN IF NOT EXISTS lease_token uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.generation_runs
  ADD COLUMN IF NOT EXISTS credits_reserved boolean NOT NULL DEFAULT false;

ALTER TABLE public.content_kits
  ADD COLUMN IF NOT EXISTS generation_run_id uuid
  REFERENCES public.generation_runs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS content_kits_generation_run_idx
  ON public.content_kits(generation_run_id)
  WHERE generation_run_id IS NOT NULL;

ALTER TABLE public.generation_runs
  DROP CONSTRAINT IF EXISTS generation_runs_refund_requires_reservation_check;

ALTER TABLE public.generation_runs
  ADD CONSTRAINT generation_runs_refund_requires_reservation_check
  CHECK (NOT credits_refunded OR credits_reserved);

-- Atomically reserve credits and record that this run owns the reservation.
-- The run row is locked first, so one lease cannot charge twice.
CREATE OR REPLACE FUNCTION public.reserve_generation_run_credits(
  p_run_id uuid,
  p_user_id uuid,
  p_lease_token uuid,
  p_amount integer,
  p_action text,
  p_source text DEFAULT 'workbench',
  p_detail jsonb DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.generation_runs%ROWTYPE;
  v_available integer;
BEGIN
  SELECT *
    INTO v_run
    FROM public.generation_runs
   WHERE id = p_run_id
     AND user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_run.lease_token <> p_lease_token
     OR v_run.status NOT IN ('queued', 'running') THEN
    RAISE EXCEPTION 'generation_run_lease_lost';
  END IF;

  IF v_run.credits_reserved THEN
    RAISE EXCEPTION 'generation_run_already_charged';
  END IF;

  SELECT public.reserve_credits(
    p_user_id,
    p_amount,
    p_action,
    p_source,
    p_detail
  ) INTO v_available;

  IF v_available < 0 THEN
    RETURN -1;
  END IF;

  UPDATE public.generation_runs
     SET credits_reserved = true,
         credit_cost = p_amount,
         last_heartbeat_at = now(),
         updated_at = now()
   WHERE id = p_run_id
     AND lease_token = p_lease_token;

  RETURN v_available;
END;
$$;

-- Atomically terminalize a failed run and refund at most once. Row locking +
-- the terminal status check makes repeated failure delivery idempotent.
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
  SELECT *
    INTO v_run
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

  IF v_run.status IN ('succeeded', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'outcome', 'terminal',
      'status', v_run.status,
      'creditsRefunded', v_run.credits_refunded
    );
  END IF;

  SELECT id
    INTO v_kit_id
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

-- Reclaim a run only after its lease has stopped heartbeating for five
-- minutes. The refund and terminal transition share the same transaction.
CREATE OR REPLACE FUNCTION public.recover_stale_generation_run(
  p_run_id uuid,
  p_user_id uuid
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
  SELECT *
    INTO v_run
    FROM public.generation_runs
   WHERE id = p_run_id
     AND user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  IF v_run.status IN ('succeeded', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'outcome', 'terminal',
      'status', v_run.status,
      'creditsRefunded', v_run.credits_refunded
    );
  END IF;

  IF COALESCE(v_run.last_heartbeat_at, v_run.created_at)
     > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('outcome', 'busy');
  END IF;

  SELECT id
    INTO v_kit_id
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

  RETURN jsonb_build_object(
    'outcome', 'recovered',
    'creditsRefunded', v_run.credits_refunded OR v_refunded
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_generation_run_credits(
  uuid, uuid, uuid, integer, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_generation_run_credits(
  uuid, uuid, uuid, integer, text, text, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.fail_generation_run(
  uuid, uuid, uuid, text, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_generation_run(
  uuid, uuid, uuid, text, text, boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.recover_stale_generation_run(
  uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_generation_run(
  uuid, uuid
) TO service_role;
