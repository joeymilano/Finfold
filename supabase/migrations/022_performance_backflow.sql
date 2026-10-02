-- ============================================================
-- Migration 022: Performance backflow — provenance + history
--
-- performance_metrics is a latest-value upsert row per (kit_id, platform),
-- so every re-save overwrites history and there's no way to tell a manually
-- typed number from one an AI extracted from a pasted screenshot/text vs a
-- future automated poll. This adds:
--   1. `source` on the live row, so the UI can label how a number got there.
--   2. `performance_snapshots`, an append-only log written alongside every
--      save — additive only, does not change how performance_metrics is
--      read today, but is what a future trend chart or auto-poller needs.
-- ============================================================

ALTER TABLE public.performance_metrics
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'import', 'auto'));

CREATE TABLE IF NOT EXISTS public.performance_snapshots (
  id           uuid        primary key default gen_random_uuid(),
  kit_id       uuid        not null references public.content_kits(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  platform     text        not null,
  impressions  integer     not null default 0,
  clicks       integer     not null default 0,
  likes        integer     not null default 0,
  comments     integer     not null default 0,
  saves        integer     not null default 0,
  shares       integer     not null default 0,
  leads        integer     not null default 0,
  signups      integer     not null default 0,
  revenue      numeric     not null default 0,
  source       text        not null default 'manual' check (source in ('manual', 'import', 'auto')),
  measured_at  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_perf_snapshots_kit_platform_time
  ON public.performance_snapshots(kit_id, platform, measured_at DESC);

ALTER TABLE public.performance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perf snapshots: select own" ON public.performance_snapshots;
CREATE POLICY "perf snapshots: select own"
  ON public.performance_snapshots FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "perf snapshots: insert own" ON public.performance_snapshots;
CREATE POLICY "perf snapshots: insert own"
  ON public.performance_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);
