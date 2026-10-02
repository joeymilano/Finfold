-- ============================================================
-- Migration 028: Agent chat persistence
--
-- The AI Agent chat (app/(dashboard)/agents/page.tsx) previously kept
-- messages in React state only — refreshing the page lost the whole
-- conversation, and the agent had no durable record of what it had already
-- configured for a user. This adds sessions + messages tables so a chat
-- (including any tool_calls/tool_results/report the assistant produced)
-- survives a refresh, mirroring the one-row-per-entity + RLS pattern used
-- by every other per-user table in this schema.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_sessions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  title      text        not null default '新对话',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_updated
  ON public.agent_sessions(user_id, updated_at DESC);

ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent sessions: select own" ON public.agent_sessions;
CREATE POLICY "agent sessions: select own"
  ON public.agent_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "agent sessions: insert own" ON public.agent_sessions;
CREATE POLICY "agent sessions: insert own"
  ON public.agent_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "agent sessions: update own" ON public.agent_sessions;
CREATE POLICY "agent sessions: update own"
  ON public.agent_sessions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "agent sessions: delete own" ON public.agent_sessions;
CREATE POLICY "agent sessions: delete own"
  ON public.agent_sessions FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.agent_messages (
  id         uuid        primary key default gen_random_uuid(),
  session_id uuid        not null references public.agent_sessions(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  role       text        not null check (role in ('user', 'assistant', 'tool')),
  content    jsonb       not null,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_session_time
  ON public.agent_messages(session_id, created_at ASC);

ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent messages: select own" ON public.agent_messages;
CREATE POLICY "agent messages: select own"
  ON public.agent_messages FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "agent messages: insert own" ON public.agent_messages;
CREATE POLICY "agent messages: insert own"
  ON public.agent_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "agent messages: delete own" ON public.agent_messages;
CREATE POLICY "agent messages: delete own"
  ON public.agent_messages FOR DELETE
  USING (auth.uid() = user_id);
