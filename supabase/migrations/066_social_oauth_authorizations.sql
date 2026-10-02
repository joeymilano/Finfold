-- ============================================================
-- Migration 066: One-time OAuth authorization state for social connectors
--
-- State values are never persisted directly. The browser holds the opaque
-- random state returned to the provider while the database stores only its
-- SHA-256 hash. PKCE verifiers are encrypted because the callback needs the
-- original verifier for code exchange. All functions are service-role only.
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
		'authorization_started'
	));

CREATE TABLE IF NOT EXISTS public.social_oauth_authorizations (
	id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id                 uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	connector_id            text        NOT NULL,
	state_hash              text        NOT NULL UNIQUE,
	encrypted_pkce_verifier text        NOT NULL,
	redirect_uri            text        NOT NULL,
	expires_at              timestamptz NOT NULL,
	consumed_at             timestamptz,
	created_at              timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT social_oauth_authorizations_connector_check
		CHECK (connector_id IN ('x')),
	CONSTRAINT social_oauth_authorizations_state_hash_check
		CHECK (state_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT social_oauth_authorizations_pkce_encrypted_check
		CHECK (encrypted_pkce_verifier LIKE 'enc:v1:%'),
	CONSTRAINT social_oauth_authorizations_expiry_check
		CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS social_oauth_authorizations_expiry_idx
	ON public.social_oauth_authorizations(expires_at)
	WHERE consumed_at IS NULL;

ALTER TABLE public.social_oauth_authorizations ENABLE ROW LEVEL SECURITY;
-- No client policies. This table contains a PKCE verifier encrypted at rest.

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
		 OR p_connector_id <> 'x'
		 OR p_state_hash !~ '^[0-9a-f]{64}$'
		 OR p_encrypted_pkce_verifier NOT LIKE 'enc:v1:%'
		 OR p_redirect_uri !~ '^https?://[^/]+' THEN
		RAISE EXCEPTION 'invalid_social_oauth_authorization';
	END IF;

	-- A fresh authorization invalidates any prior callback state for this
	-- connector, so at most one browser tab can complete the flow.
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

CREATE OR REPLACE FUNCTION public.consume_social_oauth_authorization(
	p_state_hash text
) RETURNS TABLE (
	user_id uuid,
	connector_id text,
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
	UPDATE public.social_oauth_authorizations
	SET consumed_at = now()
	WHERE state_hash = p_state_hash
		AND consumed_at IS NULL
		AND expires_at > now()
	RETURNING
		social_oauth_authorizations.user_id,
		social_oauth_authorizations.connector_id,
		social_oauth_authorizations.encrypted_pkce_verifier,
		social_oauth_authorizations.redirect_uri;
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
		 OR p_connector_id <> 'x'
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

REVOKE ALL ON FUNCTION public.create_social_oauth_authorization(uuid, text, text, text, text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_social_oauth_authorization(uuid, text, text, text, text)
	TO service_role;

REVOKE ALL ON FUNCTION public.consume_social_oauth_authorization(text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_social_oauth_authorization(text)
	TO service_role;

REVOKE ALL ON FUNCTION public.complete_social_oauth_connection(
	uuid, text, text, text, timestamptz, text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_social_oauth_connection(
	uuid, text, text, text, timestamptz, text[]
) TO service_role;
