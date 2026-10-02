-- ============================================================
-- Migration 008: kit_outputs image columns + atomic quota reservation
-- Run after 007.
-- ============================================================

-- 1. kit_outputs was missing image_url/image_prompt columns that
--    app/api/generate/route.ts has always tried to insert — every kit
--    generation's kit_outputs insert was silently failing in production.
ALTER TABLE public.kit_outputs
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.kit_outputs
  ADD COLUMN IF NOT EXISTS image_prompt text;

-- 2. Atomic per-user-per-month generation counter. Quota enforcement was
--    previously a read-count-then-insert race (two concurrent requests could
--    both read "under limit" and both proceed). This table + the two
--    functions below make reservation atomic via a single
--    INSERT ... ON CONFLICT DO UPDATE ... WHERE statement.
CREATE TABLE IF NOT EXISTS public.usage_counters (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  month_start date        not null,
  used       integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month_start)
);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage counters: select own" ON public.usage_counters;
CREATE POLICY "usage counters: select own"
  ON public.usage_counters FOR SELECT
  USING (auth.uid() = user_id);

-- Backfill from existing content_kits rows so users don't get a free
-- extra month of quota the first time this migration runs.
INSERT INTO public.usage_counters (user_id, month_start, used)
SELECT user_id, date_trunc('month', created_at)::date, count(*)::integer
FROM public.content_kits
GROUP BY user_id, date_trunc('month', created_at)::date
ON CONFLICT (user_id, month_start) DO UPDATE SET used = excluded.used;

-- Atomically increments the counter and returns the new value, but only if
-- the current value is below p_limit. Returns -1 if the limit is already
-- reached (no row is modified in that case) so callers can distinguish
-- "reserved" (>= 0) from "quota exceeded" (-1) without a second query.
CREATE OR REPLACE FUNCTION public.reserve_generation_credit(
  p_user_id uuid,
  p_month_start date,
  p_limit integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used integer;
BEGIN
  IF p_limit <= 0 THEN
    RETURN -1;
  END IF;

  INSERT INTO public.usage_counters (user_id, month_start, used, updated_at)
  VALUES (p_user_id, p_month_start, 1, now())
  ON CONFLICT (user_id, month_start) DO UPDATE
    SET used = public.usage_counters.used + 1, updated_at = now()
    WHERE public.usage_counters.used < p_limit
  RETURNING used INTO v_used;

  IF v_used IS NULL THEN
    RETURN -1;
  END IF;

  RETURN v_used;
END;
$$;

-- Refunds one credit (e.g. the generation failed after reservation).
-- Never goes below zero.
CREATE OR REPLACE FUNCTION public.release_generation_credit(
  p_user_id uuid,
  p_month_start date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.usage_counters
  SET used = greatest(used - 1, 0), updated_at = now()
  WHERE user_id = p_user_id AND month_start = p_month_start;
END;
$$;
