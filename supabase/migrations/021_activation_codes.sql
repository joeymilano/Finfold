-- ============================================================
-- Migration 021: Activation / coupon codes (marketing trials)
--
-- Batch single-use codes: each code grants a plan tier for N days and can
-- be redeemed by exactly one account, exactly once. Used to hand out free
-- trials (e.g. "one month of Starter") in marketing without going through
-- Creem checkout.
--
-- Unlocking a paid tier requires BOTH profiles.plan AND an active
-- subscriptions row with payment_provider='creem' (see
-- lib/payment/entitlements.ts resolveEffectivePlan + the .eq('payment_provider',
-- 'creem') filters in app/api/generate and app/api/entitlements/check), so
-- redemption writes both — mirroring what grantPlanFromSubscription does for
-- a real Creem payment. current_period_end = now + duration_days, so the
-- trial auto-reverts to free on expiry with no extra bookkeeping.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activation_codes (
  code          text        primary key,
  plan          text        not null check (plan in ('starter', 'pro', 'growth', 'employee')),
  duration_days integer     not null default 30 check (duration_days > 0),
  -- Optional deadline by which the code must be redeemed (NULL = never
  -- expires as an *unredeemed* code). Distinct from the trial length above.
  expires_at    timestamptz,
  batch_label   text        not null default '',
  redeemed_by   uuid        references auth.users(id) on delete set null,
  redeemed_at   timestamptz,
  created_at    timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS activation_codes_batch_idx
  ON public.activation_codes (batch_label);
CREATE INDEX IF NOT EXISTS activation_codes_redeemed_by_idx
  ON public.activation_codes (redeemed_by);

ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;
-- No policies: only the service-role client (which bypasses RLS) touches
-- this table, via the redeem_activation_code() function and the admin
-- client in app/api/redeem. RLS stays on with no permissive policy so it
-- defaults to deny for any non-service-role caller — an anon user can never
-- enumerate or brute-force codes over PostgREST.

-- Atomically redeems a code for a user in a single round trip:
--   * locks the code row (FOR UPDATE) so two concurrent redeems can't both win
--   * refuses if the code is missing / already redeemed / past expires_at
--   * refuses if the user already has an active paid subscription
--     (marketing trials are for free users only)
--   * marks the code redeemed, sets profiles.plan + monthly_limit, and
--     upserts an active creem subscription row ending in duration_days
-- Returns a text status: 'ok:<plan>:<days>' on success, otherwise one of
-- 'invalid' | 'already_used' | 'expired' | 'already_subscribed'.
CREATE OR REPLACE FUNCTION public.redeem_activation_code(
  p_code text,
  p_user_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan          text;
  v_days          integer;
  v_expires_at    timestamptz;
  v_redeemed_by   uuid;
  v_has_active    boolean;
  v_limit         integer;
  v_period_end    timestamptz;
BEGIN
  SELECT plan, duration_days, expires_at, redeemed_by
    INTO v_plan, v_days, v_expires_at, v_redeemed_by
  FROM public.activation_codes
  WHERE code = p_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'invalid';
  END IF;

  IF v_redeemed_by IS NOT NULL THEN
    RETURN 'already_used';
  END IF;

  IF v_expires_at IS NOT NULL AND v_expires_at < now() THEN
    RETURN 'expired';
  END IF;

  -- Free-users-only: reject if any currently-active creem subscription exists.
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = p_user_id
      AND payment_provider = 'creem'
      AND status IN ('active', 'trialing', 'past_due')
      AND (current_period_end IS NULL OR current_period_end > now())
  ) INTO v_has_active;

  IF v_has_active THEN
    RETURN 'already_subscribed';
  END IF;

  -- Monthly kit allowance per plan — mirrors PLAN_MONTHLY_LIMITS in
  -- lib/payment/types.ts. Kept in sync manually (small, rarely-changing set).
  v_limit := CASE v_plan
    WHEN 'starter'  THEN 30
    WHEN 'pro'      THEN 100
    WHEN 'growth'   THEN 250
    WHEN 'employee' THEN 100000
    ELSE 3
  END;

  v_period_end := now() + (v_days || ' days')::interval;

  -- Claim the code.
  UPDATE public.activation_codes
  SET redeemed_by = p_user_id, redeemed_at = now()
  WHERE code = p_code;

  -- Grant the plan on the profile.
  UPDATE public.profiles
  SET plan = v_plan,
      monthly_limit = v_limit,
      subscription_status = 'active',
      updated_at = now()
  WHERE id = p_user_id;

  -- Active subscription row (payment_provider='creem' so the entitlement
  -- queries see it). Marker ids make it obvious this came from a code, and
  -- keep provider_subscription_id unique. If the user later pays via Creem,
  -- the webhook upserts this same (user_id, 'creem') row — a clean upgrade.
  INSERT INTO public.subscriptions (
    user_id, payment_provider, provider_customer_id, provider_subscription_id,
    status, current_period_end, updated_at
  )
  VALUES (
    p_user_id, 'creem', 'activation_code', 'activation_code:' || p_code,
    'active', v_period_end, now()
  )
  ON CONFLICT (user_id, payment_provider) DO UPDATE
    SET status = 'active',
        provider_subscription_id = excluded.provider_subscription_id,
        current_period_end = excluded.current_period_end,
        updated_at = now();

  RETURN 'ok:' || v_plan || ':' || v_days;
END;
$$;
