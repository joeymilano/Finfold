-- ============================================================
-- Migration 014: Persistent trial generation ledger
--
-- lib/rate-limit.ts is explicitly best-effort in-memory — Cloudflare Pages
-- runs each request on one of many isolated instances with no shared
-- memory, so a scripted trial abuser rotating across isolates (or just
-- making enough requests) faces no real ceiling on /api/trial/generate,
-- which is an unauthenticated LLM-cost surface. This table gives that
-- route a durable, per-IP-per-day cap enforced atomically in Postgres,
-- the same pattern as usage_counters/reserve_generation_credit (008).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trial_generations (
  id         uuid        primary key default gen_random_uuid(),
  ip_hash    text        not null,
  day_start  date        not null,
  idea_text  text        not null,
  platforms  jsonb       not null default '[]',
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS trial_generations_ip_day_idx
  ON public.trial_generations (ip_hash, day_start);

ALTER TABLE public.trial_generations ENABLE ROW LEVEL SECURITY;

-- No public SELECT/INSERT policy — this table is only ever touched by the
-- service-role client from app/api/trial/generate/route.ts, mirroring
-- usage_counters/webhook_events. Row Level Security stays enabled with no
-- permissive policy so it defaults to deny for any non-service-role caller.

-- Atomically counts today's trial generations for an IP and inserts a new
-- ledger row in one round trip when under the limit. Returns the new count,
-- or -1 if the daily limit is already reached (no row inserted).
CREATE OR REPLACE FUNCTION public.reserve_trial_generation(
  p_ip_hash text,
  p_day_start date,
  p_idea_text text,
  p_platforms jsonb,
  p_limit integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.trial_generations
  WHERE ip_hash = p_ip_hash AND day_start = p_day_start;

  IF v_count >= p_limit THEN
    RETURN -1;
  END IF;

  INSERT INTO public.trial_generations (ip_hash, day_start, idea_text, platforms)
  VALUES (p_ip_hash, p_day_start, p_idea_text, p_platforms);

  RETURN v_count + 1;
END;
$$;
