-- ============================================================
-- Migration 034: Revocable API tokens for remote MCP clients
--
-- Tokens are generated in app/api/mcp/tokens and only their SHA-256 hashes
-- are stored. There are deliberately no RLS policies: browser/anon clients
-- must never read token hashes, while authenticated management and MCP
-- verification run through server routes with the service role.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mcp_api_tokens (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  name         text        not null check (char_length(name) between 1 and 60),
  token_hash   text        not null unique,
  token_prefix text        not null,
  scopes       text[]      not null default array['brand:read', 'rules:read', 'content:generate'],
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_api_tokens_user_created
  ON public.mcp_api_tokens(user_id, created_at DESC);

ALTER TABLE public.mcp_api_tokens ENABLE ROW LEVEL SECURITY;
