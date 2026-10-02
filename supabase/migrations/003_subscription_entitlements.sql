-- ============================================================
-- Migration 003: Subscription entitlement reliability
-- Run after 002.
-- ============================================================

-- One active customer binding row per user/provider is required for
-- checkout.completed to idempotently link Creem customers to app users.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_provider
  ON public.subscriptions(user_id, payment_provider);

-- Keep webhook subscription upserts idempotent when provider_subscription_id
-- is present, while still allowing checkout rows before subscription creation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_sub_id
  ON public.subscriptions(provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
