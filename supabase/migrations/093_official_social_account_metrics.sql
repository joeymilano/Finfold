-- ============================================================
-- Migration 093: Exact-account official social evidence
--
-- Provider reads stay separate from manual performance input. Every nullable
-- metric means "not returned by the provider", never an invented zero.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.official_social_post_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_account_id uuid NOT NULL
    REFERENCES public.social_connection_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id text NOT NULL CHECK (connector_id IN ('linkedin', 'instagram')),
  external_post_id text NOT NULL CHECK (char_length(external_post_id) BETWEEN 1 AND 255),
  post_url text CHECK (post_url IS NULL OR post_url ~ '^https://[^[:space:]]+$'),
  caption_excerpt text CHECK (caption_excerpt IS NULL OR char_length(caption_excerpt) <= 2000),
  published_at timestamptz,
  impressions bigint CHECK (impressions IS NULL OR impressions >= 0),
  views bigint CHECK (views IS NULL OR views >= 0),
  reach bigint CHECK (reach IS NULL OR reach >= 0),
  reactions bigint CHECK (reactions IS NULL OR reactions >= 0),
  comments bigint CHECK (comments IS NULL OR comments >= 0),
  measured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_account_id, external_post_id),
  CHECK (
    impressions IS NOT NULL OR views IS NOT NULL OR reach IS NOT NULL
    OR reactions IS NOT NULL OR comments IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS official_social_post_metrics_user_connector_idx
  ON public.official_social_post_metrics(user_id, connector_id, measured_at DESC);

ALTER TABLE public.official_social_post_metrics ENABLE ROW LEVEL SECURITY;
-- No browser policies. Official evidence is written and projected only by
-- authenticated server routes after exact connection ownership checks.

ALTER TABLE public.social_account_snapshots
  ADD COLUMN IF NOT EXISTS reach bigint CHECK (reach IS NULL OR reach >= 0);

ALTER TABLE public.social_account_snapshots
  ADD COLUMN IF NOT EXISTS profile_views bigint
    CHECK (profile_views IS NULL OR profile_views >= 0);

DO $$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.social_account_snapshots'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%follower_count IS NOT NULL%'
      AND pg_get_constraintdef(oid) LIKE '%period_follower_growth IS NOT NULL%'
      AND pg_get_constraintdef(oid) LIKE '%views IS NOT NULL%'
      AND pg_get_constraintdef(oid) LIKE '%leads IS NOT NULL%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.social_account_snapshots DROP CONSTRAINT %I',
      v_constraint.conname
    );
  END LOOP;
END
$$;

ALTER TABLE public.social_account_snapshots
  DROP CONSTRAINT IF EXISTS social_account_snapshots_has_observation_check;

ALTER TABLE public.social_account_snapshots
  ADD CONSTRAINT social_account_snapshots_has_observation_check
  CHECK (
    follower_count IS NOT NULL OR period_follower_growth IS NOT NULL
    OR views IS NOT NULL OR leads IS NOT NULL OR reach IS NOT NULL
    OR profile_views IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.save_official_social_post_metrics(
  p_user_id uuid,
  p_connection_account_id uuid,
  p_external_post_id text,
  p_post_url text,
  p_caption_excerpt text,
  p_published_at timestamptz,
  p_impressions bigint,
  p_views bigint,
  p_reach bigint,
  p_reactions bigint,
  p_comments bigint,
  p_measured_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection public.social_connections%ROWTYPE;
  v_existed boolean;
  v_metric public.official_social_post_metrics%ROWTYPE;
BEGIN
  SELECT connection.* INTO v_connection
  FROM public.social_connection_accounts account
  JOIN public.social_connections connection ON connection.id = account.connection_id
  WHERE account.id = p_connection_account_id
    AND connection.user_id = p_user_id
    AND connection.status = 'connected'
    AND connection.connector_id IN ('linkedin', 'instagram');

  IF NOT FOUND THEN RAISE EXCEPTION 'official_social_account_not_found'; END IF;

  IF p_external_post_id IS NULL OR char_length(p_external_post_id) NOT BETWEEN 1 AND 255
     OR (p_post_url IS NOT NULL AND p_post_url !~ '^https://[^[:space:]]+$')
     OR (p_caption_excerpt IS NOT NULL AND char_length(p_caption_excerpt) > 2000)
     OR p_measured_at IS NULL
     OR (p_impressions IS NOT NULL AND p_impressions < 0)
     OR (p_views IS NOT NULL AND p_views < 0)
     OR (p_reach IS NOT NULL AND p_reach < 0)
     OR (p_reactions IS NOT NULL AND p_reactions < 0)
     OR (p_comments IS NOT NULL AND p_comments < 0)
     OR (
       p_impressions IS NULL AND p_views IS NULL AND p_reach IS NULL
       AND p_reactions IS NULL AND p_comments IS NULL
     ) THEN
    RAISE EXCEPTION 'invalid_official_social_post_metrics';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.official_social_post_metrics
    WHERE connection_account_id = p_connection_account_id
      AND external_post_id = p_external_post_id
  ) INTO v_existed;

  INSERT INTO public.official_social_post_metrics (
    connection_account_id,
    user_id,
    connector_id,
    external_post_id,
    post_url,
    caption_excerpt,
    published_at,
    impressions,
    views,
    reach,
    reactions,
    comments,
    measured_at,
    updated_at
  ) VALUES (
    p_connection_account_id,
    p_user_id,
    v_connection.connector_id,
    p_external_post_id,
    p_post_url,
    nullif(left(p_caption_excerpt, 2000), ''),
    p_published_at,
    p_impressions,
    p_views,
    p_reach,
    p_reactions,
    p_comments,
    p_measured_at,
    now()
  )
  ON CONFLICT (connection_account_id, external_post_id) DO UPDATE
  SET post_url = EXCLUDED.post_url,
      caption_excerpt = EXCLUDED.caption_excerpt,
      published_at = EXCLUDED.published_at,
      impressions = EXCLUDED.impressions,
      views = EXCLUDED.views,
      reach = EXCLUDED.reach,
      reactions = EXCLUDED.reactions,
      comments = EXCLUDED.comments,
      measured_at = EXCLUDED.measured_at,
      updated_at = now()
  RETURNING * INTO v_metric;

  RETURN jsonb_build_object('id', v_metric.id, 'created', NOT v_existed);
END;
$$;

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
    AND connection.connector_id IN ('instagram', 'linkedin');

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

REVOKE ALL ON FUNCTION public.save_official_social_post_metrics(
  uuid, uuid, text, text, text, timestamptz,
  bigint, bigint, bigint, bigint, bigint, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_official_social_post_metrics(
  uuid, uuid, text, text, text, timestamptz,
  bigint, bigint, bigint, bigint, bigint, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.save_official_social_account_metrics(
  uuid, uuid, bigint, bigint, bigint, bigint, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_official_social_account_metrics(
  uuid, uuid, bigint, bigint, bigint, bigint, timestamptz
) TO service_role;
