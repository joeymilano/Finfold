-- ============================================================
-- Migration 011: Reconcile profiles table drift
--
-- schema.sql and 001_initial_schema.sql both define `profiles` with
-- `CREATE TABLE IF NOT EXISTS`, so whichever ran first on a given
-- Supabase project silently "won" and the other's extra columns/
-- constraints were never applied. schema.sql's version has
-- monthly_limit + a plan CHECK constraint that 001's version lacks;
-- if 001 ran first, every paid-plan lookup in app/api/generate and
-- app/api/entitlements/check silently falls back to the free tier
-- default because monthly_limit doesn't exist.
--
-- This migration is safe to run regardless of which one applied —
-- everything is additive and IF NOT EXISTS / guarded.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_limit integer NOT NULL DEFAULT 3;

ALTER TABLE public.profiles
  ALTER COLUMN plan SET NOT NULL;

ALTER TABLE public.profiles
  ALTER COLUMN plan SET DEFAULT 'free';

-- Add the plan CHECK constraint only if it isn't already present under
-- either this name or any other (defensive against re-runs / partial state).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND (
        conname = 'profiles_plan_check'
        OR pg_get_constraintdef(oid) ILIKE '%plan%starter%creator%pro%team%'
      )
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_plan_check
      CHECK (plan IN ('free', 'starter', 'creator', 'pro', 'team'));
  END IF;
END $$;

-- Backfill email for any profile rows created before this column existed.
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;
