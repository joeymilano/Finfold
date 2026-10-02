-- ============================================================
-- Migration 012: Re-establish the correct handle_new_user() trigger
--
-- schema.sql and 001_initial_schema.sql each define public.handle_new_user()
-- with CREATE OR REPLACE FUNCTION. Whichever ran LAST wins for the function
-- body (unlike the table itself, which uses IF NOT EXISTS so whichever ran
-- FIRST wins). Per the README setup order (schema.sql, then migrations in
-- order), 001's version currently wins in practice — and it inserts
-- (id, plan, locale) only, dropping the email backfill and the
-- `set search_path = public` hardening that schema.sql's version had.
--
-- This migration makes the complete version authoritative regardless of
-- what ran before it, since it is the highest-numbered migration touching
-- this function.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
