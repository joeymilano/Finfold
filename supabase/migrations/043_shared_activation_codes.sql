-- ============================================================
-- Migration 043: bounded multi-use activation codes
--
-- Existing activation codes remain single-use by default. Marketing channels
-- such as Product Hunt can opt one code into a larger redemption limit without
-- weakening the existing free-account-only or expiry checks.
-- ============================================================

ALTER TABLE public.activation_codes
  ADD COLUMN IF NOT EXISTS max_redemptions integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS redemption_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.activation_codes
  DROP CONSTRAINT IF EXISTS activation_codes_max_redemptions_check,
  DROP CONSTRAINT IF EXISTS activation_codes_redemption_count_check,
  ADD CONSTRAINT activation_codes_max_redemptions_check
    CHECK (max_redemptions > 0),
  ADD CONSTRAINT activation_codes_redemption_count_check
    CHECK (redemption_count >= 0 AND redemption_count <= max_redemptions);

CREATE TABLE IF NOT EXISTS public.activation_code_redemptions (
  code        text        NOT NULL REFERENCES public.activation_codes(code) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, user_id)
);

CREATE INDEX IF NOT EXISTS activation_code_redemptions_user_idx
  ON public.activation_code_redemptions(user_id, redeemed_at DESC);

ALTER TABLE public.activation_code_redemptions ENABLE ROW LEVEL SECURITY;

-- Preserve the audit trail for codes redeemed before this migration.
INSERT INTO public.activation_code_redemptions (code, user_id, redeemed_at)
SELECT code, redeemed_by, COALESCE(redeemed_at, created_at)
FROM public.activation_codes
WHERE redeemed_by IS NOT NULL
ON CONFLICT (code, user_id) DO NOTHING;

UPDATE public.activation_codes AS code
SET redemption_count = GREATEST(
  code.redemption_count,
  (
    SELECT count(*)::integer
    FROM public.activation_code_redemptions AS redemption
    WHERE redemption.code = code.code
  )
);

-- Atomically redeems both legacy single-use codes and explicitly configured
-- bounded multi-use codes. The activation-code row lock serializes concurrent
-- claims, so the configured limit cannot be exceeded.
CREATE OR REPLACE FUNCTION public.redeem_activation_code(
  p_code text,
  p_user_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan               text;
  v_days               integer;
  v_expires_at         timestamptz;
  v_max_redemptions    integer;
  v_redemption_count   integer;
  v_has_active         boolean;
  v_limit              integer;
  v_period_end         timestamptz;
BEGIN
  SELECT plan, duration_days, expires_at, max_redemptions, redemption_count
    INTO v_plan, v_days, v_expires_at, v_max_redemptions, v_redemption_count
  FROM public.activation_codes
  WHERE code = p_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.activation_code_redemptions
    WHERE code = p_code AND user_id = p_user_id
  ) THEN
    RETURN 'already_used';
  END IF;

  IF v_redemption_count >= v_max_redemptions THEN
    IF v_max_redemptions = 1 THEN
      RETURN 'already_used';
    END IF;
    RETURN 'redemption_limit_reached';
  END IF;

  IF v_expires_at IS NOT NULL AND v_expires_at < now() THEN
    RETURN 'expired';
  END IF;

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

  v_limit := CASE v_plan
    WHEN 'starter'  THEN 30
    WHEN 'pro'      THEN 100
    WHEN 'growth'   THEN 250
    WHEN 'employee' THEN 100000
    ELSE 3
  END;

  v_period_end := now() + (v_days || ' days')::interval;

  INSERT INTO public.activation_code_redemptions (code, user_id)
  VALUES (p_code, p_user_id);

  UPDATE public.activation_codes
  SET redemption_count = redemption_count + 1,
      -- Keep the legacy columns populated for existing founder evidence views.
      redeemed_by = COALESCE(redeemed_by, p_user_id),
      redeemed_at = COALESCE(redeemed_at, now())
  WHERE code = p_code;

  UPDATE public.profiles
  SET plan = v_plan,
      monthly_limit = v_limit,
      subscription_status = 'active',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.subscriptions (
    user_id, payment_provider, provider_customer_id, provider_subscription_id,
    status, current_period_end, updated_at
  )
  VALUES (
    p_user_id,
    'creem',
    'activation_code',
    'activation_code:' || p_code || ':' || p_user_id::text,
    'active',
    v_period_end,
    now()
  )
  ON CONFLICT (user_id, payment_provider) DO UPDATE
    SET status = 'active',
        provider_customer_id = excluded.provider_customer_id,
        provider_subscription_id = excluded.provider_subscription_id,
        current_period_end = excluded.current_period_end,
        updated_at = now();

  RETURN 'ok:' || v_plan || ':' || v_days;
END;
$$;
