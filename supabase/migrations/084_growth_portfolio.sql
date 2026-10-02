-- ============================================================
-- Migration 084: Growth portfolio
--
-- Stores the small set of real account-level numbers shown in the Growth
-- Overview. Manual entries and future official synchronizers use the same
-- snapshot ledger so missing data is never silently replaced with estimates.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.managed_social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN (
    'wechat', 'xiaohongshu', 'zhihu', 'moments', 'x', 'linkedin',
    'instagram', 'facebook', 'reddit', 'product-hunt', 'threads',
    'hacker-news', 'indie-hackers', 'medium-substack'
  )),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  handle text CHECK (handle IS NULL OR char_length(handle) BETWEEN 1 AND 160),
  avatar_url text CHECK (avatar_url IS NULL OR avatar_url ~ '^https://[^[:space:]]+$'),
  connected_account_id uuid REFERENCES public.social_connection_accounts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS managed_social_accounts_user_status_idx
  ON public.managed_social_accounts(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.social_account_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.managed_social_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  follower_count bigint CHECK (follower_count IS NULL OR follower_count >= 0),
  period_follower_growth integer,
  views bigint CHECK (views IS NULL OR views >= 0),
  leads integer CHECK (leads IS NULL OR leads >= 0),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'official_sync')),
  measured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    follower_count IS NOT NULL OR period_follower_growth IS NOT NULL
    OR views IS NOT NULL OR leads IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS social_account_snapshots_account_measured_idx
  ON public.social_account_snapshots(account_id, measured_at DESC);

CREATE INDEX IF NOT EXISTS social_account_snapshots_user_measured_idx
  ON public.social_account_snapshots(user_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS public.growth_portfolio_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type text NOT NULL CHECK (period_type IN ('month', 'year')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  metric text NOT NULL CHECK (metric IN ('follower_growth', 'views', 'leads')),
  target_value bigint NOT NULL CHECK (target_value > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS growth_portfolio_goals_one_active_idx
  ON public.growth_portfolio_goals(user_id, period_type)
  WHERE status = 'active';

ALTER TABLE public.managed_social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_account_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_portfolio_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managed social accounts: select own" ON public.managed_social_accounts;
CREATE POLICY "managed social accounts: select own"
  ON public.managed_social_accounts FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "managed social accounts: insert own" ON public.managed_social_accounts;
CREATE POLICY "managed social accounts: insert own"
  ON public.managed_social_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "managed social accounts: update own" ON public.managed_social_accounts;
CREATE POLICY "managed social accounts: update own"
  ON public.managed_social_accounts FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "managed social accounts: delete own" ON public.managed_social_accounts;
CREATE POLICY "managed social accounts: delete own"
  ON public.managed_social_accounts FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "social account snapshots: select own" ON public.social_account_snapshots;
CREATE POLICY "social account snapshots: select own"
  ON public.social_account_snapshots FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "social account snapshots: insert own" ON public.social_account_snapshots;
CREATE POLICY "social account snapshots: insert own"
  ON public.social_account_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "social account snapshots: delete own" ON public.social_account_snapshots;
CREATE POLICY "social account snapshots: delete own"
  ON public.social_account_snapshots FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "growth portfolio goals: select own" ON public.growth_portfolio_goals;
CREATE POLICY "growth portfolio goals: select own"
  ON public.growth_portfolio_goals FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth portfolio goals: insert own" ON public.growth_portfolio_goals;
CREATE POLICY "growth portfolio goals: insert own"
  ON public.growth_portfolio_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth portfolio goals: update own" ON public.growth_portfolio_goals;
CREATE POLICY "growth portfolio goals: update own"
  ON public.growth_portfolio_goals FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth portfolio goals: delete own" ON public.growth_portfolio_goals;
CREATE POLICY "growth portfolio goals: delete own"
  ON public.growth_portfolio_goals FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.save_growth_portfolio_account(
  p_user_id uuid,
  p_account_id uuid,
  p_platform text,
  p_display_name text,
  p_handle text,
  p_follower_count bigint,
  p_period_follower_growth integer,
  p_views bigint,
  p_leads integer,
  p_measured_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.managed_social_accounts%ROWTYPE;
  v_snapshot public.social_account_snapshots%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR p_platform NOT IN (
       'wechat', 'xiaohongshu', 'zhihu', 'moments', 'x', 'linkedin',
       'instagram', 'facebook', 'reddit', 'product-hunt', 'threads',
       'hacker-news', 'indie-hackers', 'medium-substack'
     )
     OR p_display_name IS NULL
     OR char_length(trim(p_display_name)) NOT BETWEEN 1 AND 120
     OR (p_handle IS NOT NULL AND char_length(trim(p_handle)) NOT BETWEEN 1 AND 160)
     OR p_follower_count IS NULL OR p_follower_count < 0
     OR (p_views IS NOT NULL AND p_views < 0)
     OR (p_leads IS NOT NULL AND p_leads < 0) THEN
    RAISE EXCEPTION 'invalid_growth_portfolio_account';
  END IF;

  IF p_account_id IS NULL THEN
    INSERT INTO public.managed_social_accounts (user_id, platform, display_name, handle)
    VALUES (p_user_id, p_platform, trim(p_display_name), nullif(trim(p_handle), ''))
    RETURNING * INTO v_account;
  ELSE
    UPDATE public.managed_social_accounts
    SET platform = p_platform,
        display_name = trim(p_display_name),
        handle = nullif(trim(p_handle), ''),
        status = 'active',
        updated_at = now()
    WHERE id = p_account_id AND user_id = p_user_id
    RETURNING * INTO v_account;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'growth_portfolio_account_not_found';
    END IF;
  END IF;

  INSERT INTO public.social_account_snapshots (
    account_id, user_id, follower_count, period_follower_growth,
    views, leads, source, measured_at
  ) VALUES (
    v_account.id, p_user_id, p_follower_count, p_period_follower_growth,
    p_views, p_leads, 'manual', coalesce(p_measured_at, now())
  ) RETURNING * INTO v_snapshot;

  RETURN jsonb_build_object('account', to_jsonb(v_account), 'snapshot', to_jsonb(v_snapshot));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_growth_portfolio_goal(
  p_user_id uuid,
  p_period_type text,
  p_period_start date,
  p_period_end date,
  p_metric text,
  p_target_value bigint
) RETURNS public.growth_portfolio_goals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal public.growth_portfolio_goals%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR p_period_type NOT IN ('month', 'year')
     OR p_metric NOT IN ('follower_growth', 'views', 'leads')
     OR p_target_value IS NULL OR p_target_value <= 0
     OR p_period_start IS NULL OR p_period_end IS NULL
     OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'invalid_growth_portfolio_goal';
  END IF;

  UPDATE public.growth_portfolio_goals
  SET status = 'archived', updated_at = now()
  WHERE user_id = p_user_id
    AND period_type = p_period_type
    AND status = 'active';

  INSERT INTO public.growth_portfolio_goals (
    user_id, period_type, period_start, period_end, metric, target_value
  ) VALUES (
    p_user_id, p_period_type, p_period_start, p_period_end, p_metric, p_target_value
  ) RETURNING * INTO v_goal;

  RETURN v_goal;
END;
$$;

REVOKE ALL ON FUNCTION public.save_growth_portfolio_account(
  uuid, uuid, text, text, text, bigint, integer, bigint, integer, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_growth_portfolio_account(
  uuid, uuid, text, text, text, bigint, integer, bigint, integer, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.set_growth_portfolio_goal(
  uuid, text, date, date, text, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_growth_portfolio_goal(
  uuid, text, date, date, text, bigint
) TO service_role;
