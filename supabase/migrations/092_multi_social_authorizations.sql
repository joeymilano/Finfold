-- ============================================================
-- Migration 092: Multiple authorization grants per social platform
--
-- A connection is one provider-side authorization grant, not one platform.
-- One grant may expose multiple managed accounts and one Finfold user may
-- authorize the same connector more than once. OAuth state is bound to the
-- exact pending connection so callbacks cannot overwrite another grant.
-- ============================================================

ALTER TABLE public.social_connections
  DROP CONSTRAINT IF EXISTS social_connections_unique_user_connector;

CREATE INDEX IF NOT EXISTS social_connections_user_connector_status_idx
  ON public.social_connections(user_id, connector_id, status, updated_at DESC);

ALTER TABLE public.social_oauth_authorizations
  ADD COLUMN IF NOT EXISTS connection_id uuid
    REFERENCES public.social_connections(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS social_oauth_authorizations_connection_idx
  ON public.social_oauth_authorizations(connection_id, expires_at DESC);

ALTER TABLE public.social_oauth_authorizations
  DROP CONSTRAINT IF EXISTS social_oauth_authorizations_connector_check;

ALTER TABLE public.social_oauth_authorizations
  ADD CONSTRAINT social_oauth_authorizations_connector_check
  CHECK (connector_id IN ('x', 'linkedin', 'instagram', 'wechat'));

CREATE OR REPLACE FUNCTION public.create_social_oauth_authorization(
  p_user_id uuid,
  p_connector_id text,
  p_state_hash text,
  p_encrypted_pkce_verifier text,
  p_redirect_uri text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection public.social_connections%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR p_connector_id NOT IN ('x', 'linkedin', 'instagram', 'wechat')
     OR p_state_hash !~ '^[0-9a-f]{64}$'
     OR (
       p_connector_id IN ('x', 'linkedin')
       AND (p_encrypted_pkce_verifier IS NULL OR p_encrypted_pkce_verifier NOT LIKE 'enc:v1:%')
     )
     OR (p_connector_id IN ('instagram', 'wechat') AND p_encrypted_pkce_verifier IS NOT NULL)
     OR p_redirect_uri !~ '^https?://[^/]+' THEN
    RAISE EXCEPTION 'invalid_social_oauth_authorization';
  END IF;

  -- Expire abandoned pending grants without touching completed connections.
  UPDATE public.social_connections connection
  SET status = 'expired',
      last_error_code = 'authorization_expired',
      updated_at = now()
  FROM public.social_oauth_authorizations oauth_authorization
  WHERE oauth_authorization.connection_id = connection.id
    AND oauth_authorization.user_id = p_user_id
    AND oauth_authorization.consumed_at IS NULL
    AND oauth_authorization.expires_at <= now()
    AND connection.status = 'pending';

  DELETE FROM public.social_oauth_authorizations
  WHERE consumed_at IS NULL AND expires_at <= now();

  INSERT INTO public.social_connections (
    user_id,
    connector_id,
    status,
    updated_at
  ) VALUES (
    p_user_id,
    p_connector_id,
    'pending',
    now()
  ) RETURNING * INTO v_connection;

  INSERT INTO public.social_oauth_authorizations (
    user_id,
    connector_id,
    connection_id,
    state_hash,
    encrypted_pkce_verifier,
    redirect_uri,
    expires_at
  ) VALUES (
    p_user_id,
    p_connector_id,
    v_connection.id,
    p_state_hash,
    p_encrypted_pkce_verifier,
    p_redirect_uri,
    now() + interval '10 minutes'
  );

  INSERT INTO public.social_connection_audit_events (
    user_id,
    connection_id,
    event_type,
    metadata
  ) VALUES (
    p_user_id,
    v_connection.id,
    'authorization_started',
    jsonb_build_object('connector_id', p_connector_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_social_oauth_authorization_v2(
  p_state_hash text
) RETURNS TABLE (
  user_id uuid,
  connector_id text,
  connection_id uuid,
  encrypted_pkce_verifier text,
  redirect_uri text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_state_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_social_oauth_state';
  END IF;

  RETURN QUERY
  UPDATE public.social_oauth_authorizations oauth_authorization
  SET consumed_at = now()
  WHERE oauth_authorization.state_hash = p_state_hash
    AND oauth_authorization.connection_id IS NOT NULL
    AND oauth_authorization.consumed_at IS NULL
    AND oauth_authorization.expires_at > now()
  RETURNING
    oauth_authorization.user_id,
    oauth_authorization.connector_id,
    oauth_authorization.connection_id,
    oauth_authorization.encrypted_pkce_verifier,
    oauth_authorization.redirect_uri;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_social_oauth_connection_v2(
  p_user_id uuid,
  p_connection_id uuid,
  p_connector_id text,
  p_encrypted_access_token text,
  p_encrypted_refresh_token text,
  p_token_expires_at timestamptz,
  p_granted_scopes text[]
) RETURNS public.social_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection public.social_connections%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR p_connection_id IS NULL
     OR p_connector_id NOT IN ('x', 'linkedin', 'instagram', 'wechat')
     OR p_encrypted_access_token NOT LIKE 'enc:v1:%'
     OR (p_encrypted_refresh_token IS NOT NULL AND p_encrypted_refresh_token NOT LIKE 'enc:v1:%')
     OR COALESCE(array_length(p_granted_scopes, 1), 0) < 1 THEN
    RAISE EXCEPTION 'invalid_social_oauth_connection';
  END IF;

  UPDATE public.social_connections
  SET status = 'connected',
      encrypted_access_token = p_encrypted_access_token,
      encrypted_refresh_token = p_encrypted_refresh_token,
      token_expires_at = p_token_expires_at,
      granted_scopes = p_granted_scopes,
      connected_at = now(),
      revoked_at = NULL,
      last_error_code = NULL,
      updated_at = now()
  WHERE id = p_connection_id
    AND user_id = p_user_id
    AND connector_id = p_connector_id
    AND status = 'pending'
  RETURNING * INTO v_connection;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social_connection_not_found';
  END IF;

  INSERT INTO public.social_connection_audit_events (
    user_id,
    connection_id,
    event_type,
    metadata
  ) VALUES (
    p_user_id,
    v_connection.id,
    'connection_connected',
    jsonb_build_object('connector_id', p_connector_id)
  );

  RETURN v_connection;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_social_oauth_connection(
  p_user_id uuid,
  p_connection_id uuid,
  p_error_code text
) RETURNS public.social_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection public.social_connections%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR p_connection_id IS NULL
     OR p_error_code !~ '^[a-z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'invalid_social_oauth_failure';
  END IF;

  UPDATE public.social_connections
  SET status = 'error',
      encrypted_access_token = NULL,
      encrypted_refresh_token = NULL,
      token_expires_at = NULL,
      granted_scopes = '{}',
      last_error_code = p_error_code,
      updated_at = now()
  WHERE id = p_connection_id
    AND user_id = p_user_id
    AND status = 'pending'
  RETURNING * INTO v_connection;

  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO public.social_connection_audit_events (
    user_id, connection_id, event_type, metadata
  ) VALUES (
    p_user_id,
    v_connection.id,
    'connection_failed',
    jsonb_build_object('connector_id', v_connection.connector_id, 'error_code', p_error_code)
  );

  RETURN v_connection;
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_social_connection_by_id(
  p_user_id uuid,
  p_connection_id uuid
) RETURNS public.social_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection public.social_connections%ROWTYPE;
BEGIN
  UPDATE public.social_connections
  SET status = 'disconnected',
      encrypted_access_token = NULL,
      encrypted_refresh_token = NULL,
      token_expires_at = NULL,
      granted_scopes = '{}',
      last_error_code = NULL,
      revoked_at = now(),
      updated_at = now()
  WHERE id = p_connection_id
    AND user_id = p_user_id
  RETURNING * INTO v_connection;

  IF NOT FOUND THEN RETURN NULL; END IF;

  DELETE FROM public.social_connection_accounts
  WHERE connection_id = v_connection.id;

  INSERT INTO public.social_connection_audit_events (
    user_id, connection_id, event_type, metadata
  ) VALUES (
    p_user_id,
    v_connection.id,
    'connection_disconnected',
    jsonb_build_object('connector_id', v_connection.connector_id)
  );

  RETURN v_connection;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_social_oauth_authorization_v2(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_social_oauth_authorization_v2(text)
  TO service_role;

REVOKE ALL ON FUNCTION public.complete_social_oauth_connection_v2(
  uuid, uuid, text, text, text, timestamptz, text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_social_oauth_connection_v2(
  uuid, uuid, text, text, text, timestamptz, text[]
) TO service_role;

REVOKE ALL ON FUNCTION public.fail_social_oauth_connection(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_social_oauth_connection(uuid, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.disconnect_social_connection_by_id(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_social_connection_by_id(uuid, uuid)
  TO service_role;
