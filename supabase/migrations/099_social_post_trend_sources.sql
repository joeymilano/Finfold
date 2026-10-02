-- ============================================================
-- Migration 099: Social post evidence for Opportunity Radar
--
-- Keeps social evidence in the existing bounded trend pipeline. Providers
-- are only collected through approved APIs or genuinely public endpoints;
-- the reduced evidence payload stores no session cookies or private data.
-- ============================================================

ALTER TABLE public.trend_signals
  DROP CONSTRAINT IF EXISTS trend_signals_source_check;

ALTER TABLE public.trend_signals
  ADD CONSTRAINT trend_signals_source_check
  CHECK (source IN ('google_trends', 'hacker_news', 'rss', 'aihot', 'social_post'));

CREATE INDEX IF NOT EXISTS trend_signals_social_recent_idx
  ON public.trend_signals(last_observed_at DESC)
  WHERE source = 'social_post';
