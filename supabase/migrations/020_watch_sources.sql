-- ============================================================
-- Migration 020: Update-monitoring watch sources (Digital Employee tier)
--
-- Backs the proactiveMonitoring plan feature (employee tier only — see
-- lib/payment/types.ts PLAN_FEATURES): a user configures a changelog/RSS/
-- GitHub-releases URL, a separate Cloudflare Worker polls it on a cron
-- schedule (Cloudflare Pages itself has no cron trigger — see the plan's
-- infra note in §3), and on a new entry calls
-- POST /api/watch-sources/[id]/check to auto-draft a kit for the user to
-- review. This is the primary deliverable that makes the ¥1,999/mo tier
-- earn its "digital employee" name rather than just being a bigger model.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.watch_sources (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  type            text        not null check (type in ('rss', 'changelog', 'github_releases')),
  url             text        not null,
  label           text        not null default '',
  last_seen_hash  text,
  last_checked_at timestamptz,
  enabled         boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS watch_sources_user_id_idx ON public.watch_sources (user_id);
CREATE INDEX IF NOT EXISTS watch_sources_enabled_idx ON public.watch_sources (enabled) WHERE enabled = true;

ALTER TABLE public.watch_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "watch sources: select own" ON public.watch_sources;
CREATE POLICY "watch sources: select own"
  ON public.watch_sources FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "watch sources: insert own" ON public.watch_sources;
CREATE POLICY "watch sources: insert own"
  ON public.watch_sources FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "watch sources: update own" ON public.watch_sources;
CREATE POLICY "watch sources: update own"
  ON public.watch_sources FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "watch sources: delete own" ON public.watch_sources;
CREATE POLICY "watch sources: delete own"
  ON public.watch_sources FOR DELETE
  USING (auth.uid() = user_id);

-- Links an auto-drafted kit back to the watch source that triggered it, so
-- the UI can show "drafted from your changelog update" instead of the kit
-- looking like it appeared out of nowhere.
CREATE TABLE IF NOT EXISTS public.drafted_kits (
  id              uuid        primary key default gen_random_uuid(),
  watch_source_id uuid        not null references public.watch_sources(id) on delete cascade,
  kit_id          uuid        not null references public.content_kits(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  source_entry    text        not null default '',
  created_at      timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS drafted_kits_watch_source_id_idx ON public.drafted_kits (watch_source_id);

ALTER TABLE public.drafted_kits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drafted kits: select own" ON public.drafted_kits;
CREATE POLICY "drafted kits: select own"
  ON public.drafted_kits FOR SELECT
  USING (auth.uid() = user_id);
