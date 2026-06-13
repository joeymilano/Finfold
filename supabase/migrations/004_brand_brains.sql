-- ============================================================
-- Migration 004: Account-level Brand Brain
-- Run after 003.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.brand_brains (
  user_id                uuid        primary key references auth.users(id) on delete cascade,
  brand_name             text        not null default '',
  product_description    text        not null default '',
  target_audience        text        not null default '',
  tone_keywords          text[]      not null default '{}',
  banned_phrases         text[]      not null default '{}',
  approved_examples      text[]      not null default '{}',
  competitors            text[]      not null default '{}',
  positioning_statement  text        not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

ALTER TABLE public.brand_brains enable row level security;

CREATE POLICY "brand brains: select own"
  ON public.brand_brains FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "brand brains: insert own"
  ON public.brand_brains FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "brand brains: update own"
  ON public.brand_brains FOR UPDATE
  USING (auth.uid() = user_id);
