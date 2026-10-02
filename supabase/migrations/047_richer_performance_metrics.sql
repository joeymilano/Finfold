-- 047: Platform-native performance signals for proactive growth diagnosis
-- Separates content views from outbound clicks and adds the Xiaohongshu
-- signals needed to diagnose click, retention, value, and follower conversion.

ALTER TABLE public.performance_metrics
  ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cover_click_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_view_seconds numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS follower_growth integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_visits integer NOT NULL DEFAULT 0;

ALTER TABLE public.performance_snapshots
  ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cover_click_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_view_seconds numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS follower_growth integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_visits integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.performance_metrics'::regclass
      AND conname = 'performance_metrics_cover_click_rate_check'
  ) THEN
    ALTER TABLE public.performance_metrics
      ADD CONSTRAINT performance_metrics_cover_click_rate_check
      CHECK (cover_click_rate >= 0 AND cover_click_rate <= 100);
  END IF;
END $$;
