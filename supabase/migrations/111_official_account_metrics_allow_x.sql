-- ============================================================
-- Migration 111: admit X accounts into the official account
-- metrics mirror.
--
-- Migration 093's save_official_social_account_metrics whitelist
-- only covered instagram/linkedin, so the X portfolio sync
-- (adapter pollAccountMetrics via users.read public_metrics)
-- failed with official_social_account_not_found before ever
-- reaching migration 104's portfolio snapshot RPC. Widen the
-- whitelist to include x; the function body is otherwise an
-- exact copy of 093's.
-- ============================================================

CREATE OR REPLACE FUNCTION public.save_official_social_account_metrics(
  p_user_id uuid,
  p_connection_account_id uuid,
  p_follower_count bigint,
  p_views bigint,
  p_reach bigint,
  p_profile_views bigint,
  p_measured_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection_account public.social_connection_accounts%ROWTYPE;
  v_connection public.social_connections%ROWTYPE;
  v_managed_account public.managed_social_accounts%ROWTYPE;
  v_snapshot_id uuid;
BEGIN
  SELECT account.* INTO v_connection_account
  FROM public.social_connection_accounts account
  JOIN public.social_connections connection ON connection.id = account.connection_id
  WHERE account.id = p_connection_account_id
    AND connection.user_id = p_user_id
    AND connection.status = 'connected'
    AND connection.connector_id IN ('instagram', 'linkedin', 'x');

  IF NOT FOUND THEN RAISE EXCEPTION 'official_social_account_not_found'; END IF;

  SELECT * INTO v_connection
  FROM public.social_connections
  WHERE id = v_connection_account.connection_id;

  IF (p_follower_count IS NOT NULL AND p_follower_count < 0)
     OR (p_views IS NOT NULL AND p_views < 0)
     OR (p_reach IS NOT NULL AND p_reach < 0)
     OR (p_profile_views IS NOT NULL AND p_profile_views < 0) THEN
    RAISE EXCEPTION 'invalid_official_social_account_metrics';
  END IF;

  INSERT INTO public.managed_social_accounts (
    user_id, platform, display_name, handle, avatar_url,
    connected_account_id, status, updated_at
  ) VALUES (
    p_user_id,
    v_connection.connector_id,
    coalesce(nullif(v_connection_account.display_name, ''), v_connection_account.external_account_id),
    v_connection_account.handle,
    v_connection_account.avatar_url,
    v_connection_account.id,
    'active',
    now()
  )
  ON CONFLICT (connected_account_id) WHERE connected_account_id IS NOT NULL DO UPDATE
  SET display_name = EXCLUDED.display_name,
      handle = EXCLUDED.handle,
      avatar_url = EXCLUDED.avatar_url,
      status = 'active',
      updated_at = now()
  RETURNING * INTO v_managed_account;

  IF p_follower_count IS NOT NULL OR p_views IS NOT NULL
     OR p_reach IS NOT NULL OR p_profile_views IS NOT NULL THEN
    INSERT INTO public.social_account_snapshots (
      account_id, user_id, follower_count, views, reach, profile_views,
      source, measured_at
    ) VALUES (
      v_managed_account.id,
      p_user_id,
      p_follower_count,
      p_views,
      p_reach,
      p_profile_views,
      'official_sync',
      coalesce(p_measured_at, now())
    ) RETURNING id INTO v_snapshot_id;
  END IF;

  INSERT INTO public.social_connection_audit_events (
    user_id, connection_id, event_type, metadata
  ) VALUES (
    p_user_id,
    v_connection.id,
    'account_metrics_synchronized',
    jsonb_build_object(
      'connector_id', v_connection.connector_id,
      'connection_account_id', v_connection_account.id,
      'snapshot_created', v_snapshot_id IS NOT NULL
    )
  );

  RETURN jsonb_build_object(
    'managed_account_id', v_managed_account.id,
    'snapshot_id', v_snapshot_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_official_social_account_metrics(
  uuid, uuid, bigint, bigint, bigint, bigint, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_official_social_account_metrics(
  uuid, uuid, bigint, bigint, bigint, bigint, timestamptz
) TO service_role;
