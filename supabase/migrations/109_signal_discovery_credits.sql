-- Signal discovery bills the user's plan Credits per call (search / analysis)
-- instead of the retired shared monthly CNY estimate. Lease validation,
-- per-job caps (8 search / 12 analysis), daily caps (24 / 36) and counter
-- increments stay atomic here; the credit charge rides the same transaction so
-- a denied charge never burns quota. Failed provider calls are refunded by the
-- worker through refund_credits (failure must never bill).
--
-- Requires 044_credits_ledger.sql (reserve_credits) — already in production.
-- Idempotent: drops the old numeric-budget overload, recreates the new one.

DROP FUNCTION IF EXISTS public.reserve_signal_discovery_call(uuid, uuid, text, numeric, numeric);

CREATE FUNCTION public.reserve_signal_discovery_call(p_job_id uuid, p_lease_token uuid, p_kind text,
  p_action text, p_amount integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j signal_discovery_jobs%ROWTYPE; u signal_discovery_daily_usage%ROWTYPE;
  d date := (now() AT TIME ZONE 'Asia/Shanghai')::date; v_remaining integer;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('search','analysis') OR p_action IS NULL
    OR p_amount IS NULL OR p_amount <= 0 THEN RETURN false; END IF;
  SELECT * INTO j FROM signal_discovery_jobs WHERE id=p_job_id AND lease_token=p_lease_token
    AND status='running' AND lease_until>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF (p_kind='search' AND j.search_calls>=8) OR (p_kind='analysis' AND j.analysis_calls>=12) THEN RETURN false; END IF;
  INSERT INTO signal_discovery_daily_usage(user_id,usage_day) VALUES(j.user_id,d) ON CONFLICT DO NOTHING;
  SELECT * INTO u FROM signal_discovery_daily_usage WHERE user_id=j.user_id AND usage_day=d FOR UPDATE;
  IF (p_kind='search' AND u.search_calls>=24) OR (p_kind='analysis' AND u.analysis_calls>=36) THEN RETURN false; END IF;
  -- Charge the user's Credits first: an empty balance must not consume quota.
  SELECT reserve_credits(j.user_id, p_amount, p_action, 'agent',
    jsonb_build_object('jobId', j.id, 'kind', p_kind)) INTO v_remaining;
  IF v_remaining IS NULL OR v_remaining < 0 THEN RETURN false; END IF;
  UPDATE signal_discovery_daily_usage SET search_calls=search_calls+CASE WHEN p_kind='search' THEN 1 ELSE 0 END,
    analysis_calls=analysis_calls+CASE WHEN p_kind='analysis' THEN 1 ELSE 0 END WHERE user_id=j.user_id AND usage_day=d;
  UPDATE signal_discovery_jobs SET search_calls=search_calls+CASE WHEN p_kind='search' THEN 1 ELSE 0 END,
    analysis_calls=analysis_calls+CASE WHEN p_kind='analysis' THEN 1 ELSE 0 END WHERE id=j.id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.reserve_signal_discovery_call(uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_signal_discovery_call(uuid, uuid, text, text, integer) TO service_role;
