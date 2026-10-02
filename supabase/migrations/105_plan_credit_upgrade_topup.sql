-- ============================================================
-- Migration 105: Same-cycle plan upgrade tops up plan credits
--
-- Bug (user report, 2026-09-09 内测群): redeeming an activation code
-- flipped the profile to `starter` but the creation credits did not
-- increase — the user kept the free plan's leftover credits for the
-- rest of the cycle.
--
-- Root cause: grant_plan_credits (044) is idempotent per
-- (user_id, period_key) via `ON CONFLICT DO NOTHING`. A free user's
-- current cycle already has a plan batch (granted = PLAN_CREDITS.free),
-- so the post-redemption grant for the higher plan silently no-ops
-- until the next cycle starts.
--
-- Fix: keep the idempotent intent but make a HIGHER allowance win.
-- When the same cycle is granted more credits than the existing plan
-- batch holds, top the batch up by the difference only:
--   - granted is raised to the new allowance (remaining is a
--     generated column and grows by the same delta);
--   - the ledger gets one 'grant' row for the difference, so
--     reconciliation (059: SUM(remaining) vs SUM(delta)) stays balanced;
--   - repeated calls are still idempotent (delta 0 once granted
--     reaches the new allowance) and downgrades never claw credits back.
--
-- Existing affected users are repaired lazily: every billing route
-- (entitlements/check first among them) calls ensurePlanCredits with
-- the profile's current plan, so the first authenticated read after
-- this migration tops the cycle up. No backfill needed.
-- ============================================================

CREATE OR REPLACE FUNCTION public.grant_plan_credits(
  p_user_id uuid,
  p_credits integer,
  p_period_key text,
  p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      uuid;
  v_granted integer;
  v_delta   integer := 0;
BEGIN
  IF p_credits <= 0 THEN
    RETURN NULL;
  END IF;

  -- Serialize concurrent grants for the same (user, cycle).
  SELECT id, granted INTO v_id, v_granted
  FROM public.credit_balances
  WHERE user_id = p_user_id AND source = 'plan' AND period_key = p_period_key
  FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.credit_balances (user_id, source, period_key, granted, expires_at)
    VALUES (p_user_id, 'plan', p_period_key, p_credits, p_expires_at)
    ON CONFLICT (user_id, period_key) WHERE source = 'plan' DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      v_delta := p_credits;
    ELSE
      -- Lost an insert race: fall through with the winner's row.
      SELECT id, granted INTO v_id, v_granted
      FROM public.credit_balances
      WHERE user_id = p_user_id AND source = 'plan' AND period_key = p_period_key;
    END IF;
  END IF;

  -- Same-cycle plan upgrade (e.g. free -> starter after redeeming an
  -- activation code): top the batch up by the difference only.
  IF v_id IS NOT NULL AND v_granted IS NOT NULL AND p_credits > v_granted THEN
    v_delta := p_credits - v_granted;
    UPDATE public.credit_balances
    SET granted = p_credits,
        expires_at = GREATEST(expires_at, p_expires_at)
    WHERE id = v_id;
  END IF;

  IF v_delta > 0 THEN
    INSERT INTO public.credit_transactions (user_id, delta, action, source, balance_id)
    VALUES (p_user_id, v_delta, 'grant', 'system', v_id);
  END IF;

  RETURN v_id;
END;
$$;

-- CREATE OR REPLACE keeps the existing ACL; restate 057's server-only
-- grants so this migration is safe to apply on its own.
REVOKE ALL ON FUNCTION public.grant_plan_credits(
  uuid, integer, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_plan_credits(
  uuid, integer, text, timestamptz
) TO service_role;
