-- ============================================================
-- Migration 054: Recoverable webhook event inbox
--
-- Migration 010 treated insertion as successful processing. If business
-- handling failed after that insert, the provider retry hit the primary key
-- and was acknowledged as a duplicate, permanently losing the transition.
--
-- Existing rows are treated as succeeded because their exact historical
-- outcome cannot be reconstructed safely. New rows move through
-- processing -> succeeded|failed and failed/stale rows can be reclaimed.
-- ============================================================

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS attempt_count integer;

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS payload_hash text;

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS received_at timestamptz;

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS last_error text;

UPDATE public.webhook_events
SET
  status = COALESCE(status, 'succeeded'),
  attempt_count = COALESCE(attempt_count, 1),
  received_at = COALESCE(received_at, processed_at, now())
WHERE status IS NULL
   OR attempt_count IS NULL
   OR received_at IS NULL;

ALTER TABLE public.webhook_events
  ALTER COLUMN status SET DEFAULT 'processing',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN attempt_count SET DEFAULT 1,
  ALTER COLUMN attempt_count SET NOT NULL,
  ALTER COLUMN received_at SET DEFAULT now(),
  ALTER COLUMN received_at SET NOT NULL,
  ALTER COLUMN processed_at DROP DEFAULT,
  ALTER COLUMN processed_at DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.webhook_events'::regclass
      AND conname = 'webhook_events_status_check'
  ) THEN
    ALTER TABLE public.webhook_events
      ADD CONSTRAINT webhook_events_status_check
      CHECK (status IN ('processing', 'succeeded', 'failed'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.webhook_events'::regclass
      AND conname = 'webhook_events_attempt_count_check'
  ) THEN
    ALTER TABLE public.webhook_events
      ADD CONSTRAINT webhook_events_attempt_count_check
      CHECK (attempt_count > 0);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS webhook_events_status_received_idx
  ON public.webhook_events(status, received_at);
