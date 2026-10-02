-- ============================================================
-- Migration 017: Update profiles.plan CHECK constraint for new plan tiers
--
-- Migration 011 added a CHECK constraint restricting profiles.plan to the
-- old ('free','starter','creator','pro','team') set. The pricing model
-- moved to ('free','starter','pro','growth','employee') — 'creator' and
-- 'team' are gone, 'growth' and 'employee' are new. Without this migration,
-- every checkout/webhook write of a 'growth' or 'employee' plan would be
-- rejected at the database level with a CHECK violation.
--
-- Also introduces a "founding_member" flag: the first 10 Digital Employee
-- customers lock in ¥999/mo for life (vs. the standard ¥1,999) as an M1
-- cash-flow / early-feedback presale (see plan roadmap W2/W4).
-- ============================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'growth', 'employee'));

-- Best-effort migration of any existing rows still on the retired plan ids.
-- 'creator' and 'pro' overlapped in seat count with the new 'pro' tier
-- closely enough to map directly; 'team' has no direct successor yet, so it
-- downgrades to 'growth' (closest kit allowance) rather than silently
-- losing paid status. Re-evaluate case-by-case if this ever fires for real
-- customers — there should be none yet since the product is pre-launch.
UPDATE public.profiles SET plan = 'pro' WHERE plan = 'creator';
UPDATE public.profiles SET plan = 'growth' WHERE plan = 'team';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS founding_member boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS founding_member_locked_price integer;
