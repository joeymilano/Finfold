-- ============================================================
-- Migration 046: product-activated referral rewards
--
-- A referral is attributed when a brand-new account is created from a
-- validated referral cookie. Rewards are granted only after that account
-- persists its first content kit. The completion RPC locks the referral row
-- and creates both credit batches in the same transaction, so retries and
-- concurrent first-generation requests cannot double-credit either user.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code       text        NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9_-]{8,16}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_codes_code_idx
  ON public.referral_codes(code);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
-- Service-role only. Public referral routes validate codes on the server.

CREATE TABLE IF NOT EXISTS public.referrals (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id           uuid        NOT NULL REFERENCES public.referral_codes(id) ON DELETE RESTRICT,
  referrer_user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id           uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status                     text        NOT NULL DEFAULT 'pending'
                                      CHECK (status IN ('pending','completed','ineligible')),
  attributed_at              timestamptz NOT NULL DEFAULT now(),
  activated_at               timestamptz,
  rewarded_at                timestamptz,
  referred_reward_credits    integer     NOT NULL DEFAULT 300 CHECK (referred_reward_credits >= 0),
  referrer_reward_credits    integer     NOT NULL DEFAULT 300 CHECK (referrer_reward_credits >= 0),
  referred_reward_balance_id uuid        REFERENCES public.credit_balances(id) ON DELETE SET NULL,
  referrer_reward_balance_id uuid        REFERENCES public.credit_balances(id) ON DELETE SET NULL,
  risk_flag                  boolean     NOT NULL DEFAULT false,
  risk_reason                text,
  ip_hash                    text,
  metadata                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CHECK (referrer_user_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_created_idx
  ON public.referrals(referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referrals_status_idx
  ON public.referrals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS referrals_ip_hash_idx
  ON public.referrals(ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
-- Service-role only. The /api/referrals/me route returns a sanitized view.

CREATE OR REPLACE FUNCTION public.complete_referral_reward(
  p_referred_user_id uuid,
  p_kit_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral                 public.referrals%ROWTYPE;
  v_referred_balance_id      uuid;
  v_referrer_balance_id      uuid;
  v_referrer_completed_count integer;
  v_referrer_credit_amount   integer := 0;
  v_expires_at               timestamptz := now() + interval '90 days';
BEGIN
  SELECT *
    INTO v_referral
  FROM public.referrals
  WHERE referred_user_id = p_referred_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('completed', false, 'reason', 'not_referred');
  END IF;

  IF v_referral.status = 'completed' THEN
    RETURN jsonb_build_object('completed', false, 'reason', 'already_completed');
  END IF;

  IF v_referral.status <> 'pending' THEN
    RETURN jsonb_build_object('completed', false, 'reason', 'ineligible');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.content_kits
    WHERE id = p_kit_id AND user_id = p_referred_user_id
  ) THEN
    RETURN jsonb_build_object('completed', false, 'reason', 'kit_not_found');
  END IF;

  -- The invited creator always receives the promised 300 Credits.
  INSERT INTO public.credit_balances (
    user_id, source, granted, used, expires_at
  ) VALUES (
    p_referred_user_id, 'grant', v_referral.referred_reward_credits, 0, v_expires_at
  )
  RETURNING id INTO v_referred_balance_id;

  INSERT INTO public.credit_transactions (
    user_id, delta, action, source, detail, balance_id
  ) VALUES (
    p_referred_user_id,
    v_referral.referred_reward_credits,
    'referral_reward',
    'referral',
    jsonb_build_object('referral_id', v_referral.id, 'role', 'referred'),
    v_referred_balance_id
  );

  -- Referrers earn for their first ten activated friends. The row lock above
  -- makes this referral idempotent. Lock the referrer's stable code row too,
  -- serializing two different friends who might finish at the same moment so
  -- the ten-reward cap cannot be exceeded.
  PERFORM 1
  FROM public.referral_codes
  WHERE user_id = v_referral.referrer_user_id
  FOR UPDATE;

  -- The count is a product cap, not a fraud judgment, so the invited creator
  -- still receives their reward at the cap.
  SELECT count(*)::integer
    INTO v_referrer_completed_count
  FROM public.referrals
  WHERE referrer_user_id = v_referral.referrer_user_id
    AND referrer_reward_balance_id IS NOT NULL;

  IF v_referrer_completed_count < 10 THEN
    v_referrer_credit_amount := v_referral.referrer_reward_credits;

    INSERT INTO public.credit_balances (
      user_id, source, granted, used, expires_at
    ) VALUES (
      v_referral.referrer_user_id, 'grant', v_referrer_credit_amount, 0, v_expires_at
    )
    RETURNING id INTO v_referrer_balance_id;

    INSERT INTO public.credit_transactions (
      user_id, delta, action, source, detail, balance_id
    ) VALUES (
      v_referral.referrer_user_id,
      v_referrer_credit_amount,
      'referral_reward',
      'referral',
      jsonb_build_object('referral_id', v_referral.id, 'role', 'referrer'),
      v_referrer_balance_id
    );
  END IF;

  UPDATE public.referrals
  SET status = 'completed',
      activated_at = now(),
      rewarded_at = now(),
      referred_reward_balance_id = v_referred_balance_id,
      referrer_reward_balance_id = v_referrer_balance_id,
      referrer_reward_credits = v_referrer_credit_amount,
      updated_at = now()
  WHERE id = v_referral.id;

  RETURN jsonb_build_object(
    'completed', true,
    'referral_id', v_referral.id,
    'referrer_user_id', v_referral.referrer_user_id,
    'referred_credits', v_referral.referred_reward_credits,
    'referrer_credits', v_referrer_credit_amount,
    'expires_at', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_referral_reward(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_referral_reward(uuid, uuid)
  TO service_role;
