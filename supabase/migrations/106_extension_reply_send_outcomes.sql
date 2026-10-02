-- Durable record of what the extension's tiered send actually achieved
-- (sent / typed / copied / failed). The reply result itself lives only in
-- the 24h replay cache; this table is what the rollout readout's rollback
-- rule ("fallback share climbing => tighten") reads. No comment or reply
-- text is stored here — only the request correlation id and the outcome.
CREATE TABLE IF NOT EXISTS public.extension_reply_send_outcomes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('xiaohongshu', 'linkedin')),
  outcome text NOT NULL CHECK (outcome IN ('sent', 'typed', 'copied', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS extension_reply_send_outcomes_time
  ON public.extension_reply_send_outcomes(created_at DESC);
ALTER TABLE public.extension_reply_send_outcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.extension_reply_send_outcomes FROM anon, authenticated;
GRANT ALL ON public.extension_reply_send_outcomes TO service_role;
