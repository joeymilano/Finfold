-- ============================================================
-- Migration 068: Idempotent AI usage operations
--
-- Credits are deducted before an AI provider call. This operation record binds
-- that debit to one stable operation key so retries, provider failures, and
-- recovery workers can settle or refund exactly once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_usage_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_key text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  source text NOT NULL,
  cost integer NOT NULL CHECK (cost > 0),
  status text NOT NULL CHECK (status IN ('reserved', 'started', 'settled', 'refunded')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  settled_at timestamptz,
  refunded_at timestamptz,
  CHECK (length(operation_key) BETWEEN 16 AND 255),
  CHECK (
    (status = 'reserved' AND started_at IS NULL AND settled_at IS NULL AND refunded_at IS NULL)
    OR (status = 'started' AND started_at IS NOT NULL AND settled_at IS NULL AND refunded_at IS NULL)
    OR (status = 'settled' AND started_at IS NOT NULL AND settled_at IS NOT NULL AND refunded_at IS NULL)
    OR (status = 'refunded' AND settled_at IS NULL AND refunded_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_operations_reserved
  ON public.ai_usage_operations(reserved_at)
  WHERE status = 'reserved';

CREATE INDEX IF NOT EXISTS idx_ai_usage_operations_user_created
  ON public.ai_usage_operations(user_id, reserved_at DESC);

ALTER TABLE public.ai_usage_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai usage operations: select own" ON public.ai_usage_operations;
CREATE POLICY "ai usage operations: select own"
  ON public.ai_usage_operations FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.reserve_ai_usage_operation(
  p_operation_key text,
  p_user_id uuid,
  p_action text,
  p_cost integer,
  p_source text,
  p_detail jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
  operation_id uuid,
  status text,
  available integer,
  is_new boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation public.ai_usage_operations%ROWTYPE;
  v_available integer;
BEGIN
  IF p_operation_key IS NULL
     OR p_operation_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,254}$'
     OR p_user_id IS NULL
     OR p_action IS NULL
     OR length(p_action) < 1
     OR length(p_action) > 100
     OR p_cost IS NULL
     OR p_cost <= 0
     OR p_source IS NULL
     OR length(p_source) < 1
     OR length(p_source) > 100
     OR p_detail IS NULL
     OR jsonb_typeof(p_detail) <> 'object' THEN
    RAISE EXCEPTION 'invalid_ai_usage_operation';
  END IF;

  INSERT INTO public.ai_usage_operations (
    operation_key,
    user_id,
    action,
    source,
    cost,
    status,
    detail
  ) VALUES (
    p_operation_key,
    p_user_id,
    p_action,
    p_source,
    p_cost,
    'reserved',
    p_detail
  )
  ON CONFLICT (operation_key) DO NOTHING
  RETURNING * INTO v_operation;

  IF NOT FOUND THEN
    SELECT * INTO v_operation
    FROM public.ai_usage_operations
    WHERE operation_key = p_operation_key
    FOR UPDATE;

    IF v_operation.user_id <> p_user_id
       OR v_operation.action <> p_action
       OR v_operation.source <> p_source
      OR v_operation.cost <> p_cost
      OR v_operation.detail <> p_detail THEN
      RAISE EXCEPTION 'ai_usage_operation_mismatch';
    END IF;

    RETURN QUERY SELECT
      v_operation.id,
      v_operation.status,
      public.get_available_credits(p_user_id),
      false;
    RETURN;
  END IF;

  SELECT public.reserve_credits(
    p_user_id,
    p_cost,
    p_action,
    p_source,
    p_detail || jsonb_build_object('operationKey', p_operation_key)
  ) INTO v_available;

  IF v_available < 0 THEN
    DELETE FROM public.ai_usage_operations WHERE id = v_operation.id;
    RETURN QUERY SELECT
      NULL::uuid,
      'insufficient_credits'::text,
      public.get_available_credits(p_user_id),
      true;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_operation.id, 'reserved'::text, v_available, true;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_ai_usage_operation(
  p_operation_id uuid,
  p_user_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation public.ai_usage_operations%ROWTYPE;
BEGIN
  SELECT * INTO v_operation
  FROM public.ai_usage_operations
  WHERE id = p_operation_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ai_usage_operation_not_found';
  END IF;

  IF v_operation.status = 'reserved' THEN
    UPDATE public.ai_usage_operations
    SET status = 'started', started_at = now()
    WHERE id = v_operation.id;
    RETURN 'started';
  END IF;

  RETURN v_operation.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_ai_usage_operation(
  p_operation_id uuid,
  p_user_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation public.ai_usage_operations%ROWTYPE;
BEGIN
  SELECT * INTO v_operation
  FROM public.ai_usage_operations
  WHERE id = p_operation_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ai_usage_operation_not_found';
  END IF;

  IF v_operation.status = 'started' THEN
    UPDATE public.ai_usage_operations
    SET status = 'settled', settled_at = now()
    WHERE id = v_operation.id;
    RETURN 'settled';
  END IF;

  RETURN v_operation.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_ai_usage_operation(
  p_operation_id uuid,
  p_user_id uuid,
  p_reason text
) RETURNS TABLE (
  status text,
  refunded boolean,
  available integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation public.ai_usage_operations%ROWTYPE;
BEGIN
  IF p_reason IS NULL
     OR p_reason !~ '^[a-z][a-z0-9_]{0,99}$' THEN
    RAISE EXCEPTION 'invalid_ai_usage_refund_reason';
  END IF;

  SELECT * INTO v_operation
  FROM public.ai_usage_operations
  WHERE id = p_operation_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ai_usage_operation_not_found';
  END IF;

  IF v_operation.status NOT IN ('reserved', 'started') THEN
    RETURN QUERY SELECT
      v_operation.status,
      false,
      public.get_available_credits(p_user_id);
    RETURN;
  END IF;

  PERFORM public.refund_credits(
    p_user_id,
    v_operation.cost,
    'refund',
    jsonb_build_object(
      'reason', p_reason,
      'operationId', v_operation.id,
      'operationKey', v_operation.operation_key
    )
  );

  UPDATE public.ai_usage_operations
  SET status = 'refunded', refunded_at = now()
  WHERE id = v_operation.id;

  RETURN QUERY SELECT
    'refunded'::text,
    true,
    public.get_available_credits(p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_ai_usage_operations(
  p_before timestamptz,
  p_limit integer DEFAULT 100
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation public.ai_usage_operations%ROWTYPE;
  v_refunded integer := 0;
BEGIN
  IF p_before IS NULL
     OR p_before > now()
     OR p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 1_000 THEN
    RAISE EXCEPTION 'invalid_ai_usage_recovery_request';
  END IF;

  FOR v_operation IN
    SELECT *
    FROM public.ai_usage_operations
    WHERE status = 'reserved'
      AND reserved_at < p_before
    ORDER BY reserved_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.refund_credits(
      v_operation.user_id,
      v_operation.cost,
      'refund',
      v_operation.detail || jsonb_build_object(
        'reason', 'ai_usage_operation_stale',
        'operationId', v_operation.id,
        'operationKey', v_operation.operation_key
      )
    );

    UPDATE public.ai_usage_operations
    SET status = 'refunded', refunded_at = now()
    WHERE id = v_operation.id;
    v_refunded := v_refunded + 1;
  END LOOP;

  RETURN v_refunded;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_usage_operation(
  text, uuid, text, integer, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage_operation(
  text, uuid, text, integer, text, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.settle_ai_usage_operation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_ai_usage_operation(uuid, uuid)
TO service_role;

REVOKE ALL ON FUNCTION public.start_ai_usage_operation(uuid, uuid)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.settle_ai_usage_operation(uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_ai_usage_operation(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.refund_ai_usage_operation(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ai_usage_operation(uuid, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.recover_stale_ai_usage_operations(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_ai_usage_operations(timestamptz, integer)
  TO service_role;