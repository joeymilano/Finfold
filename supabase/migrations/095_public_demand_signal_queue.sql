-- 095: Durable, human-reviewed public demand signals.
--
-- A public post is research evidence, never a lead. Finfold stores only the
-- public content needed to revisit the evidence and deliberately excludes
-- author handles, contact details, inferred identity and outreach state.

CREATE TABLE IF NOT EXISTS public.public_demand_signals (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operating_program_id  uuid,
  source                text        NOT NULL,
  source_item_id        text        NOT NULL,
  title                 text        NOT NULL,
  excerpt               text        NOT NULL DEFAULT '',
  discussion_url        text        NOT NULL,
  external_url          text,
  score                  integer,
  comments               integer,
  published_at           timestamptz,
  matched_keywords       jsonb       NOT NULL DEFAULT '[]',
  status                 text        NOT NULL DEFAULT 'new',
  first_seen_at          timestamptz NOT NULL,
  last_seen_at           timestamptz NOT NULL,
  reviewed_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_demand_signals_program_user_fk
    FOREIGN KEY (operating_program_id, user_id)
    REFERENCES public.operating_programs(id, user_id)
    ON DELETE SET NULL (operating_program_id),
  CONSTRAINT public_demand_signals_source_check
    CHECK (source IN ('hacker-news')),
  CONSTRAINT public_demand_signals_source_item_check
    CHECK (source_item_id ~ '^[1-9][0-9]{0,19}$'),
  CONSTRAINT public_demand_signals_title_check
    CHECK (char_length(title) BETWEEN 1 AND 600),
  CONSTRAINT public_demand_signals_excerpt_check
    CHECK (char_length(excerpt) <= 500),
  CONSTRAINT public_demand_signals_discussion_url_check
    CHECK (discussion_url ~ '^https://news[.]ycombinator[.]com/item[?]id=[1-9][0-9]{0,19}$'),
  CONSTRAINT public_demand_signals_external_url_check
    CHECK (external_url IS NULL OR external_url ~ '^https?://'),
  CONSTRAINT public_demand_signals_metrics_check
    CHECK ((score IS NULL OR score >= 0) AND (comments IS NULL OR comments >= 0)),
  CONSTRAINT public_demand_signals_keywords_array_check
    CHECK (jsonb_typeof(matched_keywords) = 'array'),
  CONSTRAINT public_demand_signals_status_check
    CHECK (status IN ('new', 'kept', 'dismissed')),
  CONSTRAINT public_demand_signals_review_check
    CHECK (
      (status = 'new' AND reviewed_at IS NULL)
      OR
      (status IN ('kept', 'dismissed') AND reviewed_at IS NOT NULL)
    ),
  CONSTRAINT public_demand_signals_seen_order_check
    CHECK (first_seen_at <= last_seen_at),
  CONSTRAINT public_demand_signals_source_item_unique
    UNIQUE (user_id, source, source_item_id)
);

CREATE INDEX IF NOT EXISTS public_demand_signals_user_status_seen_idx
  ON public.public_demand_signals(user_id, status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS public_demand_signals_program_seen_idx
  ON public.public_demand_signals(operating_program_id, last_seen_at DESC)
  WHERE operating_program_id IS NOT NULL;

ALTER TABLE public.public_demand_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public demand signals: select own" ON public.public_demand_signals;
CREATE POLICY "public demand signals: select own"
  ON public.public_demand_signals FOR SELECT
  USING (auth.uid() = user_id);

-- All writes remain service-role only. The authenticated API checks ownership
-- before changing review status; browser clients cannot manufacture evidence.

CREATE OR REPLACE FUNCTION public.ingest_public_demand_signals(
  p_user_id uuid,
  p_operating_program_id uuid,
  p_captured_at timestamptz,
  p_signals jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_affected integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_captured_at IS NULL THEN
    RAISE EXCEPTION 'Demand signal owner and capture time are required.';
  END IF;
  IF jsonb_typeof(p_signals) <> 'array' OR jsonb_array_length(p_signals) > 20 THEN
    RAISE EXCEPTION 'Demand signal batch must be an array of at most 20 items.';
  END IF;
  IF p_operating_program_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.operating_programs
    WHERE id = p_operating_program_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Operating program does not belong to this user.';
  END IF;

  INSERT INTO public.public_demand_signals (
    user_id,
    operating_program_id,
    source,
    source_item_id,
    title,
    excerpt,
    discussion_url,
    external_url,
    score,
    comments,
    published_at,
    matched_keywords,
    first_seen_at,
    last_seen_at,
    updated_at
  )
  SELECT
    p_user_id,
    p_operating_program_id,
    'hacker-news',
    signal.source_item_id,
    signal.title,
    COALESCE(signal.excerpt, ''),
    signal.discussion_url,
    signal.external_url,
    signal.score,
    signal.comments,
    signal.published_at,
    COALESCE(signal.matched_keywords, '[]'::jsonb),
    p_captured_at,
    p_captured_at,
    p_captured_at
  FROM jsonb_to_recordset(p_signals) AS signal(
    source_item_id text,
    title text,
    excerpt text,
    discussion_url text,
    external_url text,
    score integer,
    comments integer,
    published_at timestamptz,
    matched_keywords jsonb
  )
  ON CONFLICT (user_id, source, source_item_id) DO UPDATE SET
    operating_program_id = COALESCE(EXCLUDED.operating_program_id, public_demand_signals.operating_program_id),
    title = EXCLUDED.title,
    excerpt = EXCLUDED.excerpt,
    discussion_url = EXCLUDED.discussion_url,
    external_url = EXCLUDED.external_url,
    score = EXCLUDED.score,
    comments = EXCLUDED.comments,
    published_at = EXCLUDED.published_at,
    matched_keywords = EXCLUDED.matched_keywords,
    last_seen_at = EXCLUDED.last_seen_at,
    updated_at = EXCLUDED.updated_at;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_public_demand_signals(uuid, uuid, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ingest_public_demand_signals(uuid, uuid, timestamptz, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.ingest_public_demand_signals(uuid, uuid, timestamptz, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_public_demand_signals(uuid, uuid, timestamptz, jsonb) TO service_role;
