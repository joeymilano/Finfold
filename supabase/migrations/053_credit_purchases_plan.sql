-- ============================================================
-- Migration 053: credit_purchases.plan — Alipay QR-code 订阅订单
-- ============================================================
-- 套餐订阅也走经营码（按月预付费，仅 starter/pro）。复用 credit_purchases
-- 表，用 plan 字段区分两类经营码订单：
--   plan IS NULL                → 积分包订单（现有，兑现走 grant_purchase_credits）
--   plan IN ('starter','pro')   → 套餐订阅订单（兑现走开通套餐一个月）
-- provider='alipay_qrcode' 标识渠道。兑现分流见 lib/payment/qrcode-orders.ts
-- 的 confirmQrcodeOrder（有 plan → grantQrcodePlan，无 plan → grantPurchaseCredits）。
--
-- 不影响现有 Creem 订单与积分包订单（plan 保持 NULL）。CHECK 只允许 starter/pro，
-- 与 Joey 拍板的范围一致；growth/employee 仍走 Creem。
-- ============================================================

ALTER TABLE public.credit_purchases
  ADD COLUMN IF NOT EXISTS plan text
  CHECK (plan IS NULL OR plan IN ('starter','pro'));

-- 对账页按 plan 筛选（套餐 vs 积分包）+ 现有的 provider/status 索引已覆盖列表查询。
CREATE INDEX IF NOT EXISTS idx_credit_purchases_plan
  ON public.credit_purchases(plan)
  WHERE plan IS NOT NULL;
