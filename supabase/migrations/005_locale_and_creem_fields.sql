-- Migration 005: Add locale and Creem subscription fields to profiles
-- Run in: Supabase Dashboard → SQL Editor → New query → Run

-- Add locale preference to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'zh' CHECK (locale IN ('zh', 'en'));

-- Add Creem subscription fields (referenced in Appendix B of the task doc)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS creem_subscription_id TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS renewed_at TIMESTAMPTZ;

-- Update default monthly_limit from 5 to 3 for new free users
ALTER TABLE public.profiles
  ALTER COLUMN monthly_limit SET DEFAULT 3;
