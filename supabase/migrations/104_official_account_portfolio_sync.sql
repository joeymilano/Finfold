-- ============================================================
-- Migration 104: Official account portfolio snapshot for every
-- connected social account (matrix support).
--
-- Migration 090 already mirrors WeChat Official Account metrics
-- into the growth portfolio. Matrix operators also connect X,
-- LinkedIn, and Instagram authorizations, each carrying multiple
-- accounts. This generic RPC gives every connector the same
-- behavior: one snapshot row per connected account, keyed by
-- connected_account_id so re-syncs append instead of duplicate.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_official_account_portfolio_snapshot(
  p_user_id uuid,
  p_connection_account_id uuid,
  p_follower_count bigint,
  p_views bigint,
  p_measured_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection_id uuid;
  v_connector_id text;
  v_external_account_id text;
  v_display_name text;
  v_handle text;
  v_avatar_url text;
  v_managed_account public.managed_social_accounts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR p_connection_account_id IS NULL
     OR (p_follower_count IS NOT NULL AND p_follower_count < 0)
     OR (p_views IS NOT NULL AND p_views < 0)
     OR p_measured_at IS NULL THEN
    RAISE EXCEPTION 'invalid_official_account_portfolio_snapshot';
  END IF;
  IF p_follower_count IS NULL AND p_views IS NULL THEN
    RAISE EXCEPTION 'official_account_portfolio_snapshot_requires_a_metric';
  END IF;

  SELECT
    connection.id,
    connection.connector_id,
    account.external_account_id,
    account.display_name,
    account.handle,
    account.avatar_url
  INTO
    v_connection_id,
    v_connector_id,
    v_external_account_id,
    v_display_name,
    v_handle,
    v_avatar_url
  FROM public.social_connection_accounts account
  JOIN public.social_connections connection ON connection.id = account.connection_id
  WHERE account.id = p_connection_account_id
    AND connection.user_id = p_user_id
    AND connection.connector_id IN ('x', 'linkedin', 'instagram', 'wechat')
    AND connection.status = 'connected';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social_connection_account_not_found';
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
    v_connector_id,
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
    NULL,
    p_views,
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
      'connector_id', v_connector_id,
      'portfolio_snapshot', true
    )
  );

  RETURN v_managed_account.id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_official_account_portfolio_snapshot(
  uuid, uuid, bigint, bigint, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_official_account_portfolio_snapshot(
  uuid, uuid, bigint, bigint, timestamptz
) TO service_role;
