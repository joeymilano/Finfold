-- ============================================================
-- Migration 032: Ensure performance_metrics table exists
--
-- The original CREATE TABLE for performance_metrics was never committed
-- to version control — migration 022 only ALTERed it (adding `source`)
-- on the assumption it already existed, having been created out-of-band.
-- On any database where that out-of-band creation never happened, every
-- read/write from /api/performance fails with a PostgREST error that the
-- route's catch block collapsed into the opaque "Failed to load
-- performance." message, breaking the entire Performance Loop panel.
--
-- This migration is fully idempotent: it creates the table if missing,
-- backfills any missing columns if the table pre-exists, and reconciles
-- the primary key, check constraint, and RLS policies. Safe to run on a
-- fresh DB, on the original out-of-band table, or on a partially-migrated one.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.performance_metrics (
  kit_id        uuid        not null references public.content_kits(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  platform      text        not null,
  impressions   integer     not null default 0,
  clicks        integer     not null default 0,
  likes         integer     not null default 0,
  comments      integer     not null default 0,
  saves         integer     not null default 0,
  shares        integer     not null default 0,
  leads         integer     not null default 0,
  signups       integer     not null default 0,
  revenue       numeric     not null default 0,
  published_url text,
  measured_at   timestamptz not null default now(),
  source        text        not null default 'manual',
  primary key (kit_id, platform)
);

-- Backfill columns on a table that pre-existed (created out-of-band and
-- possibly missing columns the route expects). IF NOT EXISTS makes each a
-- no-op when the column is already there.
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS kit_id uuid;
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS impressions integer not null default 0;
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS clicks integer not null default 0;
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS likes integer not null default 0;
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS comments integer not null default 0;
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS saves integer not null default 0;
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS shares integer not null default 0;
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS leads integer not null default 0;
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS signups integer not null default 0;
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS revenue numeric not null default 0;
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS published_url text;
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS measured_at timestamptz not null default now();
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS source text not null default 'manual';

-- The route upserts with onConflict="kit_id,platform", which requires a
-- unique constraint on the pair. CREATE TABLE above creates it as the PK;
-- for a pre-existing table that has no PK yet, add one defensively.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.performance_metrics'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.performance_metrics
      ADD CONSTRAINT performance_metrics_pkey PRIMARY KEY (kit_id, platform);
  END IF;
END
$$;

-- source values: matches the CHECK from 022 and the UI tags.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.performance_metrics'::regclass
      AND conname = 'performance_metrics_source_check'
  ) THEN
    ALTER TABLE public.performance_metrics
      ADD CONSTRAINT performance_metrics_source_check
      CHECK (source IN ('manual', 'import', 'auto'));
  END IF;
END
$$;

-- Row-Level Security. The route uses the service-role admin client which
-- bypasses RLS, but enforce ownership at the policy level so anon/server
-- clients and any future server-client refactor stay correct.
ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perf metrics: select own" ON public.performance_metrics;
CREATE POLICY "perf metrics: select own"
  ON public.performance_metrics FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "perf metrics: insert own" ON public.performance_metrics;
CREATE POLICY "perf metrics: insert own"
  ON public.performance_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "perf metrics: update own" ON public.performance_metrics;
CREATE POLICY "perf metrics: update own"
  ON public.performance_metrics FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
