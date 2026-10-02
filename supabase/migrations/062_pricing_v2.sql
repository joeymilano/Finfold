-- ============================================================
-- Migration 062: Finfold Pricing V2
-- Versioned entitlement ids and market provenance.
-- Existing plan values remain valid and are intentionally not rewritten, so
-- active legacy subscriptions retain their current price and entitlement.
-- ============================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN (
    'free',
    'starter', 'pro', 'growth', 'employee',
    'starter_v2', 'creator_v2', 'growth_v2', 'digital_employee_v2'
  ));

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS entitlement_id text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS market text;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_entitlement_id_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_entitlement_id_check
  CHECK (
    entitlement_id IS NULL OR entitlement_id IN (
      'starter', 'pro', 'growth', 'employee',
      'starter_v2', 'creator_v2', 'growth_v2', 'digital_employee_v2'
    )
  );

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_market_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_market_check
  CHECK (market IS NULL OR market IN ('cn', 'global'));

ALTER TABLE public.credit_purchases
  DROP CONSTRAINT IF EXISTS credit_purchases_plan_check;

ALTER TABLE public.credit_purchases
  ADD CONSTRAINT credit_purchases_plan_check
  CHECK (plan IS NULL OR plan IN ('starter', 'pro', 'starter_v2', 'creator_v2'));
