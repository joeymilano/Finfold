-- ============================================================
-- Migration 112: Lead tools (获客搭子)
--
-- Backs /t/[slug] — an owner-branded interactive self-assessment
-- (five questions -> banded result with a personalized action
-- checklist + the owner's own consultation entry). The tool page is
-- the marketing asset the owner distributes to THEIR customers;
-- Finfold only keeps a light, closable footer credit.
--
-- Security model copies migration 018 (kit_shares): anonymous
-- visitors never get a Postgres session. The public page reads via
-- the service-role admin client, and the ONLY anonymous-write path
-- is the increment_lead_tool_event SECURITY DEFINER RPC below,
-- which records aggregate counters per day — never individual
-- visitor answers. Visitors are never Finfold users, and the tool
-- owner's leads never become Finfold marketing contacts.
--
-- Draft/publish separation: `spec` is the editable draft;
-- `published_spec` is the snapshot pinned when the owner explicitly
-- publishes. Editing a draft never changes the live page until the
-- owner publishes again. paused/archived immediately removes the
-- public page (the runtime only serves status = 'published').
--
-- latest_version_id intentionally has NO foreign key: versions
-- reference lead_tools, so an FK back would be circular. Rows are
-- cleaned up by lead_tool_versions' own ON DELETE CASCADE.
--
-- Rollback: fully additive — drop the four tables and the one
-- function to revert. No existing table is touched.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lead_tools (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  slug              text        not null unique,
  title             text        not null,
  business_context  text        not null default '',
  spec              jsonb       not null,
  published_spec    jsonb,
  status            text        not null default 'draft'
                    check (status in ('draft', 'published', 'paused', 'archived')),
  latest_version_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS lead_tools_user_idx ON public.lead_tools (user_id, updated_at desc);

CREATE TABLE IF NOT EXISTS public.lead_tool_versions (
  id         uuid        primary key default gen_random_uuid(),
  tool_id    uuid        not null references public.lead_tools(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  version    integer     not null check (version >= 1),
  spec       jsonb       not null,
  note       text        not null default '',
  created_at timestamptz not null default now(),
  unique (tool_id, version)
);

CREATE INDEX IF NOT EXISTS lead_tool_versions_tool_idx ON public.lead_tool_versions (tool_id, version desc);

-- Aggregate-only visitor counters. One row per tool per day; the
-- result_counts jsonb holds {"<result_id>": n} so the owner sees
-- which outcome visitors land on without any individual answer
-- being stored.
CREATE TABLE IF NOT EXISTS public.lead_tool_event_daily (
  tool_id      uuid    not null references public.lead_tools(id) on delete cascade,
  day          date    not null,
  opens        integer not null default 0 check (opens >= 0),
  completions  integer not null default 0 check (completions >= 0),
  cta_clicks   integer not null default 0 check (cta_clicks >= 0),
  result_counts jsonb  not null default '{}'::jsonb,
  primary key (tool_id, day)
);

-- Owner-confirmed consultation outcomes. Three honest stages:
-- clicked (entry was clicked), left_need (a real need was left),
-- won (actual deal). Never inferred — always manually recorded.
CREATE TABLE IF NOT EXISTS public.lead_tool_outcomes (
  id          uuid        primary key default gen_random_uuid(),
  tool_id     uuid        not null references public.lead_tools(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  occurred_on date        not null,
  stage       text        not null check (stage in ('clicked', 'left_need', 'won')),
  note        text        not null default '',
  created_at  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS lead_tool_outcomes_tool_idx ON public.lead_tool_outcomes (tool_id, occurred_on desc);

ALTER TABLE public.lead_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tool_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tool_event_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tool_outcomes ENABLE ROW LEVEL SECURITY;

-- Owners manage their own rows in all four tables. Event counters
-- are written only through the RPC below, so no owner INSERT/UPDATE
-- policy is granted on lead_tool_event_daily beyond SELECT.
DROP POLICY IF EXISTS "lead tools: select own" ON public.lead_tools;
CREATE POLICY "lead tools: select own"
  ON public.lead_tools FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "lead tools: insert own" ON public.lead_tools;
CREATE POLICY "lead tools: insert own"
  ON public.lead_tools FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "lead tools: update own" ON public.lead_tools;
CREATE POLICY "lead tools: update own"
  ON public.lead_tools FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "lead tools: delete own" ON public.lead_tools;
CREATE POLICY "lead tools: delete own"
  ON public.lead_tools FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "lead tool versions: select own" ON public.lead_tool_versions;
CREATE POLICY "lead tool versions: select own"
  ON public.lead_tool_versions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "lead tool versions: insert own" ON public.lead_tool_versions;
CREATE POLICY "lead tool versions: insert own"
  ON public.lead_tool_versions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "lead tool versions: delete own" ON public.lead_tool_versions;
CREATE POLICY "lead tool versions: delete own"
  ON public.lead_tool_versions FOR DELETE
  USING (auth.uid() = user_id);

-- lead_tool_event_daily deliberately has NO policy at all: owner stats are
-- read server-side through the service-role client (lib/lead-tools/service
-- loadLeadToolStats), so RLS with zero policies keeps the table fully
-- locked to service role. There is no user_id column on this table —
-- counters belong to the tool, never to a visitor.

DROP POLICY IF EXISTS "lead tool outcomes: select own" ON public.lead_tool_outcomes;
CREATE POLICY "lead tool outcomes: select own"
  ON public.lead_tool_outcomes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "lead tool outcomes: insert own" ON public.lead_tool_outcomes;
CREATE POLICY "lead tool outcomes: insert own"
  ON public.lead_tool_outcomes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "lead tool outcomes: delete own" ON public.lead_tool_outcomes;
CREATE POLICY "lead tool outcomes: delete own"
  ON public.lead_tool_outcomes FOR DELETE
  USING (auth.uid() = user_id);

-- No anon/authenticated policy exists on any of these tables: the
-- public /t/[slug] route resolves slugs with the service-role client
-- server-side (migration 018 precedent), so anonymous visitors never
-- hold a session that could enumerate other users' tools.

-- Atomically records one aggregate visitor event for a PUBLISHED
-- tool. SECURITY DEFINER so the anonymous-facing routes can bump
-- counters through the admin client without any public UPDATE
-- policy. Unknown events and unpublished slugs are silently ignored
-- (the public surface must not leak tool state). Fully qualified
-- names + empty search_path per migration 107 conventions.
CREATE OR REPLACE FUNCTION public.increment_lead_tool_event(
  p_slug text,
  p_event text,
  p_result_id text default null,
  p_entry_id text default null
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tool_id uuid;
  v_result_key text;
BEGIN
  SELECT id INTO v_tool_id
  FROM public.lead_tools
  WHERE slug = p_slug AND status = 'published';

  IF v_tool_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.lead_tool_event_daily (tool_id, day, opens, completions, cta_clicks, result_counts)
  VALUES (v_tool_id, CURRENT_DATE, 0, 0, 0, '{}'::jsonb)
  ON CONFLICT (tool_id, day) DO NOTHING;

  IF p_event = 'open' THEN
    UPDATE public.lead_tool_event_daily
    SET opens = opens + 1
    WHERE tool_id = v_tool_id AND day = CURRENT_DATE;

  ELSIF p_event = 'complete' THEN
    v_result_key := COALESCE(NULLIF(btrim(p_result_id), ''), '_unknown');
    UPDATE public.lead_tool_event_daily
    SET completions = completions + 1,
        result_counts = jsonb_set(
          result_counts,
          ARRAY[v_result_key],
          to_jsonb(COALESCE((result_counts ->> v_result_key)::integer, 0) + 1)
        )
    WHERE tool_id = v_tool_id AND day = CURRENT_DATE;

  ELSIF p_event = 'cta_click' THEN
    UPDATE public.lead_tool_event_daily
    SET cta_clicks = cta_clicks + 1
    WHERE tool_id = v_tool_id AND day = CURRENT_DATE;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_lead_tool_event(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_lead_tool_event(text, text, text, text) TO service_role;
