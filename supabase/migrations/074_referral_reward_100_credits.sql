-- ============================================================
-- Migration 074: lower referral reward from 300 to 100 Credits
--
-- Applies the new default to future referrals and updates any
-- still-pending referrals so friends who haven't completed their
-- first creation yet see the current offer. Already-completed
-- referrals keep the credits they were actually granted.
-- ============================================================

ALTER TABLE public.referrals
  ALTER COLUMN referred_reward_credits SET DEFAULT 100,
  ALTER COLUMN referrer_reward_credits SET DEFAULT 100;

UPDATE public.referrals
SET referred_reward_credits = 100,
    referrer_reward_credits = 100,
    updated_at = now()
WHERE status = 'pending';
