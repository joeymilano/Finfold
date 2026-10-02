-- ============================================================
-- Migration 057: Lock privileged SECURITY DEFINER RPCs to backend
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. RLS does
-- not protect mutations performed inside SECURITY DEFINER functions, so an
-- authenticated/anonymous PostgREST caller must not be able to invoke credit
-- grants, refunds, quota reservations, activation redemption, or share
-- counters directly with attacker-chosen parameters.
--
-- Every caller in the Finfold codebase already uses the service-role client.
-- This migration makes the database permission boundary match that design.
-- ============================================================

REVOKE ALL ON FUNCTION public.get_available_credits(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_credits(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.grant_plan_credits(
  uuid, integer, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_plan_credits(
  uuid, integer, text, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_credits(
  uuid, integer, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_credits(
  uuid, integer, text, text, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.refund_credits(
  uuid, integer, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credits(
  uuid, integer, text, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.get_credit_spend_summary(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_credit_spend_summary(uuid, timestamptz)
  TO service_role;

REVOKE ALL ON FUNCTION public.grant_purchase_credits(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_purchase_credits(uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.reserve_generation_credit(uuid, date, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_generation_credit(uuid, date, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.release_generation_credit(uuid, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_generation_credit(uuid, date)
  TO service_role;

REVOKE ALL ON FUNCTION public.reserve_trial_generation(
  text, date, text, jsonb, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_trial_generation(
  text, date, text, jsonb, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.redeem_activation_code(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_activation_code(text, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.increment_kit_share_view(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_kit_share_view(text)
  TO service_role;
