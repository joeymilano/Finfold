-- ============================================================
-- Migration 098: Durable Opportunity Radar collection status
--
-- The product must distinguish "no collection yet", "collection failed",
-- and "collection succeeded but no opportunity reached the display threshold".
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trend_collection_runs (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key                text        NOT NULL DEFAULT 'global',
  trigger_kind             text        NOT NULL,
  requested_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status                   text        NOT NULL DEFAULT 'running',
  started_at               timestamptz NOT NULL DEFAULT now(),
  completed_at             timestamptz,
  collected_count          integer     NOT NULL DEFAULT 0,
  persisted_count          integer     NOT NULL DEFAULT 0,
  events_updated_count     integer     NOT NULL DEFAULT 0,
  successful_source_count  integer     NOT NULL DEFAULT 0,
  failed_source_count      integer     NOT NULL DEFAULT 0,
  source_report            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  error_message            text,
  CONSTRAINT trend_collection_runs_scope_check
    CHECK (scope_key = 'global'),
  CONSTRAINT trend_collection_runs_trigger_check
    CHECK (trigger_kind IN ('scheduled', 'bootstrap')),
  CONSTRAINT trend_collection_runs_status_check
    CHECK (status IN ('running', 'succeeded', 'degraded', 'failed')),
  CONSTRAINT trend_collection_runs_counts_check
    CHECK (
      collected_count >= 0
      AND persisted_count >= 0
      AND events_updated_count >= 0
      AND successful_source_count >= 0
      AND failed_source_count >= 0
    ),
  CONSTRAINT trend_collection_runs_report_check
    CHECK (jsonb_typeof(source_report) = 'array')
);

CREATE INDEX IF NOT EXISTS trend_collection_runs_recent_idx
  ON public.trend_collection_runs(scope_key, started_at DESC);

-- At most one collector may own the global run at a time. A stale owner is
-- marked failed by the service before a new claim is attempted.
CREATE UNIQUE INDEX IF NOT EXISTS trend_collection_runs_single_running_idx
  ON public.trend_collection_runs(scope_key)
  WHERE status = 'running';

ALTER TABLE public.trend_collection_runs ENABLE ROW LEVEL SECURITY;

-- Collection diagnostics contain provider errors and are API-only. The
-- service-role client can read/write them while browser roles receive no
-- direct table privileges.
REVOKE ALL ON TABLE public.trend_collection_runs FROM anon, authenticated;
