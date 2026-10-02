-- ============================================================
-- 083: Atomic paid-plan entitlement + in-cycle credit top-up
--
-- A subscription upgrade must not leave profiles.plan updated while the
-- matching Credits grant fails (or vice versa). This service-role-only RPC
-- applies both changes in one database transaction. Replayed Creem webhooks are
-- idempotent: an existing plan batch is topped up only to the target allowance.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_plan_entitlement(
  p_user_id uuid,
  p_plan text,
  p_monthly_limit integer,
  p_credits integer,
  p_period_key text,
  p_expires_at timestamptz,
  p_founding_member boolean DEFAULT false,
  p_founding_member_locked_price integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_id uuid;
  v_previous_granted integer;
  v_credit_delta integer := 0;
  v_profile_count integer;
BEGIN
  IF p_plan NOT IN (
    'starter', 'pro', 'growth', 'employee',
    'starter_v2', 'creator_v2', 'growth_v2', 'digital_employee_v2'
  ) THEN
    RAISE EXCEPTION 'Unsupported paid plan';
  END IF;
  IF p_monthly_limit < 0 OR p_credits <= 0 OR p_period_key !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Invalid entitlement allowance';
  END IF;

  UPDATE public.profiles
  SET
    plan = p_plan,
    monthly_limit = p_monthly_limit,
    founding_member = CASE WHEN p_founding_member THEN true ELSE founding_member END,
    founding_member_locked_price = CASE
      WHEN p_founding_member THEN COALESCE(founding_member_locked_price, p_founding_member_locked_price)
      ELSE founding_member_locked_price
    END,
    updated_at = now()
  WHERE id = p_user_id;
  GET DIAGNOSTICS v_profile_count = ROW_COUNT;
  IF v_profile_count <> 1 THEN
    RAISE EXCEPTION 'Profile not found for paid entitlement';
  END IF;

  SELECT id, granted
  INTO v_balance_id, v_previous_granted
  FROM public.credit_balances
  WHERE user_id = p_user_id
    AND source = 'plan'
    AND period_key = p_period_key
  FOR UPDATE;

  IF v_balance_id IS NULL THEN
    INSERT INTO public.credit_balances (user_id, source, period_key, granted, expires_at)
    VALUES (p_user_id, 'plan', p_period_key, p_credits, p_expires_at)
    ON CONFLICT (user_id, period_key) WHERE source = 'plan' DO NOTHING
    RETURNING id, granted INTO v_balance_id, v_previous_granted;

    -- A concurrent signed webhook may have inserted the same period while this
    -- transaction waited. Lock and reuse that row instead of double granting.
    IF v_balance_id IS NULL THEN
      SELECT id, granted
      INTO v_balance_id, v_previous_granted
      FROM public.credit_balances
      WHERE user_id = p_user_id
        AND source = 'plan'
        AND period_key = p_period_key
      FOR UPDATE;
    ELSE
      v_credit_delta := p_credits;
      INSERT INTO public.credit_transactions (user_id, delta, action, source, balance_id, detail)
      VALUES (
        p_user_id,
        p_credits,
        'grant',
        'checkout',
        v_balance_id,
        jsonb_build_object('plan', p_plan, 'periodKey', p_period_key)
      );
    END IF;
  END IF;

  IF v_balance_id IS NULL THEN
    RAISE EXCEPTION 'Unable to create or locate plan credit balance';
  END IF;

  IF COALESCE(v_previous_granted, 0) < p_credits THEN
    v_credit_delta := p_credits - COALESCE(v_previous_granted, 0);
    UPDATE public.credit_balances
    SET granted = p_credits,
        expires_at = p_expires_at
    WHERE id = v_balance_id;

    INSERT INTO public.credit_transactions (user_id, delta, action, source, balance_id, detail)
    VALUES (
      p_user_id,
      v_credit_delta,
      'grant_upgrade',
      'checkout',
      v_balance_id,
      jsonb_build_object(
        'plan', p_plan,
        'periodKey', p_period_key,
        'previousAllowance', COALESCE(v_previous_granted, 0),
        'newAllowance', p_credits
      )
    );
  ELSE
    UPDATE public.credit_balances
    SET expires_at = GREATEST(expires_at, p_expires_at)
    WHERE id = v_balance_id;
  END IF;

  RETURN jsonb_build_object(
    'plan', p_plan,
    'balanceId', v_balance_id,
    'creditsAdded', v_credit_delta
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_plan_entitlement(
  uuid, text, integer, integer, text, timestamptz, boolean, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_plan_entitlement(
  uuid, text, integer, integer, text, timestamptz, boolean, integer
) TO service_role;
