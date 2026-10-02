-- Migration 033: founder_email_sent_at
-- ----------------------------------------------------------------------------
-- 记录是否已向该用户发送过「创始人欢迎邮件」。
-- 用于 /auth/callback（邮箱确认 / OAuth 首次登录）去重，避免重复发送：
--   - 字段为 NULL  → 尚未发送，触发发送
--   - 字段非 NULL  → 已发送，跳过（覆盖重复登录、重复访问 callback 等情形）
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS founder_email_sent_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- Migration 033: Refund requests table
--
-- Enables in-app self-service refund requests. A paying user can
-- request a 7-day no-questions-asked refund from the billing page.
-- The request is recorded here, the subscription is canceled via
-- the Creem API (to stop the next renewal), and the actual refund
-- is issued by an operator from the Creem dashboard. When Creem
-- fires `refund.created`, the webhook marks the request completed.
--
-- Creem does not expose a public refund API, so the money movement
-- is a dashboard action — this table tracks the application-side
-- lifecycle (requested → completed/rejected) so the user gets a
-- one-click, trackable, no-email experience.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'creem',
  provider_subscription_id text,
  provider_order_id text,
  plan text NOT NULL,
  amount integer,
  currency text,
  reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_user
  ON public.refund_requests(user_id, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_requests_one_open
  ON public.refund_requests(user_id)
  WHERE status = 'pending';

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own refund requests" ON public.refund_requests;
CREATE POLICY "Users can read own refund requests"
  ON public.refund_requests FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access refund requests" ON public.refund_requests;
CREATE POLICY "Service role full access refund requests"
  ON public.refund_requests FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
