-- ============================================================
-- Migration 009: Persist iteration reports (previously in-memory only)
-- Run after 008.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.iteration_reports (
  id           uuid        primary key default gen_random_uuid(),
  kit_id       uuid        not null references public.content_kits(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  summary      text        not null default '',
  wins         text[]      not null default '{}',
  problems     text[]      not null default '{}',
  next_actions text[]      not null default '{}',
  created_at   timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_iteration_reports_kit_id
  ON public.iteration_reports(kit_id);
CREATE INDEX IF NOT EXISTS idx_iteration_reports_user_created
  ON public.iteration_reports(user_id, created_at desc);

ALTER TABLE public.iteration_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "iteration reports: select own" ON public.iteration_reports;
CREATE POLICY "iteration reports: select own"
  ON public.iteration_reports FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "iteration reports: insert own" ON public.iteration_reports;
CREATE POLICY "iteration reports: insert own"
  ON public.iteration_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);
