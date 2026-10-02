-- ============================================================
-- Migration 072: Workers AI daily Neuron budget
--
-- Cloudflare Workers AI grants 10,000 free Neurons/day (UTC reset), shared
-- across text and image models. On a paid Workers plan (required for
-- Queues, which this project already uses), exceeding that allocation is
-- NOT rejected — it is billed at $0.011/1k Neurons. Cloudflare gives us no
-- server-side stop; this table is what makes "free tier only, then stop"
-- real. Each isolate in a Cloudflare Worker has no shared memory (see
-- lib/rate-limit.ts), so the counter must live here, not in-process.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.workers_ai_daily_usage (
  usage_date date PRIMARY KEY DEFAULT ((now() AT TIME ZONE 'utc')::date),
  neurons_spent integer NOT NULL DEFAULT 0 CHECK (neurons_spent >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Server-only: no RLS policy is defined, so only the service role (which
-- bypasses RLS) can read/write this table directly — same pattern as
-- ai_usage_operations (068) and other server-only ledgers.
ALTER TABLE public.workers_ai_daily_usage ENABLE ROW LEVEL SECURITY;

-- Atomically reserves `p_neurons` against today's (UTC) budget. Single
-- upsert with a WHERE guard on the update branch is what makes this safe
-- under concurrent requests — there is no read-then-write race window.
CREATE OR REPLACE FUNCTION public.consume_workers_ai_neurons(
  p_neurons integer,
  p_budget integer
) RETURNS TABLE (
  allowed boolean,
  spent_after integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date := (now() AT TIME ZONE 'utc')::date;
  v_row public.workers_ai_daily_usage%ROWTYPE;
BEGIN
  IF p_neurons IS NULL OR p_neurons <= 0 OR p_budget IS NULL OR p_budget <= 0 THEN
    RAISE EXCEPTION 'invalid_workers_ai_neuron_request';
  END IF;

  INSERT INTO public.workers_ai_daily_usage (usage_date, neurons_spent)
  VALUES (v_date, p_neurons)
  ON CONFLICT (usage_date) DO UPDATE
    SET neurons_spent = public.workers_ai_daily_usage.neurons_spent + p_neurons,
        updated_at = now()
    WHERE public.workers_ai_daily_usage.neurons_spent + p_neurons <= p_budget
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    -- Either the row already existed and the WHERE guard rejected the
    -- update (budget would be exceeded), or this was a fresh INSERT whose
    -- ON CONFLICT DO UPDATE branch didn't fire — re-select to report the
    -- current spend either way.
    SELECT * INTO v_row FROM public.workers_ai_daily_usage WHERE usage_date = v_date;
    RETURN QUERY SELECT false, v_row.neurons_spent;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_row.neurons_spent;
END;
$$;

-- Returns neurons to today's budget for a request that reserved them but
-- then failed to actually produce an image (so the failed attempt doesn't
-- permanently eat into the daily allowance). Never goes negative and never
-- moves neurons across a UTC day boundary onto a different day's row.
CREATE OR REPLACE FUNCTION public.release_workers_ai_neurons(
  p_neurons integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date := (now() AT TIME ZONE 'utc')::date;
  v_spent integer;
BEGIN
  IF p_neurons IS NULL OR p_neurons <= 0 THEN
    RAISE EXCEPTION 'invalid_workers_ai_neuron_release';
  END IF;

  UPDATE public.workers_ai_daily_usage
  SET neurons_spent = GREATEST(0, neurons_spent - p_neurons),
      updated_at = now()
  WHERE usage_date = v_date
  RETURNING neurons_spent INTO v_spent;

  RETURN COALESCE(v_spent, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_workers_ai_neurons(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_workers_ai_neurons(integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.release_workers_ai_neurons(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_workers_ai_neurons(integer)
  TO service_role;
