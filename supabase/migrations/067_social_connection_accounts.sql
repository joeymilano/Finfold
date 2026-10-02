-- ============================================================
-- Migration 067: Social account synchronization and selection
--
-- Account identity metadata is persisted only through service-role RPCs. This
-- keeps the selected-account invariant and user ownership validation atomic.
-- ============================================================

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
    'authorization_started'
  ));

CREATE OR REPLACE FUNCTION public.upsert_social_connection_account(
  p_user_id uuid,
  p_connection_id uuid,
  p_external_account_id text,
  p_account_type text,
  p_handle text,
  p_display_name text,
  p_avatar_url text
) RETURNS public.social_connection_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection public.social_connections%ROWTYPE;
  v_account public.social_connection_accounts%ROWTYPE;
  v_select_account boolean;
BEGIN
  IF p_user_id IS NULL
     OR p_connection_id IS NULL
     OR p_external_account_id IS NULL
     OR length(p_external_account_id) < 1
     OR length(p_external_account_id) > 255
     OR p_account_type NOT IN ('profile', 'page', 'organization')
     OR p_display_name IS NULL
     OR length(p_display_name) < 1
     OR length(p_display_name) > 512
     OR (p_handle IS NOT NULL AND length(p_handle) > 256)
     OR (p_avatar_url IS NOT NULL AND p_avatar_url !~ '^https://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'invalid_social_connection_account';
  END IF;

  SELECT * INTO v_connection
  FROM public.social_connections
  WHERE id = p_connection_id
    AND user_id = p_user_id
    AND status = 'connected';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social_connection_not_found';
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.social_connection_accounts
    WHERE connection_id = p_connection_id
      AND is_selected
  ) INTO v_select_account;

  INSERT INTO public.social_connection_accounts (
    connection_id,
    external_account_id,
    account_type,
    handle,
    display_name,
    avatar_url,
    is_selected,
    updated_at
  ) VALUES (
    p_connection_id,
    p_external_account_id,
    p_account_type,
    p_handle,
    p_display_name,
    p_avatar_url,
    v_select_account,
    now()
  )
  ON CONFLICT (connection_id, external_account_id) DO UPDATE
  SET
    account_type = EXCLUDED.account_type,
    handle = EXCLUDED.handle,
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = now()
  RETURNING * INTO v_account;

  INSERT INTO public.social_connection_audit_events (
    user_id,
    connection_id,
    event_type,
    metadata
  ) VALUES (
    p_user_id,
    p_connection_id,
    'account_synchronized',
    jsonb_build_object(
      'connector_id', v_connection.connector_id,
      'account_type', v_account.account_type
    )
  );

  RETURN v_account;
END;
$$;

CREATE OR REPLACE FUNCTION public.select_social_connection_account(
  p_user_id uuid,
  p_connection_id uuid,
  p_account_id uuid
) RETURNS public.social_connection_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection public.social_connections%ROWTYPE;
  v_account public.social_connection_accounts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_connection_id IS NULL OR p_account_id IS NULL THEN
    RAISE EXCEPTION 'invalid_social_connection_account_selection';
  END IF;

  SELECT * INTO v_connection
  FROM public.social_connections
  WHERE id = p_connection_id
    AND user_id = p_user_id
    AND status = 'connected';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social_connection_not_found';
  END IF;

  SELECT * INTO v_account
  FROM public.social_connection_accounts
  WHERE id = p_account_id
    AND connection_id = p_connection_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social_connection_account_not_found';
  END IF;

  UPDATE public.social_connection_accounts
  SET is_selected = false, updated_at = now()
  WHERE connection_id = p_connection_id
    AND is_selected;

  UPDATE public.social_connection_accounts
  SET is_selected = true, updated_at = now()
  WHERE id = p_account_id
  RETURNING * INTO v_account;

  INSERT INTO public.social_connection_audit_events (
    user_id,
    connection_id,
    event_type,
    metadata
  ) VALUES (
    p_user_id,
    p_connection_id,
    'account_selected',
    jsonb_build_object(
      'connector_id', v_connection.connector_id,
      'account_type', v_account.account_type
    )
  );

  RETURN v_account;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_social_connection_account(
  uuid, uuid, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_social_connection_account(
  uuid, uuid, text, text, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.select_social_connection_account(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.select_social_connection_account(uuid, uuid, uuid)
  TO service_role;