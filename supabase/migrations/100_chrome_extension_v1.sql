-- Finfold Chrome Extension V1: anonymous cost firewall, OAuth PKCE sessions,
-- idempotent authenticated actions, and claim receipts. No anonymous URL,
-- webpage body, domain, or generated result is persisted.

CREATE TABLE IF NOT EXISTS public.extension_anonymous_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  installation_hash text NOT NULL,
  ip_day_hash text NOT NULL,
  usage_day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  platform text NOT NULL CHECK (platform IN ('x', 'linkedin', 'xiaohongshu', 'reddit')),
  status text NOT NULL CHECK (status IN ('reserved', 'succeeded', 'failed')),
  provider_name text,
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  total_tokens integer CHECK (total_tokens IS NULL OR total_tokens >= 0),
  failure_code text,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_kit_id uuid,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_extension_anon_install
  ON public.extension_anonymous_actions(installation_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extension_anon_ip_day
  ON public.extension_anonymous_actions(ip_day_hash, usage_day);
CREATE INDEX IF NOT EXISTS idx_extension_anon_usage_day
  ON public.extension_anonymous_actions(usage_day, status);

ALTER TABLE public.extension_anonymous_actions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reserve_extension_anonymous_action(
  p_request_id uuid,
  p_installation_hash text,
  p_ip_day_hash text,
  p_previous_ip_day_hash text,
  p_usage_day date,
  p_platform text,
  p_ip_attempt_limit integer DEFAULT 3,
  p_global_attempt_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.extension_anonymous_actions%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_ip_attempt_limit < 1 OR p_global_attempt_limit < 1 THEN
    RAISE EXCEPTION 'invalid extension anonymous limits';
  END IF;

  -- One lock serializes the deliberately small global free pool and closes
  -- concurrent installation/IP races before any provider request begins.
  PERFORM pg_advisory_xact_lock(hashtext('finfold-extension-anonymous-' || p_usage_day::text));

  SELECT * INTO v_existing
  FROM public.extension_anonymous_actions
  WHERE request_id = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'existing_' || v_existing.status,
      'actionId', v_existing.id
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.extension_anonymous_actions
    WHERE installation_hash = p_installation_hash
      AND status IN ('reserved', 'succeeded')
  ) THEN
    RETURN jsonb_build_object('outcome', 'installation_limit');
  END IF;

  IF (
    SELECT count(*) FROM public.extension_anonymous_actions
    WHERE ip_day_hash IN (p_ip_day_hash, p_previous_ip_day_hash)
      AND created_at >= now() - interval '24 hours'
  ) >= p_ip_attempt_limit THEN
    RETURN jsonb_build_object('outcome', 'ip_limit');
  END IF;

  IF (
    SELECT count(*) FROM public.extension_anonymous_actions
    WHERE usage_day = p_usage_day
  ) >= p_global_attempt_limit THEN
    RETURN jsonb_build_object('outcome', 'global_limit');
  END IF;

  INSERT INTO public.extension_anonymous_actions (
    request_id, installation_hash, ip_day_hash, usage_day, platform, status
  ) VALUES (
    p_request_id, p_installation_hash, p_ip_day_hash, p_usage_day, p_platform, 'reserved'
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('outcome', 'reserved', 'actionId', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_extension_anonymous_action(uuid, text, text, text, date, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_extension_anonymous_action(uuid, text, text, text, date, text, integer, integer) TO service_role;

CREATE TABLE IF NOT EXISTS public.extension_oauth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  scope text NOT NULL DEFAULT 'extension:generate extension:save',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_extension_oauth_codes_expiry
  ON public.extension_oauth_codes(expires_at);
ALTER TABLE public.extension_oauth_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.extension_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token_hash text NOT NULL UNIQUE,
  access_expires_at timestamptz NOT NULL,
  refresh_token_hash text NOT NULL UNIQUE,
  refresh_expires_at timestamptz NOT NULL,
  scope text NOT NULL DEFAULT 'extension:generate extension:save',
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_extension_sessions_user
  ON public.extension_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extension_sessions_refresh_expiry
  ON public.extension_sessions(refresh_expires_at);
ALTER TABLE public.extension_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.extension_action_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kit_id uuid NOT NULL,
  platform_count integer NOT NULL CHECK (platform_count IN (1, 4)),
  credit_cost integer NOT NULL CHECK (credit_cost IN (3, 24)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, request_id)
);
ALTER TABLE public.extension_action_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "extension action results: select own"
  ON public.extension_action_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.extension_model_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  model_name text NOT NULL,
  provider_cost_class text NOT NULL CHECK (provider_cost_class IN ('free_pool', 'paid')),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  total_tokens integer CHECK (total_tokens IS NULL OR total_tokens >= 0),
  estimated_cost_usd numeric(12, 8) CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0),
  credit_cost integer NOT NULL CHECK (credit_cost IN (3, 24)),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_extension_model_usage_margin
  ON public.extension_model_usage(created_at DESC, provider_cost_class);
ALTER TABLE public.extension_model_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cleanup_extension_v1_records()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.extension_oauth_codes
    WHERE expires_at < now() - interval '1 day';
  DELETE FROM public.extension_sessions
    WHERE refresh_expires_at < now() - interval '31 days'
       OR revoked_at < now() - interval '31 days';
  DELETE FROM public.extension_anonymous_actions
    WHERE created_at < now() - interval '180 days'
       OR (status = 'failed' AND created_at < now() - interval '31 days');
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_extension_v1_records() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_extension_v1_records() TO service_role;
