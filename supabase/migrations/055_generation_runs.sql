-- ============================================================
-- Migration 055: Durable generation run state
--
-- The interactive generation endpoint still streams results over SSE, but
-- the browser connection is no longer the only record that a generation
-- existed. Every authenticated request gets a durable, user-owned run row
-- before credits are reserved or an LLM is called.
--
-- This migration deliberately stores only operational metadata and a
-- SHA-256 request fingerprint. Raw source copy, Brand Brain content, prompts,
-- and model responses remain in their existing owner-scoped tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.generation_runs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id            text        NOT NULL,
  request_fingerprint   text        NOT NULL,
  trace_id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  status                text        NOT NULL DEFAULT 'queued',
  current_step          text        NOT NULL DEFAULT 'validate_request',
  attempt_count         integer     NOT NULL DEFAULT 1,
  platform_count        integer     NOT NULL DEFAULT 0,
  model_tier            text,
  credit_cost           integer     NOT NULL DEFAULT 0,
  credits_refunded      boolean     NOT NULL DEFAULT false,
  content_kit_id        uuid        REFERENCES public.content_kits(id) ON DELETE SET NULL,
  error_code            text,
  error_message         text,
  retryable             boolean     NOT NULL DEFAULT false,
  started_at            timestamptz,
  completed_at          timestamptz,
  last_heartbeat_at     timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generation_runs_request_id_length_check
    CHECK (char_length(request_id) BETWEEN 8 AND 128),
  CONSTRAINT generation_runs_fingerprint_check
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT generation_runs_status_check
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT generation_runs_step_check
    CHECK (current_step IN (
      'validate_request',
      'reserve_credits',
      'moderate_input',
      'load_context',
      'generate_outputs',
      'persist_kit',
      'finalize'
    )),
  CONSTRAINT generation_runs_attempt_count_check
    CHECK (attempt_count > 0),
  CONSTRAINT generation_runs_platform_count_check
    CHECK (platform_count >= 0),
  CONSTRAINT generation_runs_credit_cost_check
    CHECK (credit_cost >= 0),
  CONSTRAINT generation_runs_model_tier_check
    CHECK (model_tier IS NULL OR model_tier IN ('haiku', 'sonnet', 'opus')),
  CONSTRAINT generation_runs_terminal_time_check
    CHECK (
      (status IN ('succeeded', 'failed', 'cancelled') AND completed_at IS NOT NULL)
      OR
      (status IN ('queued', 'running') AND completed_at IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS generation_runs_user_request_idx
  ON public.generation_runs(user_id, request_id);

CREATE UNIQUE INDEX IF NOT EXISTS generation_runs_content_kit_idx
  ON public.generation_runs(content_kit_id)
  WHERE content_kit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS generation_runs_user_created_idx
  ON public.generation_runs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS generation_runs_recovery_idx
  ON public.generation_runs(status, last_heartbeat_at)
  WHERE status IN ('queued', 'running');

ALTER TABLE public.generation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "generation runs: select own" ON public.generation_runs;
CREATE POLICY "generation runs: select own"
  ON public.generation_runs FOR SELECT
  USING (auth.uid() = user_id);

-- No client INSERT/UPDATE/DELETE policies. State transitions are performed
-- only by trusted server code using the service-role client.
