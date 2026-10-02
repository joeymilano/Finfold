-- ============================================================
-- Migration 065: Server-only social account connection records
--
-- OAuth credentials must never be readable from a browser session. RLS is
-- therefore enabled with no client policies: all access is mediated by
-- authenticated Next.js routes using the service-role client. The new tables
-- are intentionally separate from user_integrations, which remains a legacy
-- X bearer-token store for manual-URL metric polling.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.social_connections (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id            text        NOT NULL,
  status                  text        NOT NULL DEFAULT 'pending',
  encrypted_access_token  text,
  encrypted_refresh_token text,
  token_expires_at        timestamptz,
  granted_scopes          text[]      NOT NULL DEFAULT '{}',
  last_error_code         text,
  connected_at            timestamptz,
  revoked_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_connections_connector_check
    CHECK (connector_id IN (
      'wechat', 'xiaohongshu', 'moments', 'x', 'linkedin', 'instagram',
      'facebook', 'reddit', 'product-hunt', 'threads', 'hacker-news',
      'indie-hackers', 'medium', 'substack'
    )),
  CONSTRAINT social_connections_status_check
    CHECK (status IN ('pending', 'connected', 'expired', 'revoked', 'error', 'disconnected')),
  CONSTRAINT social_connections_access_token_encrypted_check
    CHECK (encrypted_access_token IS NULL OR encrypted_access_token LIKE 'enc:v1:%'),
  CONSTRAINT social_connections_refresh_token_encrypted_check
    CHECK (encrypted_refresh_token IS NULL OR encrypted_refresh_token LIKE 'enc:v1:%'),
  CONSTRAINT social_connections_connected_token_check
    CHECK (status <> 'connected' OR encrypted_access_token IS NOT NULL),
  CONSTRAINT social_connections_unique_user_connector
    UNIQUE (user_id, connector_id)
);

CREATE INDEX IF NOT EXISTS social_connections_user_updated_idx
  ON public.social_connections(user_id, updated_at DESC);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
-- No client policies. This table contains encrypted OAuth credentials.

CREATE TABLE IF NOT EXISTS public.social_connection_accounts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id       uuid        NOT NULL REFERENCES public.social_connections(id) ON DELETE CASCADE,
  external_account_id text        NOT NULL,
  account_type        text        NOT NULL,
  handle              text,
  display_name        text,
  avatar_url          text,
  is_selected         boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_connection_accounts_unique_external_account
    UNIQUE (connection_id, external_account_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS social_connection_accounts_one_selected_idx
  ON public.social_connection_accounts(connection_id)
  WHERE is_selected;

ALTER TABLE public.social_connection_accounts ENABLE ROW LEVEL SECURITY;
-- No client policies. Account identities are returned only through server routes.

CREATE TABLE IF NOT EXISTS public.social_connection_audit_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid        REFERENCES public.social_connections(id) ON DELETE SET NULL,
  event_type    text        NOT NULL,
  metadata      jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_connection_audit_events_type_check
    CHECK (event_type IN (
      'connection_created',
      'connection_connected',
      'connection_refreshed',
      'connection_failed',
      'connection_expired',
      'connection_revoked',
      'connection_disconnected',
      'account_selected'
    )),
  CONSTRAINT social_connection_audit_events_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS social_connection_audit_events_user_created_idx
  ON public.social_connection_audit_events(user_id, created_at DESC);

ALTER TABLE public.social_connection_audit_events ENABLE ROW LEVEL SECURITY;
-- No client policies. Audit metadata must never contain access or refresh tokens.

CREATE OR REPLACE FUNCTION public.disconnect_social_connection(
  p_user_id uuid,
  p_connector_id text
) RETURNS public.social_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection public.social_connections%ROWTYPE;
BEGIN
  UPDATE public.social_connections
  SET
    status = 'disconnected',
    encrypted_access_token = NULL,
    encrypted_refresh_token = NULL,
    token_expires_at = NULL,
    granted_scopes = '{}',
    last_error_code = NULL,
    revoked_at = now(),
    updated_at = now()
  WHERE user_id = p_user_id
    AND connector_id = p_connector_id
  RETURNING * INTO v_connection;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.social_connection_accounts
  WHERE connection_id = v_connection.id;

  INSERT INTO public.social_connection_audit_events (
    user_id,
    connection_id,
    event_type,
    metadata
  ) VALUES (
    p_user_id,
    v_connection.id,
    'connection_disconnected',
    jsonb_build_object('connector_id', p_connector_id)
  );

  RETURN v_connection;
END;
$$;

REVOKE ALL ON FUNCTION public.disconnect_social_connection(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_social_connection(uuid, text)
  TO service_role;