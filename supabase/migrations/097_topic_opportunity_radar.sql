-- ============================================================
-- Migration 097: Topic Opportunity Radar
--
-- Public trend evidence is shared, while user-configured feeds and every
-- personalized opportunity remain tenant scoped. Third-party payloads are
-- deliberately reduced to bounded evidence fields instead of mirrored.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trend_signals (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_key         text        NOT NULL DEFAULT 'global',
  source            text        NOT NULL,
  source_item_id    text        NOT NULL,
  source_url        text        NOT NULL,
  source_label      text        NOT NULL,
  title             text        NOT NULL,
  summary           text        NOT NULL DEFAULT '',
  locale            text        NOT NULL DEFAULT 'en',
  region            text,
  published_at      timestamptz,
  captured_at       timestamptz NOT NULL DEFAULT now(),
  last_observed_at  timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  source_rank       integer,
  source_score      numeric,
  momentum_score    numeric     NOT NULL DEFAULT 0,
  evidence_payload  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  fingerprint       text        NOT NULL,
  CONSTRAINT trend_signals_source_check
    CHECK (source IN ('google_trends', 'hacker_news', 'rss', 'aihot')),
  CONSTRAINT trend_signals_scope_check
    CHECK ((scope_key = 'global' AND owner_user_id IS NULL) OR owner_user_id IS NOT NULL),
  CONSTRAINT trend_signals_url_check
    CHECK (source_url ~ '^https://[^[:space:]]+$'),
  CONSTRAINT trend_signals_momentum_check
    CHECK (momentum_score BETWEEN 0 AND 100),
  CONSTRAINT trend_signals_evidence_object_check
    CHECK (jsonb_typeof(evidence_payload) = 'object'),
  CONSTRAINT trend_signals_source_item_unique
    UNIQUE (source, source_item_id, scope_key)
);

CREATE INDEX IF NOT EXISTS trend_signals_recent_idx
  ON public.trend_signals(last_observed_at DESC, expires_at);
CREATE INDEX IF NOT EXISTS trend_signals_owner_recent_idx
  ON public.trend_signals(owner_user_id, last_observed_at DESC)
  WHERE owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.trend_events (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id         uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_key             text        NOT NULL DEFAULT 'global',
  cluster_key           text        NOT NULL,
  title                 text        NOT NULL,
  summary               text        NOT NULL DEFAULT '',
  keywords              text[]      NOT NULL DEFAULT '{}',
  lifecycle             text        NOT NULL DEFAULT 'new',
  first_seen_at         timestamptz NOT NULL,
  last_seen_at          timestamptz NOT NULL,
  momentum_score        numeric     NOT NULL DEFAULT 0,
  freshness_score       numeric     NOT NULL DEFAULT 0,
  evidence_confidence   numeric     NOT NULL DEFAULT 0,
  signal_count          integer     NOT NULL DEFAULT 1,
  source_count          integer     NOT NULL DEFAULT 1,
  evidence_snapshot     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  recommended_platforms text[]      NOT NULL DEFAULT '{}',
  recommended_formats   text[]      NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trend_events_lifecycle_check
    CHECK (lifecycle IN ('new', 'rising', 'hot', 'cooling')),
  CONSTRAINT trend_events_score_check
    CHECK (
      momentum_score BETWEEN 0 AND 100
      AND freshness_score BETWEEN 0 AND 100
      AND evidence_confidence BETWEEN 0 AND 100
    ),
  CONSTRAINT trend_events_count_check CHECK (signal_count >= 1 AND source_count >= 1),
  CONSTRAINT trend_events_evidence_array_check CHECK (jsonb_typeof(evidence_snapshot) = 'array'),
  CONSTRAINT trend_events_scope_check
    CHECK ((scope_key = 'global' AND owner_user_id IS NULL) OR owner_user_id IS NOT NULL),
  CONSTRAINT trend_events_cluster_unique
    UNIQUE (scope_key, cluster_key)
);

CREATE INDEX IF NOT EXISTS trend_events_recent_idx
  ON public.trend_events(last_seen_at DESC, momentum_score DESC);
CREATE INDEX IF NOT EXISTS trend_events_owner_recent_idx
  ON public.trend_events(owner_user_id, last_seen_at DESC)
  WHERE owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.trend_event_signals (
  event_id     uuid        NOT NULL REFERENCES public.trend_events(id) ON DELETE CASCADE,
  signal_id    uuid        NOT NULL REFERENCES public.trend_signals(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, signal_id)
);

CREATE INDEX IF NOT EXISTS trend_event_signals_signal_idx
  ON public.trend_event_signals(signal_id);

CREATE TABLE IF NOT EXISTS public.topic_opportunities (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id                   uuid        NOT NULL REFERENCES public.trend_events(id) ON DELETE CASCADE,
  match_score                integer     NOT NULL,
  rank_score                 numeric     NOT NULL,
  match_dimensions           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  why_now                    text        NOT NULL,
  why_you                    text        NOT NULL,
  recommended_platform       text        NOT NULL,
  recommended_format         text        NOT NULL,
  main_angle                 text        NOT NULL,
  alternate_angles           text[]      NOT NULL DEFAULT '{}',
  evidence_confidence        integer     NOT NULL,
  analysis_status            text        NOT NULL DEFAULT 'rules',
  state                      text        NOT NULL DEFAULT 'active',
  feedback                   text,
  feedback_at                timestamptz,
  snoozed_until              timestamptz,
  preparation_status         text        NOT NULL DEFAULT 'idle',
  preparation_idempotency_key text,
  content_kit_id             uuid        REFERENCES public.content_kits(id) ON DELETE SET NULL,
  prepared_at                timestamptz,
  analysis_cache_key         text,
  analysis_expires_at        timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT topic_opportunities_user_event_unique UNIQUE (user_id, event_id),
  CONSTRAINT topic_opportunities_match_check CHECK (match_score BETWEEN 0 AND 100),
  CONSTRAINT topic_opportunities_rank_check CHECK (rank_score BETWEEN 0 AND 100),
  CONSTRAINT topic_opportunities_confidence_check CHECK (evidence_confidence BETWEEN 0 AND 100),
  CONSTRAINT topic_opportunities_dimensions_object_check CHECK (jsonb_typeof(match_dimensions) = 'object'),
  CONSTRAINT topic_opportunities_state_check CHECK (state IN ('active', 'dismissed', 'snoozed')),
  CONSTRAINT topic_opportunities_feedback_check
    CHECK (feedback IS NULL OR feedback IN ('not_relevant', 'already_knew', 'brand_mismatch', 'later')),
  CONSTRAINT topic_opportunities_analysis_check CHECK (analysis_status IN ('rules', 'personalized', 'unavailable')),
  CONSTRAINT topic_opportunities_preparation_check CHECK (preparation_status IN ('idle', 'confirmed', 'generating', 'ready', 'failed'))
);

CREATE INDEX IF NOT EXISTS topic_opportunities_user_rank_idx
  ON public.topic_opportunities(user_id, state, rank_score DESC, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS topic_opportunities_preparation_key_unique
  ON public.topic_opportunities(user_id, preparation_idempotency_key)
  WHERE preparation_idempotency_key IS NOT NULL;

ALTER TABLE public.content_kits
  ADD COLUMN IF NOT EXISTS source_topic_opportunity_id uuid
  REFERENCES public.topic_opportunities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS content_kits_topic_opportunity_idx
  ON public.content_kits(source_topic_opportunity_id)
  WHERE source_topic_opportunity_id IS NOT NULL;

ALTER TABLE public.trend_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trend_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trend_event_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trend signals: visible scope" ON public.trend_signals;
CREATE POLICY "trend signals: visible scope"
  ON public.trend_signals FOR SELECT
  USING (owner_user_id IS NULL OR auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "trend events: visible scope" ON public.trend_events;
CREATE POLICY "trend events: visible scope"
  ON public.trend_events FOR SELECT
  USING (owner_user_id IS NULL OR auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "trend event signals: visible scope" ON public.trend_event_signals;
CREATE POLICY "trend event signals: visible scope"
  ON public.trend_event_signals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.trend_events event
    WHERE event.id = trend_event_signals.event_id
      AND (event.owner_user_id IS NULL OR event.owner_user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "topic opportunities: select own" ON public.topic_opportunities;
CREATE POLICY "topic opportunities: select own"
  ON public.topic_opportunities FOR SELECT
  USING (auth.uid() = user_id);
-- Feedback, preparation, and generation state transitions are intentionally
-- API-only service-role writes. Browser clients may read their own cards but
-- cannot rewrite scores, attribution, or idempotency state directly.
DROP POLICY IF EXISTS "topic opportunities: update own" ON public.topic_opportunities;

CREATE OR REPLACE FUNCTION public.claim_topic_opportunity_preparation(
  p_opportunity_id uuid,
  p_user_id uuid,
  p_idempotency_key text
)
RETURNS TABLE(outcome text, existing_content_kit_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.topic_opportunities%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) < 8 OR char_length(p_idempotency_key) > 120 THEN
    RETURN QUERY SELECT 'invalid_key'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.topic_opportunities
  WHERE id = p_opportunity_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_row.state <> 'active' THEN
    RETURN QUERY SELECT 'inactive'::text, v_row.content_kit_id;
    RETURN;
  END IF;

  IF v_row.preparation_idempotency_key IS NULL THEN
    UPDATE public.topic_opportunities
    SET preparation_idempotency_key = p_idempotency_key,
        preparation_status = 'confirmed',
        prepared_at = now(),
        updated_at = now()
    WHERE id = p_opportunity_id;
    RETURN QUERY SELECT 'claimed'::text, v_row.content_kit_id;
    RETURN;
  END IF;

  IF v_row.preparation_status = 'failed' THEN
    UPDATE public.topic_opportunities
    SET preparation_idempotency_key = p_idempotency_key,
        preparation_status = 'confirmed',
        prepared_at = now(),
        updated_at = now()
    WHERE id = p_opportunity_id;
    RETURN QUERY SELECT 'claimed'::text, v_row.content_kit_id;
    RETURN;
  END IF;

  IF v_row.preparation_idempotency_key = p_idempotency_key THEN
    RETURN QUERY SELECT 'replayed'::text, v_row.content_kit_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'conflict'::text, v_row.content_kit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_topic_opportunity_preparation(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_topic_opportunity_preparation(uuid, uuid, text) TO service_role;
