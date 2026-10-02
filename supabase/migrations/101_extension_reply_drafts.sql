-- Short-lived, user-scoped replay cache. Source comments are never stored here.
CREATE TABLE IF NOT EXISTS public.extension_reply_results (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  PRIMARY KEY (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS extension_reply_results_expiry ON public.extension_reply_results(expires_at);
ALTER TABLE public.extension_reply_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.extension_reply_results FROM anon, authenticated;
GRANT ALL ON public.extension_reply_results TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_extension_v1_records()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.extension_reply_results WHERE expires_at <= now();
  DELETE FROM public.extension_oauth_codes WHERE expires_at < now() - interval '1 day';
  DELETE FROM public.extension_sessions
    WHERE refresh_expires_at < now() - interval '31 days' OR revoked_at < now() - interval '31 days';
  DELETE FROM public.extension_anonymous_actions
    WHERE created_at < now() - interval '180 days' OR (status = 'failed' AND created_at < now() - interval '31 days');
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_extension_v1_records() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_extension_v1_records() TO service_role;
