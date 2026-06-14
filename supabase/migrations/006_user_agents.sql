-- ============================================================
-- Finfold — Letta Agent Mapping Table
-- Maps each Supabase user to their corresponding Letta agent.
-- ============================================================

-- 1. Create the user_agents table
CREATE TABLE IF NOT EXISTS public.user_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  letta_agent_id TEXT NOT NULL,
  letta_agent_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_agents_user_id UNIQUE (user_id),
  CONSTRAINT uq_user_agents_letta_agent_id UNIQUE (letta_agent_id)
);

-- 2. Enable Row Level Security
ALTER TABLE public.user_agents ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies
-- Users can read their own agent mapping
CREATE POLICY "Users can read own agent"
  ON public.user_agents FOR SELECT
  USING (auth.uid() = user_id);

-- Service role has full access (used by backend API routes)
CREATE POLICY "Service role agent full access"
  ON public.user_agents FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_agents_user_id ON public.user_agents (user_id);
CREATE INDEX IF NOT EXISTS idx_user_agents_letta_agent_id ON public.user_agents (letta_agent_id);

-- 5. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_user_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_user_agents_updated ON public.user_agents;
CREATE TRIGGER on_user_agents_updated
  BEFORE UPDATE ON public.user_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_user_agents_updated_at();
