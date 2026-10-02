-- Durable, tenant-scoped discovery. Only the service role owns jobs and budgets.
ALTER TABLE public.trend_signals DROP CONSTRAINT IF EXISTS trend_signals_source_check;
ALTER TABLE public.trend_signals ADD CONSTRAINT trend_signals_source_check
  CHECK (source IN ('google_trends','hacker_news','rss','aihot','social_post','web_search'));

CREATE TABLE public.signal_discovery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_version text NOT NULL,
  window_start timestamptz NOT NULL,
  trigger_kind text NOT NULL CHECK (trigger_kind IN ('manual','scheduled')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','partial','failed','cancelled')),
  state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(state) = 'object'),
  search_calls integer NOT NULL DEFAULT 0 CHECK(search_calls BETWEEN 0 AND 8),
  analysis_calls integer NOT NULL DEFAULT 0 CHECK(analysis_calls BETWEEN 0 AND 12),
  retry_count integer NOT NULL DEFAULT 0,
  lease_token uuid,
  lease_until timestamptz,
  due_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_code text,
  UNIQUE(user_id, profile_version, window_start)
);
CREATE UNIQUE INDEX signal_discovery_one_active ON public.signal_discovery_jobs(user_id)
  WHERE status IN ('queued','running');
CREATE INDEX signal_discovery_due ON public.signal_discovery_jobs(due_at) WHERE status='queued';
CREATE INDEX signal_discovery_user_recent ON public.signal_discovery_jobs(user_id,created_at DESC);
ALTER TABLE public.signal_discovery_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signal_discovery_jobs FROM anon, authenticated;

CREATE TABLE public.signal_discovery_daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_day date NOT NULL,
  search_calls integer NOT NULL DEFAULT 0,
  analysis_calls integer NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,usage_day)
);
ALTER TABLE public.signal_discovery_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signal_discovery_daily_usage FROM anon, authenticated;

CREATE FUNCTION public.claim_signal_discovery_job() RETURNS SETOF public.signal_discovery_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE signal_discovery_jobs SET status=CASE WHEN retry_count>=2 THEN 'failed' ELSE 'queued' END,
    retry_count=retry_count+1, lease_token=NULL, lease_until=NULL, updated_at=now(),
    completed_at=CASE WHEN retry_count>=2 THEN now() ELSE NULL END,
    error_code='lease_expired', due_at=now()+interval '1 minute'
    WHERE status='running' AND lease_until<now();
  SELECT id INTO v_id FROM signal_discovery_jobs WHERE status='queued' AND due_at<=now()
    ORDER BY due_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_id IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE signal_discovery_jobs SET status='running',lease_token=gen_random_uuid(),
    lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=v_id RETURNING *;
END $$;

-- Serialize user/day and run limits with the shared monetary reservation.
-- p_reserve_cny is a conservative charge estimate, never a claimed vendor bill.
CREATE FUNCTION public.reserve_signal_discovery_call(p_job_id uuid,p_lease_token uuid,p_kind text,
  p_budget_cny numeric,p_reserve_cny numeric) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j signal_discovery_jobs%ROWTYPE; u signal_discovery_daily_usage%ROWTYPE;
  d date := (now() AT TIME ZONE 'Asia/Shanghai')::date; allowed boolean;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('search','analysis') OR p_budget_cny<=0 OR p_reserve_cny<=0
    OR p_reserve_cny>p_budget_cny OR p_budget_cny IS NULL OR p_reserve_cny IS NULL THEN RETURN false; END IF;
  SELECT * INTO j FROM signal_discovery_jobs WHERE id=p_job_id AND lease_token=p_lease_token
    AND status='running' AND lease_until>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF (p_kind='search' AND j.search_calls>=8) OR (p_kind='analysis' AND j.analysis_calls>=12) THEN RETURN false; END IF;
  INSERT INTO signal_discovery_daily_usage(user_id,usage_day) VALUES(j.user_id,d) ON CONFLICT DO NOTHING;
  SELECT * INTO u FROM signal_discovery_daily_usage WHERE user_id=j.user_id AND usage_day=d FOR UPDATE;
  IF (p_kind='search' AND u.search_calls>=24) OR (p_kind='analysis' AND u.analysis_calls>=36) THEN RETURN false; END IF;
  SELECT b.allowed INTO allowed FROM consume_llm_monthly_budget('signal-discovery',to_char(d,'YYYY-MM'),p_reserve_cny,p_budget_cny) b;
  IF NOT COALESCE(allowed,false) THEN RETURN false; END IF;
  UPDATE signal_discovery_daily_usage SET search_calls=search_calls+CASE WHEN p_kind='search' THEN 1 ELSE 0 END,
    analysis_calls=analysis_calls+CASE WHEN p_kind='analysis' THEN 1 ELSE 0 END WHERE user_id=j.user_id AND usage_day=d;
  UPDATE signal_discovery_jobs SET search_calls=search_calls+CASE WHEN p_kind='search' THEN 1 ELSE 0 END,
    analysis_calls=analysis_calls+CASE WHEN p_kind='analysis' THEN 1 ELSE 0 END WHERE id=j.id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.claim_signal_discovery_job() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reserve_signal_discovery_call(uuid,uuid,text,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_signal_discovery_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_signal_discovery_call(uuid,uuid,text,numeric,numeric) TO service_role;

-- Rotate across programs using last attempted scheduling time, including accounts
-- whose plan no longer allows monitoring, so an ineligible account cannot starve others.
CREATE TABLE public.signal_discovery_schedule (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.signal_discovery_schedule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signal_discovery_schedule FROM anon, authenticated;
CREATE FUNCTION public.due_signal_discovery_users() RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY WITH candidates AS (
    SELECT DISTINCT p.user_id FROM operating_programs p
    LEFT JOIN signal_discovery_schedule s ON s.user_id=p.user_id
    WHERE p.status='active' AND (s.checked_at IS NULL OR s.checked_at<now()-interval '8 hours')
    ORDER BY p.user_id LIMIT 5
  ), scheduled AS (
    INSERT INTO signal_discovery_schedule(user_id,checked_at) SELECT c.user_id,now() FROM candidates c
    ON CONFLICT ON CONSTRAINT signal_discovery_schedule_pkey DO UPDATE SET checked_at=now()
      WHERE signal_discovery_schedule.checked_at<now()-interval '8 hours'
    RETURNING signal_discovery_schedule.user_id
  ) SELECT scheduled.user_id FROM scheduled;
END $$;
REVOKE ALL ON FUNCTION public.due_signal_discovery_users() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.due_signal_discovery_users() TO service_role;

-- Demand queue is a projection of assessed discovery evidence, not another crawler.
ALTER TABLE public.public_demand_signals DROP CONSTRAINT public_demand_signals_source_check;
ALTER TABLE public.public_demand_signals ADD CONSTRAINT public_demand_signals_source_check
  CHECK(source IN ('hacker-news','business-discovery'));
ALTER TABLE public.public_demand_signals DROP CONSTRAINT public_demand_signals_source_item_check;
ALTER TABLE public.public_demand_signals ADD CONSTRAINT public_demand_signals_source_item_check
  CHECK((source='hacker-news' AND source_item_id ~ '^[1-9][0-9]{0,19}$') OR (source='business-discovery' AND source_item_id ~ '^[a-f0-9-]{36}$'));
ALTER TABLE public.public_demand_signals DROP CONSTRAINT public_demand_signals_discussion_url_check;
ALTER TABLE public.public_demand_signals ADD CONSTRAINT public_demand_signals_discussion_url_check
  CHECK((source='hacker-news' AND discussion_url ~ '^https://news[.]ycombinator[.]com/item[?]id=[1-9][0-9]{0,19}$') OR
    (source='business-discovery' AND discussion_url ~ '^https://[^[:space:]]+$'));

-- Keep a user's dismissal consistent across both projections, including re-ingest.
CREATE FUNCTION public.sync_discovery_demand_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.source='business-discovery' THEN
    IF EXISTS(SELECT 1 FROM topic_opportunities WHERE id::text=NEW.source_item_id AND user_id=NEW.user_id
      AND (state='dismissed' OR feedback IN ('not_relevant','brand_mismatch'))) THEN
      NEW.status:='dismissed'; NEW.reviewed_at:=COALESCE(NEW.reviewed_at,now());
    END IF;
    IF NEW.status='dismissed' THEN
      UPDATE topic_opportunities SET state='dismissed',feedback='not_relevant',feedback_at=NEW.reviewed_at,updated_at=now()
        WHERE id::text=NEW.source_item_id AND user_id=NEW.user_id AND state<>'dismissed';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER discovery_demand_review BEFORE INSERT OR UPDATE ON public.public_demand_signals
FOR EACH ROW EXECUTE FUNCTION public.sync_discovery_demand_review();

CREATE FUNCTION public.sync_discovery_opportunity_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.state='dismissed' OR NEW.feedback IN ('not_relevant','brand_mismatch') THEN
    UPDATE public_demand_signals SET status='dismissed',reviewed_at=COALESCE(NEW.feedback_at,now()),updated_at=now()
      WHERE user_id=NEW.user_id AND source='business-discovery' AND source_item_id=NEW.id::text AND status<>'dismissed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER discovery_opportunity_review AFTER UPDATE OF state,feedback ON public.topic_opportunities
FOR EACH ROW EXECUTE FUNCTION public.sync_discovery_opportunity_review();
REVOKE ALL ON FUNCTION public.sync_discovery_demand_review() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_discovery_opportunity_review() FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.signal_discovery_jobs,public.signal_discovery_daily_usage,public.signal_discovery_schedule TO service_role;
