-- ============================================================
-- Migration 090: WeChat Official Account component authorization
-- and official user-summary synchronization.
--
-- WeChat component tickets and authorizer credentials are server-only. The
-- browser receives only safe account metadata and aggregate follower counts.
-- Individual WeChat users are never stored.
-- ============================================================

ALTER TABLE public.social_oauth_authorizations
  ALTER COLUMN encrypted_pkce_verifier DROP NOT NULL;

ALTER TABLE public.social_oauth_authorizations
  DROP CONSTRAINT IF EXISTS social_oauth_authorizations_connector_check;

ALTER TABLE public.social_oauth_authorizations
  ADD CONSTRAINT social_oauth_authorizations_connector_check
  CHECK (connector_id IN ('x', 'linkedin', 'wechat'));

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
BEGIN
  IF p_user_id IS NULL
     OR p_connector_id NOT IN ('x', 'linkedin', 'wechat')
     OR p_state_hash !~ '^[0-9a-f]{64}$'
     OR (
       p_connector_id IN ('x', 'linkedin')
       AND (p_encrypted_pkce_verifier IS NULL OR p_encrypted_pkce_verifier NOT LIKE 'enc:v1:%')
     )
     OR (p_connector_id = 'wechat' AND p_encrypted_pkce_verifier IS NOT NULL)
     OR p_redirect_uri !~ '^https?://[^/]+' THEN
    RAISE EXCEPTION 'invalid_social_oauth_authorization';
  END IF;

  DELETE FROM public.social_oauth_authorizations
  WHERE user_id = p_user_id
    AND connector_id = p_connector_id;

  INSERT INTO public.social_oauth_authorizations (
    user_id,
    connector_id,
    state_hash,
    encrypted_pkce_verifier,
    redirect_uri,
    expires_at
  ) VALUES (
    p_user_id,
    p_connector_id,
    p_state_hash,
    p_encrypted_pkce_verifier,
    p_redirect_uri,
    now() + interval '10 minutes'
  );

  INSERT INTO public.social_connection_audit_events (
    user_id,
    event_type,
    metadata
  ) VALUES (
    p_user_id,
    'authorization_started',
    jsonb_build_object('connector_id', p_connector_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_social_oauth_connection(
  p_user_id uuid,
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
     OR p_connector_id NOT IN ('x', 'linkedin', 'wechat')
     OR p_encrypted_access_token NOT LIKE 'enc:v1:%'
     OR (p_encrypted_refresh_token IS NOT NULL AND p_encrypted_refresh_token NOT LIKE 'enc:v1:%')
     OR COALESCE(array_length(p_granted_scopes, 1), 0) < 1 THEN
    RAISE EXCEPTION 'invalid_social_oauth_connection';
  END IF;

  INSERT INTO public.social_connections (
    user_id,
    connector_id,
    status,
    encrypted_access_token,
    encrypted_refresh_token,
    token_expires_at,
    granted_scopes,
    connected_at,
    revoked_at,
    last_error_code,
    updated_at
  ) VALUES (
    p_user_id,
    p_connector_id,
    'connected',
    p_encrypted_access_token,
    p_encrypted_refresh_token,
    p_token_expires_at,
    p_granted_scopes,
    now(),
    NULL,
    NULL,
    now()
  )
  ON CONFLICT (user_id, connector_id) DO UPDATE
  SET
    status = 'connected',
    encrypted_access_token = EXCLUDED.encrypted_access_token,
    encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
    token_expires_at = EXCLUDED.token_expires_at,
    granted_scopes = EXCLUDED.granted_scopes,
    connected_at = now(),
    revoked_at = NULL,
    last_error_code = NULL,
    updated_at = now()
  RETURNING * INTO v_connection;

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

CREATE TABLE IF NOT EXISTS public.wechat_component_tickets (
  component_app_id text PRIMARY KEY
    CHECK (component_app_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  encrypted_verify_ticket text NOT NULL
    CHECK (encrypted_verify_ticket LIKE 'enc:v1:%'),
  received_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wechat_component_tickets ENABLE ROW LEVEL SECURITY;
-- No client policies. The ticket is decrypted only in server-side routes.

CREATE TABLE IF NOT EXISTS public.wechat_user_summary_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_account_id uuid NOT NULL
    REFERENCES public.social_connection_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ref_date date NOT NULL,
  user_source integer NOT NULL CHECK (user_source >= 0),
  new_user bigint NOT NULL CHECK (new_user >= 0),
  cancel_user bigint NOT NULL CHECK (cancel_user >= 0),
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_account_id, ref_date, user_source)
);

CREATE INDEX IF NOT EXISTS wechat_user_summary_user_date_idx
  ON public.wechat_user_summary_daily(user_id, ref_date DESC);

ALTER TABLE public.wechat_user_summary_daily ENABLE ROW LEVEL SECURITY;
-- No client policies. Aggregate rows are exposed through server read models.

CREATE UNIQUE INDEX IF NOT EXISTS managed_social_accounts_connected_account_unique
  ON public.managed_social_accounts(connected_account_id)
  WHERE connected_account_id IS NOT NULL;

ALTER TABLE public.social_connection_audit_events
  DROP CONSTRAINT IF EXISTS social_connection_audit_events_type_check;

ALTER TABLE public.social_connection_audit_events
  ADD CONSTRAINT social_connection_audit_events_type_check
  CHECK (event_type IN (
    'connection_created',
    'connection_connected',
    'connection_refreshed',
    'connection_failed',
    'connection_expired',
    'connection_revoked',
    'connection_disconnected',
    'account_selected',
    'account_synchronized',
    'account_metrics_synchronized',
    'authorization_started'
  ));

CREATE OR REPLACE FUNCTION public.save_wechat_official_account_metrics(
  p_user_id uuid,
  p_connection_account_id uuid,
  p_summary_rows jsonb,
  p_follower_count bigint,
  p_period_follower_growth integer,
  p_measured_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection_id uuid;
  v_external_account_id text;
  v_display_name text;
  v_handle text;
  v_avatar_url text;
  v_managed_account public.managed_social_accounts%ROWTYPE;
  v_rows integer := 0;
  v_period_growth bigint := 0;
BEGIN
  IF p_user_id IS NULL
     OR p_connection_account_id IS NULL
     OR jsonb_typeof(COALESCE(p_summary_rows, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_summary_rows, '[]'::jsonb)) > 20000
     OR (p_follower_count IS NOT NULL AND p_follower_count < 0)
     OR p_period_follower_growth IS NULL
     OR p_measured_at IS NULL THEN
    RAISE EXCEPTION 'invalid_wechat_official_account_metrics';
  END IF;

  SELECT
    account.connection_id,
    account.external_account_id,
    account.display_name,
    account.handle,
    account.avatar_url
  INTO
    v_connection_id,
    v_external_account_id,
    v_display_name,
    v_handle,
    v_avatar_url
  FROM public.social_connection_accounts account
  JOIN public.social_connections connection ON connection.id = account.connection_id
  WHERE account.id = p_connection_account_id
    AND connection.user_id = p_user_id
    AND connection.connector_id = 'wechat'
    AND connection.status = 'connected';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wechat_social_connection_account_not_found';
  END IF;

  INSERT INTO public.wechat_user_summary_daily (
    connection_account_id,
    user_id,
    ref_date,
    user_source,
    new_user,
    cancel_user,
    synced_at
  )
  SELECT
    p_connection_account_id,
    p_user_id,
    rows.ref_date,
    rows.user_source,
    rows.new_user,
    rows.cancel_user,
    now()
  FROM jsonb_to_recordset(COALESCE(p_summary_rows, '[]'::jsonb)) AS rows(
    ref_date date,
    user_source integer,
    new_user bigint,
    cancel_user bigint
  )
  WHERE rows.ref_date IS NOT NULL
    AND rows.user_source >= 0
    AND rows.new_user >= 0
    AND rows.cancel_user >= 0
  ON CONFLICT (connection_account_id, ref_date, user_source) DO UPDATE
  SET
    new_user = EXCLUDED.new_user,
    cancel_user = EXCLUDED.cancel_user,
    synced_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  SELECT COALESCE(SUM(new_user - cancel_user), 0)
  INTO v_period_growth
  FROM public.wechat_user_summary_daily
  WHERE connection_account_id = p_connection_account_id
    AND ref_date >= date_trunc('month', p_measured_at AT TIME ZONE 'Asia/Shanghai')::date
    AND ref_date <= (p_measured_at AT TIME ZONE 'Asia/Shanghai')::date;

  IF v_period_growth < -2000000000 OR v_period_growth > 2000000000 THEN
    RAISE EXCEPTION 'wechat_official_account_period_growth_out_of_range';
  END IF;

  INSERT INTO public.managed_social_accounts (
    user_id,
    platform,
    display_name,
    handle,
    avatar_url,
    connected_account_id,
    status,
    updated_at
  ) VALUES (
    p_user_id,
    'wechat',
    COALESCE(NULLIF(v_display_name, ''), v_external_account_id),
    v_handle,
    v_avatar_url,
    p_connection_account_id,
    'active',
    now()
  )
  ON CONFLICT (connected_account_id) WHERE connected_account_id IS NOT NULL DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    handle = EXCLUDED.handle,
    avatar_url = EXCLUDED.avatar_url,
    status = 'active',
    updated_at = now()
  RETURNING * INTO v_managed_account;

  INSERT INTO public.social_account_snapshots (
    account_id,
    user_id,
    follower_count,
    period_follower_growth,
    views,
    leads,
    source,
    measured_at
  ) VALUES (
    v_managed_account.id,
    p_user_id,
    p_follower_count,
    v_period_growth::integer,
    NULL,
    NULL,
    'official_sync',
    p_measured_at
  );

  INSERT INTO public.social_connection_audit_events (
    user_id,
    connection_id,
    event_type,
    metadata
  ) VALUES (
    p_user_id,
    v_connection_id,
    'account_metrics_synchronized',
    jsonb_build_object(
      'connector_id', 'wechat',
      'summary_rows', v_rows,
      'measured_at', p_measured_at
    )
  );

  RETURN jsonb_build_object(
    'managed_account_id', v_managed_account.id,
    'summary_rows', v_rows,
    'period_follower_growth', v_period_growth
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_social_oauth_authorization(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_social_oauth_authorization(uuid, text, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.complete_social_oauth_connection(
  uuid, text, text, text, timestamptz, text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_social_oauth_connection(
  uuid, text, text, text, timestamptz, text[]
) TO service_role;

REVOKE ALL ON FUNCTION public.save_wechat_official_account_metrics(
  uuid, uuid, jsonb, bigint, integer, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_wechat_official_account_metrics(
  uuid, uuid, jsonb, bigint, integer, timestamptz
) TO service_role;
