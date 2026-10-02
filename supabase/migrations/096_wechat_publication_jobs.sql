-- ============================================================
-- Migration 096: WeChat Official Account draft + scheduled publishing.
--
-- Publishing stays server-only and feature-gated. A job stores the exact
-- user-approved content revision so a later edit can never be published
-- silently. Provider callbacks are deduplicated before they mutate state.
-- ============================================================

ALTER TABLE public.kit_outputs
  ADD COLUMN IF NOT EXISTS summary text;

ALTER TABLE public.social_connection_accounts
  ADD COLUMN IF NOT EXISTS provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.social_connection_accounts
  DROP CONSTRAINT IF EXISTS social_connection_accounts_provider_metadata_check;

ALTER TABLE public.social_connection_accounts
  ADD CONSTRAINT social_connection_accounts_provider_metadata_check
  CHECK (jsonb_typeof(provider_metadata) = 'object');

CREATE TABLE IF NOT EXISTS public.wechat_component_tokens (
  component_app_id       text PRIMARY KEY
    CHECK (component_app_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  encrypted_access_token text NOT NULL
    CHECK (encrypted_access_token LIKE 'enc:v1:%'),
  expires_at             timestamptz NOT NULL,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wechat_component_tokens ENABLE ROW LEVEL SECURITY;
-- No client policies. Component access tokens never leave server code.

CREATE TABLE IF NOT EXISTS public.wechat_publication_jobs (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kit_id                     uuid NOT NULL REFERENCES public.content_kits(id) ON DELETE CASCADE,
  output_id                  uuid NOT NULL REFERENCES public.kit_outputs(id) ON DELETE CASCADE,
  connection_account_id      uuid NOT NULL REFERENCES public.social_connection_accounts(id) ON DELETE CASCADE,
  mode                       text NOT NULL,
  status                     text NOT NULL DEFAULT 'scheduled',
  scheduled_for              timestamptz NOT NULL,
  approved_at                timestamptz NOT NULL DEFAULT now(),
  approved_output_updated_at timestamptz NOT NULL,
  content_fingerprint        text NOT NULL CHECK (content_fingerprint ~ '^[0-9a-f]{64}$'),
  content_snapshot           jsonb NOT NULL CHECK (jsonb_typeof(content_snapshot) = 'object'),
  prepared_snapshot          jsonb CHECK (prepared_snapshot IS NULL OR jsonb_typeof(prepared_snapshot) = 'object'),
  draft_media_id             text,
  publish_id                 text,
  article_id                 text,
  article_url                text,
  provider_status            integer,
  attempt_count              integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at            timestamptz NOT NULL DEFAULT now(),
  lease_token                uuid,
  lease_expires_at           timestamptz,
  error_code                 text,
  error_message              text,
  idempotency_key            uuid NOT NULL,
  published_at               timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wechat_publication_jobs_mode_check
    CHECK (mode IN ('draft_only', 'scheduled_publish')),
  CONSTRAINT wechat_publication_jobs_status_check
    CHECK (status IN (
      'scheduled', 'needs_reapproval', 'preparing', 'draft_ready',
      'submitted', 'publishing', 'published', 'failed', 'cancelled',
      'removed', 'blocked', 'attention_required'
    )),
  CONSTRAINT wechat_publication_jobs_article_url_check
    CHECK (article_url IS NULL OR article_url ~ '^https://'),
  CONSTRAINT wechat_publication_jobs_lease_check
    CHECK (
      (lease_token IS NULL AND lease_expires_at IS NULL)
      OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    ),
  CONSTRAINT wechat_publication_jobs_idempotency_unique
    UNIQUE (user_id, connection_account_id, idempotency_key)
);

DROP INDEX IF EXISTS public.wechat_publication_jobs_one_active_output_idx;
CREATE UNIQUE INDEX wechat_publication_jobs_one_active_output_idx
  ON public.wechat_publication_jobs(output_id, connection_account_id)
  WHERE status IN ('scheduled', 'needs_reapproval', 'preparing', 'submitted', 'publishing', 'attention_required')
     OR (status = 'draft_ready' AND mode = 'scheduled_publish');

CREATE INDEX IF NOT EXISTS wechat_publication_jobs_due_idx
  ON public.wechat_publication_jobs(next_attempt_at, scheduled_for)
  WHERE status IN ('scheduled', 'submitted', 'publishing')
     OR (status = 'attention_required' AND publish_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS wechat_publication_jobs_user_created_idx
  ON public.wechat_publication_jobs(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS wechat_publication_jobs_publish_id_idx
  ON public.wechat_publication_jobs(publish_id)
  WHERE publish_id IS NOT NULL;

ALTER TABLE public.wechat_publication_jobs ENABLE ROW LEVEL SECURITY;
-- Reads and writes flow through ownership-checking server routes only.

CREATE TABLE IF NOT EXISTS public.wechat_publication_callback_events (
  event_key   text PRIMARY KEY CHECK (event_key ~ '^[0-9a-f]{64}$'),
  publish_id  text,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wechat_publication_callback_events ENABLE ROW LEVEL SECURITY;
-- No client policies. Rows contain only replay-prevention identifiers.

CREATE OR REPLACE FUNCTION public.claim_due_wechat_publication_jobs(
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 90
) RETURNS SETOF public.wechat_publication_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_wechat_publication_claim';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
    FROM public.wechat_publication_jobs job
    WHERE (
        job.status IN ('scheduled', 'submitted', 'publishing')
        OR (job.status = 'attention_required' AND job.publish_id IS NOT NULL)
      )
      AND job.next_attempt_at <= now()
      AND (job.status <> 'scheduled' OR job.scheduled_for <= now())
      AND (job.lease_expires_at IS NULL OR job.lease_expires_at <= now())
    ORDER BY job.next_attempt_at, job.scheduled_for, job.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.wechat_publication_jobs job
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

REVOKE ALL ON FUNCTION public.claim_due_wechat_publication_jobs(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_wechat_publication_jobs(integer, integer)
  TO service_role;
