-- ============================================================
-- Migration 102: Monthly CNY budget for paid direct-LLM providers
--
-- Paid providers listed in LLM_PROVIDERS can carry a monthlyBudgetCny
-- field (see wrangler.toml). The provider must STOP once the calendar-month
-- spend estimate reaches that cap, without depending on the vendor's own
-- dashboard. Each isolate in a Cloudflare Worker has no shared memory (see
-- lib/rate-limit.ts), so the ledger lives here — the same pattern as
-- workers_ai_daily_usage (072), scoped to a provider + Asia/Shanghai
-- calendar month instead of a UTC day.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.llm_monthly_budget_usage (
  provider text NOT NULL,
  usage_month text NOT NULL,
  spent_cny numeric(12, 6) NOT NULL DEFAULT 0 CHECK (spent_cny >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, usage_month)
);

-- Server-only: no RLS policy is defined, so only the service role (which
-- bypasses RLS) can read/write this table directly.
ALTER TABLE public.llm_monthly_budget_usage ENABLE ROW LEVEL SECURITY;

-- Atomically reserves `p_amount_cny` against the provider's monthly budget.
-- Single upsert with a WHERE guard on the update branch closes the
-- read-then-write race under concurrent requests.
CREATE OR REPLACE FUNCTION public.consume_llm_monthly_budget(
  p_provider text,
  p_month text,
  p_amount_cny numeric,
  p_budget_cny numeric
) RETURNS TABLE (
  allowed boolean,
  spent_after numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.llm_monthly_budget_usage%ROWTYPE;
BEGIN
  IF p_provider IS NULL OR p_provider = '' OR p_month IS NULL OR p_month = ''
    OR p_amount_cny IS NULL OR p_amount_cny <= 0
    OR p_budget_cny IS NULL OR p_budget_cny <= 0 THEN
    RAISE EXCEPTION 'invalid_llm_monthly_budget_request';
  END IF;

  INSERT INTO public.llm_monthly_budget_usage (provider, usage_month, spent_cny)
  VALUES (p_provider, p_month, p_amount_cny)
  ON CONFLICT (provider, usage_month) DO UPDATE
    SET spent_cny = public.llm_monthly_budget_usage.spent_cny + p_amount_cny,
        updated_at = now()
    WHERE public.llm_monthly_budget_usage.spent_cny + p_amount_cny <= p_budget_cny
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.llm_monthly_budget_usage
      WHERE provider = p_provider AND usage_month = p_month;
    RETURN QUERY SELECT false, v_row.spent_cny;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_row.spent_cny;
END;
$$;

-- Returns reserved CNY to the monthly budget: after a failed attempt
-- (full refund) or after a successful one settles its real usage
-- (refund of estimate minus actual). Never goes negative and never moves
-- spend across a month boundary onto a different month's row.
CREATE OR REPLACE FUNCTION public.release_llm_monthly_budget(
  p_provider text,
  p_month text,
  p_amount_cny numeric
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spent numeric;
BEGIN
  IF p_provider IS NULL OR p_provider = '' OR p_month IS NULL OR p_month = ''
    OR p_amount_cny IS NULL OR p_amount_cny <= 0 THEN
    RAISE EXCEPTION 'invalid_llm_monthly_budget_release';
  END IF;

  UPDATE public.llm_monthly_budget_usage
  SET spent_cny = GREATEST(0, spent_cny - p_amount_cny),
      updated_at = now()
  WHERE provider = p_provider AND usage_month = p_month
  RETURNING spent_cny INTO v_spent;

  RETURN COALESCE(v_spent, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_llm_monthly_budget(text, text, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_llm_monthly_budget(text, text, numeric, numeric)
  TO service_role;

REVOKE ALL ON FUNCTION public.release_llm_monthly_budget(text, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_llm_monthly_budget(text, text, numeric)
  TO service_role;
