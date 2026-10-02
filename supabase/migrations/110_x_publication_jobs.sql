-- ============================================================
-- Migration 110: X (Twitter) publication pipeline jobs.
--
-- Server-only, feature-gated publishing for the X content
-- pipeline (posts, threads, engagement replies). A job stores
-- the exact approved content snapshot plus a content
-- fingerprint, so a later edit can never be published
-- silently. Threads track per-tweet progress so a crashed
-- dispatch resumes instead of duplicating tweets. One reply
-- per target tweet is enforced permanently — an account must
-- never reply to the same post twice.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.x_publication_jobs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_account_id uuid REFERENCES public.social_connection_accounts(id) ON DELETE SET NULL,
  kind                  text NOT NULL,
  status                text NOT NULL DEFAULT 'needs_approval',
  scheduled_for         timestamptz NOT NULL,
  approved_at           timestamptz,
  content_fingerprint   text NOT NULL CHECK (content_fingerprint ~ '^[0-9a-f]{64}$'),
  content_snapshot      jsonb NOT NULL CHECK (jsonb_typeof(content_snapshot) = 'object'),
  posted_tweet_ids      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(posted_tweet_ids) = 'array'),
  reply_to_tweet_id     text,
  tweet_id              text,
  tweet_url             text,
  attempt_count         integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  lease_token           uuid,
  lease_expires_at      timestamptz,
  error_code            text,
  error_message         text,
  idempotency_key       uuid NOT NULL,
  published_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT x_publication_jobs_kind_check
    CHECK (kind IN ('post', 'thread', 'reply')),
  CONSTRAINT x_publication_jobs_status_check
    CHECK (status IN (
      'needs_approval', 'scheduled', 'publishing',
      'published', 'failed', 'cancelled', 'rejected', 'blocked'
    )),
  CONSTRAINT x_publication_jobs_tweet_url_check
    CHECK (tweet_url IS NULL OR tweet_url ~ '^https://'),
  CONSTRAINT x_publication_jobs_reply_target_check
    CHECK (kind <> 'reply' OR reply_to_tweet_id IS NOT NULL),
  CONSTRAINT x_publication_jobs_lease_check
    CHECK (
      (lease_token IS NULL AND lease_expires_at IS NULL)
      OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    ),
  CONSTRAINT x_publication_jobs_idempotency_unique
    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS x_publication_jobs_due_idx
  ON public.x_publication_jobs(next_attempt_at, scheduled_for)
  WHERE status IN ('scheduled', 'publishing');

CREATE INDEX IF NOT EXISTS x_publication_jobs_user_created_idx
  ON public.x_publication_jobs(user_id, created_at DESC);

-- A target tweet can receive at most one reply job that is
-- pending or has ever gone out; rejected/cancelled/failed
-- attempts may be replaced by a fresh attempt later.
CREATE UNIQUE INDEX IF NOT EXISTS x_publication_jobs_one_reply_per_target_idx
  ON public.x_publication_jobs(user_id, reply_to_tweet_id)
  WHERE kind = 'reply'
     AND status IN ('needs_approval', 'scheduled', 'publishing', 'published');

ALTER TABLE public.x_publication_jobs ENABLE ROW LEVEL SECURITY;
-- Reads and writes flow through ownership-checking server routes and the
-- internal worker dispatcher only.

-- Per-user operating switches for the pipeline. Quotas are hard caps the
-- generation and engagement runners consult before creating jobs; `paused`
-- is the circuit-breaker state set after consecutive dispatch failures.
CREATE TABLE IF NOT EXISTS public.x_pipeline_settings (
  user_id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  review_mode            text NOT NULL DEFAULT 'every_post',
  daily_post_limit       integer NOT NULL DEFAULT 3 CHECK (daily_post_limit BETWEEN 0 AND 10),
  daily_reply_limit      integer NOT NULL DEFAULT 10 CHECK (daily_reply_limit BETWEEN 0 AND 30),
  generation_enabled     boolean NOT NULL DEFAULT false,
  engagement_enabled     boolean NOT NULL DEFAULT false,
  paused                 boolean NOT NULL DEFAULT false,
  paused_reason          text,
  consecutive_failures   integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT x_pipeline_settings_review_mode_check
    CHECK (review_mode IN ('every_post', 'spot_check'))
);

ALTER TABLE public.x_pipeline_settings ENABLE ROW LEVEL SECURITY;
-- No client policies. Settings change through ownership-checking routes.

-- Monitored X accounts (kind = 'account') and niche keywords
-- (kind = 'keyword') that drive topic selection and engagement
-- target discovery.
CREATE TABLE IF NOT EXISTS public.x_watchlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  value      text NOT NULL,
  note       text,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT x_watchlist_kind_check CHECK (kind IN ('account', 'keyword')),
  CONSTRAINT x_watchlist_value_check CHECK (length(trim(value)) BETWEEN 1 AND 200),
  CONSTRAINT x_watchlist_user_kind_value_unique UNIQUE (user_id, kind, value)
);

ALTER TABLE public.x_watchlist ENABLE ROW LEVEL SECURITY;
-- No client policies. Watchlist entries change through ownership-checking routes.

CREATE OR REPLACE FUNCTION public.claim_due_x_publication_jobs(
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 90
) RETURNS SETOF public.x_publication_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_x_publication_claim';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
    FROM public.x_publication_jobs job
    WHERE job.status IN ('scheduled', 'publishing')
      AND job.next_attempt_at <= now()
      AND job.scheduled_for <= now()
      AND (job.lease_expires_at IS NULL OR job.lease_expires_at <= now())
    ORDER BY job.next_attempt_at, job.scheduled_for, job.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.x_publication_jobs job
  SET
    lease_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    attempt_count = job.attempt_count + 1,
    updated_at = now()
  FROM candidates
  WHERE job.id = candidates.id
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_x_publication_jobs(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_x_publication_jobs(integer, integer)
  TO service_role;
