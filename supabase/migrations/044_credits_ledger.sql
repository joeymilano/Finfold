-- ============================================================
-- Migration 044: Credits ledger — plan/purchase balances + transactions
--
-- Implements the credits billing model (billing-redesign):
--   - plan credits: granted per billing cycle, expire at period end
--   - purchase credits: bought separately, long-lived (no expiry)
--   - consumption: different actions cost different amounts (ACTION_CREDITS
--     in lib/payment/types.ts), not a flat "1 kit = 1 credit" any more
--   - ledger: every grant/consume/refund/purchase is a row in
--     credit_transactions, powering the "explain your spend" UI (§10.2)
--
-- Design follows migration 008's atomic-reservation pattern (the
-- reserve/release pair) but generalizes "1 reservation = 1 kit" to
-- "1 reservation = N credits, drawn FIFO across balance batches by expiry"
-- so soon-to-expire plan credits are spent before long-lived purchases (§10.4).
--
-- usage_counters (008) is intentionally LEFT UNTOUCHED for backward
-- compatibility. The billing routes are migrated off it in app/api/generate
-- and lib/mcp/service (they now call reserve_credits). The legacy
-- reserve_generation_credit function keeps its exact signature so any
-- unmigrated caller still compiles and works — it is not the billing path
-- any more, just a safety net.
--
-- NOTE: this migration does NOT backfill balances for existing users. The
-- product is pre-launch (see migration 017's comment — no real paid customers
-- yet), so entitlements.ts grants the current cycle's plan credits lazily on
-- first authenticated access after this migration runs.
-- ============================================================

-- 1. Balance batches ------------------------------------------------
-- Each row is ONE bucket of credits: a monthly plan allowance, a top-up
-- purchase, or a manual grant/refund adjustment. `remaining` is derived.
CREATE TABLE IF NOT EXISTS public.credit_balances (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  -- 'plan'     = monthly subscription allowance (expires at cycle end)
  -- 'purchase' = paid top-up (long-lived)
  -- 'grant'    = manual/operator adjustment
  -- 'refund'   = credits returned after a failed generation
  source      text        not null check (source in ('plan','purchase','grant','refund')),
  -- 'YYYY-MM' for plan batches (their billing cycle); NULL otherwise
  period_key  text,
  granted     integer     not null check (granted >= 0),
  used        integer     not null default 0 check (used >= 0),
  remaining   integer     generated always as (granted - used) stored,
  -- Plan credits expire at cycle end; purchases & refunds are long-lived (NULL)
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  check (used <= granted)
);

-- One live plan batch per user per cycle (idempotent grant, see grant_plan_credits).
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_balances_plan_period
  ON public.credit_balances(user_id, period_key)
  WHERE source = 'plan';

CREATE INDEX IF NOT EXISTS idx_credit_balances_user_expiry
  ON public.credit_balances(user_id, expires_at);

-- Cheap lookup of batches that still have something to spend.
CREATE INDEX IF NOT EXISTS idx_credit_balances_user_remaining
  ON public.credit_balances(user_id)
  WHERE remaining > 0;

ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credit balances: select own" ON public.credit_balances;
CREATE POLICY "credit balances: select own"
  ON public.credit_balances FOR SELECT
  USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policy: only the service role (backend routes) mutates
-- balances, mirroring usage_counters / trial_generations / mcp_api_tokens.

-- 2. Transactions (grant / consume / refund / purchase) ------------
-- Append-only ledger. Positive delta = credit added; negative = consumed.
-- `action` matches an ACTION_CREDITS key (or grant/purchase/refund/expire);
-- `detail` carries the human-readable breakdown for the spend-explanation UI.
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  delta         integer     not null,
  action        text        not null,
  -- where the spend came from: 'workbench','mcp','agent','auto','checkout','system'
  source        text        not null default 'system',
  detail        jsonb,
  balance_id    uuid        references public.credit_balances(id) on delete set null,
  created_at    timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user_created
  ON public.credit_transactions(user_id, created_at DESC);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credit transactions: select own" ON public.credit_transactions;
CREATE POLICY "credit transactions: select own"
  ON public.credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Purchases (top-up orders, independent of subscription) -------
CREATE TABLE IF NOT EXISTS public.credit_purchases (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  credits              integer     not null check (credits > 0),
  amount_cents         integer     not null check (amount_cents >= 0),
  currency             text        not null default 'cny',
  provider             text        not null default 'creem',
  provider_checkout_id text,
  status               text        not null default 'pending'
                       check (status in ('pending','paid','refunded','failed')),
  balance_id           uuid        references public.credit_balances(id) on delete set null,
  created_at           timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_credit_purchases_user
  ON public.credit_purchases(user_id, created_at DESC);

ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credit purchases: select own" ON public.credit_purchases;
CREATE POLICY "credit purchases: select own"
  ON public.credit_purchases FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Total available credits for a user right now -----------------
-- plan + purchase + refund, excluding expired plan batches and fully-used batches.
CREATE OR REPLACE FUNCTION public.get_available_credits(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(remaining), 0)::integer
  FROM public.credit_balances
  WHERE user_id = p_user_id
    AND remaining > 0
    AND (expires_at IS NULL OR expires_at > now());
$$;

-- 5. Grant plan credits for a billing cycle -----------------------
-- Called by entitlements.ts on subscription activation / monthly reset.
-- Idempotent on (user_id, source='plan', period_key) via the partial unique
-- index above, so a replayed webhook or double page-load never double-grants.
CREATE OR REPLACE FUNCTION public.grant_plan_credits(
  p_user_id uuid,
  p_credits integer,
  p_period_key text,
  p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_credits <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.credit_balances (user_id, source, period_key, granted, expires_at)
  VALUES (p_user_id, 'plan', p_period_key, p_credits, p_expires_at)
  ON CONFLICT (user_id, period_key) WHERE source = 'plan'
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO public.credit_transactions (user_id, delta, action, source, balance_id)
    VALUES (p_user_id, p_credits, 'grant', 'system', v_id);
  END IF;

  RETURN v_id;
END;
$$;

-- 6. Reserve (consume) credits — FIFO by expiry -------------------
-- Atomically reserves p_amount credits across the user's live balance batches,
-- spending soonest-expiring plan credits before long-lived purchases (§10.4).
-- Returns the user's remaining available credits on success, or -1 if the
-- balance is insufficient (no rows are modified in that case).
--
-- The FOR UPDATE loop serializes concurrent reservations per user: a second
-- concurrent call blocks on the row lock until the first commits, then sees
-- the reduced balances — the same atomicity guarantee migration 008 gave the
-- old single-counter model, now generalized to multi-batch credits.
CREATE OR REPLACE FUNCTION public.reserve_credits(
  p_user_id uuid,
  p_amount integer,
  p_action text,
  p_source text DEFAULT 'workbench',
  p_detail jsonb DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch RECORD;
  v_to_apply integer;
  v_remaining_to_apply integer := p_amount;
  v_available integer;
BEGIN
  IF p_amount <= 0 THEN
    RETURN -1;
  END IF;

  SELECT public.get_available_credits(p_user_id) INTO v_available;
  IF v_available IS NULL OR v_available < p_amount THEN
    RETURN -1;
  END IF;

  FOR v_batch IN
    SELECT id, remaining
    FROM public.credit_balances
    WHERE user_id = p_user_id
      AND remaining > 0
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY expires_at ASC NULLS LAST, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_to_apply <= 0;
    v_to_apply := LEAST(v_batch.remaining, v_remaining_to_apply);
    UPDATE public.credit_balances
      SET used = used + v_to_apply
      WHERE id = v_batch.id;
    v_remaining_to_apply := v_remaining_to_apply - v_to_apply;
  END LOOP;

  -- Should always be zero here because we pre-checked availability; the guard
  -- keeps the ledger honest even if a batch expired mid-transaction.
  IF v_remaining_to_apply > 0 THEN
    RAISE WARNING 'reserve_credits under-applied by % for user %', v_remaining_to_apply, p_user_id;
    RETURN -1;
  END IF;

  INSERT INTO public.credit_transactions (user_id, delta, action, source, detail)
  VALUES (p_user_id, -p_amount, p_action, p_source, p_detail);

  RETURN public.get_available_credits(p_user_id);
END;
$$;

-- 7. Refund credits (e.g. generation failed after reservation) ----
-- Adds credits back as a long-lived 'refund' batch (independent of any plan
-- cycle, so a refund never gets clawed back by expiry). Idempotent-ish: folds
-- successive refunds into one running refund batch per user.
CREATE OR REPLACE FUNCTION public.refund_credits(
  p_user_id uuid,
  p_amount integer,
  p_action text DEFAULT 'refund',
  p_detail jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target uuid;
BEGIN
  IF p_amount <= 0 THEN
    RETURN;
  END IF;

  SELECT id INTO v_target
  FROM public.credit_balances
  WHERE user_id = p_user_id AND source = 'refund'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_target IS NULL THEN
    INSERT INTO public.credit_balances (user_id, source, granted, used, expires_at)
    VALUES (p_user_id, 'refund', p_amount, 0, NULL)
    RETURNING id INTO v_target;
  ELSE
    UPDATE public.credit_balances
      SET granted = granted + p_amount
      WHERE id = v_target;
  END IF;

  INSERT INTO public.credit_transactions (user_id, delta, action, source, detail, balance_id)
  VALUES (p_user_id, p_amount, p_action, 'system', p_detail, v_target);
END;
$$;

-- 8. Spend summary for the "explain your credits" UI (§10.2) -----
-- Aggregates this-cycle consumption by action so the billing page can show
-- "平台内容生成: 16 / 联网研究: 8 / 品牌检查: 3 / 视觉生成: 5" without a
-- client-side reduce over every transaction row.
CREATE OR REPLACE FUNCTION public.get_credit_spend_summary(
  p_user_id uuid,
  p_since timestamptz DEFAULT NULL
) RETURNS TABLE (action text, credits integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT action, COALESCE(SUM(-delta), 0)::integer AS credits
  FROM public.credit_transactions
  WHERE user_id = p_user_id
    AND delta < 0
    AND (p_since IS NULL OR created_at >= p_since)
  GROUP BY action
  ORDER BY credits DESC;
$$;
