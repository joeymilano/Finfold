-- ============================================================
-- Migration 052: Alipay 经营码 (QR-code) semi-manual reconciliation
-- ============================================================
-- Transitional payment channel for Finfold.app BEFORE Finfold.cn finishes
-- ICP filing and switches to the official Alipay "电脑网站支付" product.
--
-- A 经营码 is a static receive-money QR code: NO order API, NO async notify
-- callback. So we can't auto-detect payment. Instead the flow is:
--   1. user picks a credit pack → a `pending` credit_purchases row is written
--      with provider='alipay_qrcode' and amount_cents = pack price + a random
--      1–99 分 tail. That precise amount is the reconciliation anchor: when
--      the operator sees ¥49.37 land in the Alipay ledger, exactly one order
--      matches.
--   2. the pay page shows the QR + precise amount + a short order code and
--      polls for status.
--   3. the operator clicks "已收款" in the admin reconcile page → calls
--      grant_purchase_credits (migration 045), the SAME provider-agnostic
--      fulfillment path the Creem webhook uses. pending → paid + credits
--      granted, atomically and idempotently.
--
-- This migration ONLY adds columns that serve the reconcile flow. Creem
-- orders leave them NULL, so the existing checkout/webhook path is untouched.
-- `provider` has no CHECK constraint (added in 044 as a free-text column), so
-- 'alipay_qrcode' needs no constraint change. `status` reuses the existing
-- ('pending','paid','refunded','failed') set — no new state needed.
-- ============================================================

ALTER TABLE public.credit_purchases
  ADD COLUMN IF NOT EXISTS order_code   text,         -- short code FF-XXXXXXXX (recon helper anchor)
  ADD COLUMN IF NOT EXISTS expires_at   timestamptz,  -- order validity window (pay-page countdown)
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,  -- when the operator confirmed receipt
  ADD COLUMN IF NOT EXISTS confirmed_by uuid;         -- operator user_id (audit trail)

-- confirmed_by → auth.users. ON DELETE SET NULL so deleting an admin account
-- never cascades into wiping order history.
ALTER TABLE public.credit_purchases
  DROP CONSTRAINT IF EXISTS credit_purchases_confirmed_by_fkey;
ALTER TABLE public.credit_purchases
  ADD CONSTRAINT credit_purchases_confirmed_by_fkey
  FOREIGN KEY (confirmed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- order_code is globally unique (only 经营码 orders carry one).
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_purchases_order_code
  ON public.credit_purchases(order_code)
  WHERE order_code IS NOT NULL;

-- Admin reconcile page lists by provider + status, newest first.
CREATE INDEX IF NOT EXISTS idx_credit_purchases_provider_status_created
  ON public.credit_purchases(provider, status, created_at DESC);
