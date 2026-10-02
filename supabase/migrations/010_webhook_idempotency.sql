-- ============================================================
-- Migration 010: Creem webhook idempotency
-- Run after 009.
--
-- The webhook handler verified HMAC signatures but never recorded which
-- events it had already processed, so a captured signed payload could be
-- replayed indefinitely (e.g. replaying subscription.canceled to keep
-- downgrading a paying user back to free).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id           text        primary key, -- Creem event.id
  event_type   text        not null,
  processed_at timestamptz not null default now()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: only the service-role client (which bypasses RLS) touches
-- this table; it is not part of any user-facing read/write surface.
