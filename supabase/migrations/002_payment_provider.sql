-- ============================================================
-- Migration 002: Add payment provider columns to subscriptions
-- Run after 001 (initial schema)
-- ============================================================

-- Add new columns (additive, non-breaking)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'creem';

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_customer_id text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_subscription_id text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at timestamptz;

-- Unique index on provider_subscription_id (partial — ignores NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_sub_id
  ON public.subscriptions(provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- Index for provider-based lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_customer
  ON public.subscriptions(payment_provider, provider_customer_id);

-- Backfill from existing Stripe data (safe to re-run)
UPDATE public.subscriptions
SET
  provider_customer_id = stripe_customer_id,
  provider_subscription_id = stripe_subscription_id,
  payment_provider = 'creem'
WHERE stripe_customer_id IS NOT NULL
  AND provider_customer_id IS NULL;
