-- ============================================================
-- Migration 029: Agent mutation audit + safe undo metadata
--
-- Every agent tool that changes Brand Memory or guardrails records the full
-- before/after state. Undo is allowed only while the current state still
-- matches the recorded after-state, preventing an old undo from overwriting
-- a newer user or agent edit.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_action_audit (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  session_id    uuid        references public.agent_sessions(id) on delete set null,
  tool_name     text        not null,
  target_type   text        not null check (target_type in ('guardrails', 'brand_brain')),
  action_args   jsonb       not null default '{}',
  before_state  jsonb       not null,
  after_state   jsonb       not null,
  status        text        not null default 'applied' check (status in ('applied', 'reverted')),
  created_at    timestamptz not null default now(),
  reverted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_action_audit_user_created
  ON public.agent_action_audit(user_id, created_at DESC);

ALTER TABLE public.agent_action_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent action audit: select own" ON public.agent_action_audit;
CREATE POLICY "agent action audit: select own"
  ON public.agent_action_audit FOR SELECT
  USING (auth.uid() = user_id);

-- Inserts and status changes go through server routes using the service role.
-- No direct browser INSERT/UPDATE/DELETE policy is granted.

