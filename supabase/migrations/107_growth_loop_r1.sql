-- 107: Growth loop R1 — goals, learnings, variant tracking, publication evidence,
-- and the first-party activation outcome.
--
-- Extends the existing mission spine (growth_missions + mission_actions +
-- tracking_links + outcome_events) instead of building a parallel system:
--   * growth_loop_goals: the durable Goal layer (metric + definition version +
--     window + single channel) that groups per-round experiments.
--   * growth_learnings: candidate → accepted/rejected/revoked learnings with
--     evidence references; the planner injects only accepted ones and must
--     report used ids back into the mission plan.
--   * Variant-level tracking links: the 081 UNIQUE(mission_id) constraint
--     allowed one opaque token per mission; the loop needs one per variant.
--   * Publication evidence: execution_mode + evidence_level on mission_actions.
--     A user-submitted link can only ever be 'user_reported'; nothing in this
--     migration can promote it to 'provider_verified'.
--   * Activation outcome: "signed up AND first saved a generated kit to the
--     content library", deduplicated per subject, reusing the frozen signup
--     attribution from migration 091.
-- Rollback: fully additive. Turning the feature flag off stops new writes;
-- no existing table, constraint path, or RPC behavior for other mission kinds
-- changes.

-- ============ A. outcome_events: allow the 'activation' type ============

ALTER TABLE public.outcome_events DROP CONSTRAINT IF EXISTS outcome_events_type_check;
ALTER TABLE public.outcome_events ADD CONSTRAINT outcome_events_type_check
  CHECK (event_type IN ('view', 'click', 'lead', 'signup', 'trial', 'purchase', 'revenue', 'activation'));

-- ============ B. growth_loop_goals ============

CREATE TABLE IF NOT EXISTS public.growth_loop_goals (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                    text        NOT NULL,
  objective_type           text        NOT NULL,
  metric_definition        jsonb       NOT NULL DEFAULT '{}',
  metric_definition_version text       NOT NULL DEFAULT 'activation-v1',
  landing_url              text        NOT NULL,
  channel_platform         text        NOT NULL,
  target_value             numeric     NOT NULL,
  start_at                 timestamptz NOT NULL DEFAULT now(),
  end_at                   timestamptz NOT NULL,
  timezone                 text        NOT NULL DEFAULT 'Asia/Shanghai',
  status                   text        NOT NULL DEFAULT 'active',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT growth_loop_goals_objective_check
    CHECK (objective_type = 'qualified_activations'),
  CONSTRAINT growth_loop_goals_channel_check
    CHECK (channel_platform = 'xiaohongshu'),
  CONSTRAINT growth_loop_goals_target_check
    CHECK (target_value > 0),
  CONSTRAINT growth_loop_goals_window_check
    CHECK (end_at > start_at),
  CONSTRAINT growth_loop_goals_status_check
    CHECK (status IN ('active', 'paused', 'completed', 'closed')),
  CONSTRAINT growth_loop_goals_title_length_check
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT growth_loop_goals_timezone_check
    CHECK (timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+\-]+)*$'),
  CONSTRAINT growth_loop_goals_metric_version_check
    CHECK (char_length(metric_definition_version) BETWEEN 1 AND 40)
);

CREATE INDEX IF NOT EXISTS growth_loop_goals_user_created_idx
  ON public.growth_loop_goals(user_id, created_at DESC);

ALTER TABLE public.growth_loop_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "growth loop goals: select own" ON public.growth_loop_goals;
CREATE POLICY "growth loop goals: select own" ON public.growth_loop_goals FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth loop goals: insert own" ON public.growth_loop_goals;
CREATE POLICY "growth loop goals: insert own" ON public.growth_loop_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth loop goals: update own" ON public.growth_loop_goals;
CREATE POLICY "growth loop goals: update own" ON public.growth_loop_goals FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth loop goals: delete own" ON public.growth_loop_goals;
CREATE POLICY "growth loop goals: delete own" ON public.growth_loop_goals FOR DELETE USING (auth.uid() = user_id);

-- ============ C. growth_missions: goal link, plan snapshot, design type ============

ALTER TABLE public.growth_missions ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES public.growth_loop_goals(id) ON DELETE SET NULL;
ALTER TABLE public.growth_missions ADD COLUMN IF NOT EXISTS plan jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.growth_missions ADD COLUMN IF NOT EXISTS design_type text NOT NULL DEFAULT 'exploratory';

ALTER TABLE public.growth_missions DROP CONSTRAINT IF EXISTS growth_missions_design_type_check;
ALTER TABLE public.growth_missions ADD CONSTRAINT growth_missions_design_type_check
  CHECK (design_type IN ('exploratory', 'controlled'));

CREATE INDEX IF NOT EXISTS growth_missions_goal_idx
  ON public.growth_missions(goal_id)
  WHERE goal_id IS NOT NULL;

-- 049 allowed one active mission per (user, platform). Goal-driven loop
-- missions run their own cadence, so the legacy guarantee is scoped to the
-- agent-driven kinds and loop missions get one active mission per goal.
DROP INDEX IF EXISTS public.growth_missions_one_active_platform_idx;
CREATE UNIQUE INDEX growth_missions_one_active_platform_idx
  ON public.growth_missions(user_id, platform)
  WHERE status IN ('accepted', 'draft_ready', 'posted')
    AND mission_kind <> 'growth_loop';
CREATE UNIQUE INDEX growth_missions_one_active_per_goal_idx
  ON public.growth_missions(goal_id)
  WHERE goal_id IS NOT NULL
    AND status IN ('accepted', 'draft_ready', 'posted');

-- ============ D. tracking_links: one opaque token per variant ============

ALTER TABLE public.tracking_links ADD COLUMN IF NOT EXISTS variant_key text NOT NULL DEFAULT '';

ALTER TABLE public.tracking_links DROP CONSTRAINT IF EXISTS tracking_links_mission_unique;
ALTER TABLE public.tracking_links ADD CONSTRAINT tracking_links_mission_variant_unique
  UNIQUE (mission_id, variant_key);

-- Replace (not overload) so every caller, including ones that omit
-- p_variant_key, resolves to the variant-aware version.
DROP FUNCTION IF EXISTS public.upsert_mission_tracking_link(uuid, uuid, text, text, text, text, text, text);
CREATE FUNCTION public.upsert_mission_tracking_link(
  p_user_id uuid,
  p_mission_id uuid,
  p_code text,
  p_destination_url text,
  p_source text,
  p_medium text,
  p_campaign text,
  p_content text DEFAULT NULL,
  p_variant_key text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existed boolean;
  v_now timestamptz := now();
BEGIN
  IF NULLIF(trim(COALESCE(p_variant_key, '')), '') IS NOT NULL AND p_variant_key !~ '^[A-Za-z0-9_-]{1,40}$' THEN
    RAISE EXCEPTION 'Tracking link variant key is invalid.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.growth_missions WHERE id = p_mission_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Growth Mission not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tracking_links WHERE mission_id = p_mission_id AND variant_key = COALESCE(p_variant_key, '')
  ) INTO v_existed;

  INSERT INTO public.tracking_links (
    mission_id, user_id, code, destination_url, source, medium,
    campaign, content, variant_key, status, created_at, updated_at
  ) VALUES (
    p_mission_id, p_user_id, p_code, p_destination_url, p_source, p_medium,
    p_campaign, p_content, COALESCE(p_variant_key, ''), 'active', v_now, v_now
  )
  ON CONFLICT (mission_id, variant_key) DO UPDATE
    SET destination_url = EXCLUDED.destination_url,
        source = EXCLUDED.source,
        medium = EXCLUDED.medium,
        campaign = EXCLUDED.campaign,
        content = EXCLUDED.content,
        status = 'active',
        updated_at = EXCLUDED.updated_at;

  UPDATE public.growth_missions
  SET tracking_enabled = true, updated_at = v_now
  WHERE id = p_mission_id AND user_id = p_user_id;

  INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
  VALUES (
    p_mission_id,
    p_user_id,
    CASE WHEN v_existed THEN 'tracking_link_updated' ELSE 'tracking_enabled' END,
    jsonb_build_object(
      'destinationUrl', p_destination_url,
      'source', p_source,
      'campaign', p_campaign,
      'variantKey', COALESCE(p_variant_key, '')
    ),
    v_now
  );
  RETURN v_existed;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_mission_tracking_link(uuid, uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_mission_tracking_link(uuid, uuid, text, text, text, text, text, text, text) TO service_role;

-- ============ E. mission_actions: execution mode + evidence level + approval pin ============

ALTER TABLE public.mission_actions ADD COLUMN IF NOT EXISTS payload_hash text;
ALTER TABLE public.mission_actions ADD COLUMN IF NOT EXISTS approved_payload_hash text;
ALTER TABLE public.mission_actions ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.mission_actions ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'manual';
ALTER TABLE public.mission_actions ADD COLUMN IF NOT EXISTS evidence_url text;
ALTER TABLE public.mission_actions ADD COLUMN IF NOT EXISTS evidence_level text NOT NULL DEFAULT 'unverified';
ALTER TABLE public.mission_actions ADD COLUMN IF NOT EXISTS evidence_reported_at timestamptz;

ALTER TABLE public.mission_actions DROP CONSTRAINT IF EXISTS mission_actions_execution_mode_check;
ALTER TABLE public.mission_actions ADD CONSTRAINT mission_actions_execution_mode_check
  CHECK (execution_mode IN ('api', 'assisted', 'manual'));

ALTER TABLE public.mission_actions DROP CONSTRAINT IF EXISTS mission_actions_evidence_level_check;
ALTER TABLE public.mission_actions ADD CONSTRAINT mission_actions_evidence_level_check
  CHECK (evidence_level IN ('provider_verified', 'user_reported', 'unverified'));

ALTER TABLE public.mission_actions DROP CONSTRAINT IF EXISTS mission_actions_payload_hash_check;
ALTER TABLE public.mission_actions ADD CONSTRAINT mission_actions_payload_hash_check
  CHECK (payload_hash IS NULL OR payload_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE public.mission_actions DROP CONSTRAINT IF EXISTS mission_actions_approved_hash_check;
ALTER TABLE public.mission_actions ADD CONSTRAINT mission_actions_approved_hash_check
  CHECK (approved_payload_hash IS NULL OR approved_payload_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE public.mission_actions DROP CONSTRAINT IF EXISTS mission_actions_evidence_url_check;
ALTER TABLE public.mission_actions ADD CONSTRAINT mission_actions_evidence_url_check
  CHECK (evidence_url IS NULL OR (
    evidence_url ~ '^https://[^\s]+$' AND char_length(evidence_url) <= 2048
  ));

-- ============ F. growth_learnings ============

CREATE TABLE IF NOT EXISTS public.growth_learnings (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id                uuid        REFERENCES public.growth_loop_goals(id) ON DELETE SET NULL,
  mission_id             uuid        REFERENCES public.growth_missions(id) ON DELETE SET NULL,
  statement              text        NOT NULL,
  applicable_conditions  text        NOT NULL DEFAULT '',
  limitations            text        NOT NULL DEFAULT '',
  evidence               jsonb       NOT NULL DEFAULT '{}',
  status                 text        NOT NULL DEFAULT 'candidate',
  accepted_at            timestamptz,
  revoked_at             timestamptz,
  version                integer     NOT NULL DEFAULT 1,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT growth_learnings_status_check
    CHECK (status IN ('candidate', 'accepted', 'rejected', 'revoked')),
  CONSTRAINT growth_learnings_statement_length_check
    CHECK (char_length(statement) BETWEEN 10 AND 500),
  CONSTRAINT growth_learnings_version_check
    CHECK (version >= 1),
  CONSTRAINT growth_learnings_decision_time_check
    CHECK (
      (status IN ('candidate', 'rejected') AND accepted_at IS NULL AND revoked_at IS NULL)
      OR (status = 'accepted' AND accepted_at IS NOT NULL AND revoked_at IS NULL)
      OR (status = 'revoked' AND accepted_at IS NOT NULL AND revoked_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS growth_learnings_user_status_idx
  ON public.growth_learnings(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS growth_learnings_mission_idx
  ON public.growth_learnings(mission_id)
  WHERE mission_id IS NOT NULL;

ALTER TABLE public.growth_learnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "growth learnings: select own" ON public.growth_learnings;
CREATE POLICY "growth learnings: select own" ON public.growth_learnings FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth learnings: insert own" ON public.growth_learnings;
CREATE POLICY "growth learnings: insert own" ON public.growth_learnings FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth learnings: update own" ON public.growth_learnings;
CREATE POLICY "growth learnings: update own" ON public.growth_learnings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "growth learnings: delete own" ON public.growth_learnings;
CREATE POLICY "growth learnings: delete own" ON public.growth_learnings FOR DELETE USING (auth.uid() = user_id);

-- ============ G. Execution ledger trigger: keep events for loop missions,
--              but leave their action lifecycle to growth-loop routes ============

CREATE OR REPLACE FUNCTION public.sync_growth_mission_execution_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := COALESCE(NEW.updated_at, now());
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Loop missions get variant-scoped prepare actions from the planner,
    -- not the mission-wide studio shortcut.
    IF NEW.mission_kind <> 'growth_loop' THEN
      INSERT INTO public.mission_actions (
        mission_id, user_id, kind, status, risk_level, requires_approval,
        input, provider, idempotency_key, created_at, updated_at
      ) VALUES (
        NEW.id, NEW.user_id, 'prepare_execution_draft', 'awaiting_approval',
        'low', true,
        jsonb_build_object('workbenchIdea', NEW.workbench_idea, 'platform', NEW.platform),
        'finfold_studio', 'prepare-execution-draft:' || NEW.id::text, v_now, v_now
      ) ON CONFLICT (mission_id, idempotency_key) DO NOTHING;
    END IF;

    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      NEW.id,
      NEW.user_id,
      'mission_created',
      jsonb_build_object('missionKind', NEW.mission_kind, 'platform', NEW.platform),
      v_now
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'draft_ready'
     AND NEW.kit_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.kit_id IS DISTINCT FROM NEW.kit_id) THEN
    IF NEW.mission_kind <> 'growth_loop' THEN
      UPDATE public.mission_actions
      SET status = 'succeeded',
          output = jsonb_build_object('kitId', NEW.kit_id),
          completed_at = v_now,
          updated_at = v_now
      WHERE mission_id = NEW.id
        AND user_id = NEW.user_id
        AND kind = 'prepare_execution_draft'
        AND status IN ('queued', 'running', 'awaiting_approval');

      INSERT INTO public.mission_actions (
        mission_id, user_id, kind, status, risk_level, requires_approval,
        input, provider, idempotency_key, created_at, updated_at
      ) VALUES (
        NEW.id, NEW.user_id, 'review_and_publish', 'awaiting_approval',
        'medium', true, jsonb_build_object('kitId', NEW.kit_id),
        'manual_channel', 'review-and-publish:' || NEW.id::text, v_now, v_now
      )
      ON CONFLICT (mission_id, idempotency_key) DO UPDATE
        SET input = EXCLUDED.input,
            status = CASE
              WHEN public.mission_actions.status IN ('failed', 'cancelled') THEN 'awaiting_approval'
              ELSE public.mission_actions.status
            END,
            updated_at = EXCLUDED.updated_at;
    END IF;

    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (NEW.id, NEW.user_id, 'draft_ready', jsonb_build_object('kitId', NEW.kit_id), v_now);
  END IF;

  IF NEW.status = 'posted' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.mission_kind <> 'growth_loop' THEN
      UPDATE public.mission_actions
      SET status = 'succeeded',
          output = jsonb_build_object('platform', NEW.platform, 'publication', 'confirmed_by_user'),
          completed_at = v_now,
          updated_at = v_now
      WHERE mission_id = NEW.id
        AND user_id = NEW.user_id
        AND kind = 'review_and_publish'
        AND status IN ('awaiting_approval', 'running');
    END IF;

    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      NEW.id,
      NEW.user_id,
      'distribution_confirmed',
      jsonb_build_object('platform', NEW.platform, 'source', 'user_confirmation'),
      v_now
    );
  END IF;

  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      NEW.id,
      NEW.user_id,
      'mission_completed',
      jsonb_build_object(
        'metric', NEW.primary_metric_key,
        'actualValue', NEW.outcome -> 'actualValue',
        'targetValue', NEW.target_value,
        'verdict', NEW.verdict
      ),
      v_now
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS growth_mission_execution_ledger ON public.growth_missions;
CREATE TRIGGER growth_mission_execution_ledger
  AFTER INSERT OR UPDATE OF status, kit_id ON public.growth_missions
  FOR EACH ROW EXECUTE FUNCTION public.sync_growth_mission_execution_ledger();

-- ============ H. Approvals pin the exact payload hash ============

DROP FUNCTION IF EXISTS public.apply_mission_action_decision(uuid, uuid, uuid, text, text, text);
CREATE FUNCTION public.apply_mission_action_decision(
  p_user_id uuid,
  p_mission_id uuid,
  p_action_id uuid,
  p_decision text,
  p_workbench_href text DEFAULT NULL,
  p_execution_state text DEFAULT NULL,
  p_payload_hash text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action public.mission_actions%ROWTYPE;
  v_goal_status text;
  v_now timestamptz := now();
BEGIN
  IF p_decision NOT IN ('approve', 'cancel') THEN
    RAISE EXCEPTION 'Invalid mission decision.' USING ERRCODE = '22023';
  END IF;
  IF p_payload_hash IS NOT NULL AND p_payload_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Payload hash is invalid.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_action
  FROM public.mission_actions
  WHERE id = p_action_id AND mission_id = p_mission_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission action not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_action.status <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'This action is no longer waiting for approval.' USING ERRCODE = 'P0001';
  END IF;

  IF p_decision = 'cancel' THEN
    UPDATE public.mission_actions
    SET status = 'cancelled', completed_at = v_now, updated_at = v_now
    WHERE id = p_action_id AND user_id = p_user_id;

    UPDATE public.growth_missions
    SET status = 'dismissed', execution_state = 'closed', updated_at = v_now
    WHERE id = p_mission_id AND user_id = p_user_id;

    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      p_mission_id,
      p_user_id,
      'action_cancelled',
      jsonb_build_object('actionId', p_action_id, 'kind', v_action.kind),
      v_now
    );
    RETURN 'cancelled';
  END IF;

  -- Paused goals block new side effects; already-published content cannot be
  -- recalled and the UI must say so.
  SELECT g.status INTO v_goal_status
  FROM public.growth_loop_goals g
  JOIN public.growth_missions m ON m.goal_id = g.id
  WHERE m.id = p_mission_id AND m.user_id = p_user_id;
  IF v_goal_status IS NOT NULL AND v_goal_status <> 'active' THEN
    RAISE EXCEPTION 'This growth goal is paused or closed.' USING ERRCODE = '22023';
  END IF;

  IF v_action.kind NOT IN ('prepare_execution_draft', 'review_and_publish') THEN
    RAISE EXCEPTION 'This action type cannot be executed here yet.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.mission_actions
  SET status = 'running',
      output = jsonb_build_object('workbenchHref', p_workbench_href, 'execution', 'opened_studio'),
      attempt_count = attempt_count + 1,
      approved_payload_hash = COALESCE(p_payload_hash, approved_payload_hash),
      approved_at = v_now,
      started_at = v_now,
      completed_at = NULL,
      updated_at = v_now
  WHERE id = p_action_id AND user_id = p_user_id;

  UPDATE public.growth_missions
  SET execution_state = p_execution_state, updated_at = v_now
  WHERE id = p_mission_id AND user_id = p_user_id;

  INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
  VALUES (
    p_mission_id,
    p_user_id,
    'action_approved',
    jsonb_build_object(
      'actionId', p_action_id,
      'kind', v_action.kind,
      'next', p_workbench_href,
      'payloadHashPinned', p_payload_hash IS NOT NULL
    ),
    v_now
  );
  RETURN 'approved';
END;
$$;

REVOKE ALL ON FUNCTION public.apply_mission_action_decision(uuid, uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mission_action_decision(uuid, uuid, uuid, text, text, text, text) TO service_role;

-- ============ I. Signup attribution also serves growth_loop missions ============

CREATE OR REPLACE FUNCTION public.ingest_native_attributed_outcome(
  p_subject_user_id uuid,
  p_visitor_id uuid,
  p_event_type text,
  p_provider_event_hash text,
  p_external_ref_hash text,
  p_value numeric,
  p_currency text,
  p_occurred_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attribution public.native_outcome_attributions%ROWTYPE;
  v_mission public.growth_missions%ROWTYPE;
  v_click record;
  v_outcome_event_id uuid;
  v_inserted integer := 0;
  v_actual numeric := 0;
  v_now timestamptz := now();
  v_dedupe_key text;
BEGIN
  IF p_subject_user_id IS NULL THEN
    RAISE EXCEPTION 'Subject user is required.' USING ERRCODE = '22023';
  END IF;
  IF p_event_type IS NULL OR p_event_type NOT IN ('signup', 'revenue') THEN
    RAISE EXCEPTION 'Unsupported native outcome type.' USING ERRCODE = '22023';
  END IF;
  IF p_provider_event_hash IS NULL OR p_provider_event_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Provider event hash is invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_event_type = 'signup' AND p_visitor_id IS NULL THEN
    RAISE EXCEPTION 'A tracking visitor is required for signup attribution.' USING ERRCODE = '22023';
  END IF;
  IF p_event_type = 'revenue'
     AND (p_external_ref_hash IS NULL OR p_external_ref_hash !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'Revenue requires a valid transaction reference hash.' USING ERRCODE = '22023';
  END IF;
  IF p_event_type = 'revenue' AND (p_value IS NULL OR p_value <= 0) THEN
    RAISE EXCEPTION 'Revenue must be greater than zero.' USING ERRCODE = '22023';
  END IF;
  IF p_event_type = 'signup' AND COALESCE(p_value, 0) <> 0 THEN
    RAISE EXCEPTION 'Signup outcomes cannot include a value.' USING ERRCODE = '22023';
  END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be an ISO-style three-letter code.' USING ERRCODE = '22023';
  END IF;
  IF p_occurred_at IS NULL
     OR p_occurred_at < v_now - interval '366 days'
     OR p_occurred_at > v_now + interval '5 minutes' THEN
    RAISE EXCEPTION 'Outcome occurrence time is outside the accepted range.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_attribution
  FROM public.native_outcome_attributions
  WHERE subject_user_id = p_subject_user_id
  FOR SHARE;

  IF NOT FOUND AND p_event_type = 'signup' THEN
    SELECT
      click.mission_id,
      click.user_id AS mission_owner_user_id,
      click.tracking_link_id,
      click.occurred_at
    INTO v_click
    FROM public.outcome_events click
    JOIN public.tracking_links link
      ON link.id = click.tracking_link_id
     AND link.mission_id = click.mission_id
     AND link.user_id = click.user_id
    JOIN public.growth_missions mission
      ON mission.id = click.mission_id
     AND mission.user_id = click.user_id
    WHERE click.event_type = 'click'
      AND click.visitor_id = p_visitor_id::text
      AND click.occurred_at <= p_occurred_at + interval '5 minutes'
      AND click.occurred_at >= p_occurred_at - interval '90 days'
      AND link.status = 'active'
      AND mission.mission_kind IN ('growth_opportunity', 'growth_loop')
      AND mission.status = 'posted'
      AND mission.execution_state IN ('measuring', 'review_due')
    ORDER BY click.occurred_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('attributed', false, 'reason', 'no_eligible_tracking_click');
    END IF;

    INSERT INTO public.native_outcome_attributions (
      subject_user_id,
      mission_owner_user_id,
      mission_id,
      tracking_link_id,
      attributed_at
    ) VALUES (
      p_subject_user_id,
      v_click.mission_owner_user_id,
      v_click.mission_id,
      v_click.tracking_link_id,
      p_occurred_at
    )
    ON CONFLICT (subject_user_id) DO NOTHING;

    SELECT * INTO v_attribution
    FROM public.native_outcome_attributions
    WHERE subject_user_id = p_subject_user_id
    FOR SHARE;
  END IF;

  IF v_attribution.subject_user_id IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'no_signup_attribution');
  END IF;

  SELECT * INTO v_mission
  FROM public.growth_missions
  WHERE id = v_attribution.mission_id
    AND user_id = v_attribution.mission_owner_user_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_mission.mission_kind NOT IN ('growth_opportunity', 'growth_loop')
     OR v_mission.status <> 'posted'
     OR v_mission.execution_state NOT IN ('measuring', 'review_due') THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'mission_not_accepting_outcomes');
  END IF;

  IF v_mission.measurement_started_at IS NOT NULL
     AND p_occurred_at < v_mission.measurement_started_at - interval '5 minutes' THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'outcome_before_measurement');
  END IF;

  IF p_event_type = 'revenue' AND EXISTS (
    SELECT 1
    FROM public.outcome_events
    WHERE mission_id = v_attribution.mission_id
      AND user_id = v_attribution.mission_owner_user_id
      AND event_type = 'revenue'
      AND currency <> p_currency
  ) THEN
    RAISE EXCEPTION 'Revenue for this mission uses a different currency.' USING ERRCODE = '22023';
  END IF;

  v_dedupe_key := CASE p_event_type
    WHEN 'signup' THEN 'native:signup:' || p_provider_event_hash
    ELSE 'native:revenue:' || p_external_ref_hash
  END;

  INSERT INTO public.outcome_events (
    mission_id,
    user_id,
    tracking_link_id,
    event_type,
    source,
    quantity,
    value,
    currency,
    metadata,
    dedupe_key,
    occurred_at
  ) VALUES (
    v_attribution.mission_id,
    v_attribution.mission_owner_user_id,
    v_attribution.tracking_link_id,
    p_event_type,
    CASE p_event_type WHEN 'signup' THEN 'finfold-native-signup' ELSE 'creem' END,
    1,
    CASE p_event_type WHEN 'revenue' THEN p_value ELSE 0 END,
    CASE p_event_type WHEN 'revenue' THEN p_currency ELSE 'XXX' END,
    jsonb_strip_nulls(jsonb_build_object(
      'ingestion', 'provider_native',
      'providerEventHash', p_provider_event_hash,
      'externalRefHash', p_external_ref_hash
    )),
    v_dedupe_key,
    p_occurred_at
  )
  ON CONFLICT (mission_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_outcome_event_id;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT id INTO v_outcome_event_id
    FROM public.outcome_events
    WHERE mission_id = v_attribution.mission_id
      AND user_id = v_attribution.mission_owner_user_id
      AND dedupe_key = v_dedupe_key;
  ELSE
    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      v_attribution.mission_id,
      v_attribution.mission_owner_user_id,
      'outcome_recorded',
      jsonb_build_object(
        'eventType', p_event_type,
        'count', 1,
        'value', CASE p_event_type WHEN 'revenue' THEN p_value ELSE 0 END,
        'currency', CASE p_event_type WHEN 'revenue' THEN p_currency ELSE 'XXX' END,
        'source', CASE p_event_type WHEN 'signup' THEN 'finfold-native-signup' ELSE 'creem' END,
        'ingestion', 'provider_native'
      ),
      v_now
    );
  END IF;

  SELECT CASE v_mission.primary_metric_key
    WHEN 'leads' THEN COALESCE(SUM(quantity) FILTER (WHERE event_type = 'lead'), 0)
    WHEN 'signups' THEN COALESCE(SUM(quantity) FILTER (WHERE event_type = 'signup'), 0)
    WHEN 'revenue' THEN COALESCE(SUM(value) FILTER (WHERE event_type = 'revenue'), 0)
    ELSE 0
  END
  INTO v_actual
  FROM public.outcome_events
  WHERE mission_id = v_attribution.mission_id
    AND user_id = v_attribution.mission_owner_user_id;

  UPDATE public.growth_missions
  SET execution_state = CASE
        WHEN measurement_due_at IS NOT NULL AND measurement_due_at <= v_now THEN 'review_due'
        ELSE 'measuring'
      END,
      outcome = jsonb_build_object(
        'actualValue', v_actual,
        'baselineValue', 0,
        'targetValue', v_mission.target_value,
        'measuredAt', v_now,
        'explanation', 'Recorded business evidence is awaiting the user review decision.'
      ),
      updated_at = v_now
  WHERE id = v_attribution.mission_id
    AND user_id = v_attribution.mission_owner_user_id;

  RETURN jsonb_build_object(
    'attributed', true,
    'replayed', v_inserted = 0,
    'missionId', v_attribution.mission_id,
    'outcomeEventId', v_outcome_event_id,
    'actualValue', v_actual
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_native_attributed_outcome(
  uuid, uuid, text, text, text, numeric, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_native_attributed_outcome(
  uuid, uuid, text, text, text, numeric, text, timestamptz
) TO service_role;

-- ============ J. Activation outcome: first content-library save after signup ============
--
-- Reuses the frozen signup attribution (migration 091): the activation keeps
-- whatever mission/variant the signup was attributed to. Deduplicated per
-- subject for life, so replays and concurrent saves count once.

CREATE OR REPLACE FUNCTION public.record_native_activation_outcome(
  p_subject_user_id uuid,
  p_occurred_at timestamptz DEFAULT now(),
  p_is_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attribution public.native_outcome_attributions%ROWTYPE;
  v_mission public.growth_missions%ROWTYPE;
  v_outcome_event_id uuid;
  v_inserted integer := 0;
  v_actual numeric := 0;
  v_now timestamptz := now();
  v_dedupe_key text := 'native:activation:' || p_subject_user_id::text;
BEGIN
  IF p_subject_user_id IS NULL THEN
    RAISE EXCEPTION 'Subject user is required.' USING ERRCODE = '22023';
  END IF;
  IF p_occurred_at IS NULL
     OR p_occurred_at < v_now - interval '366 days'
     OR p_occurred_at > v_now + interval '5 minutes' THEN
    RAISE EXCEPTION 'Activation occurrence time is outside the accepted range.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_attribution
  FROM public.native_outcome_attributions
  WHERE subject_user_id = p_subject_user_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'no_signup_attribution');
  END IF;

  SELECT * INTO v_mission
  FROM public.growth_missions
  WHERE id = v_attribution.mission_id
    AND user_id = v_attribution.mission_owner_user_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_mission.mission_kind <> 'growth_loop'
     OR v_mission.status <> 'posted'
     OR v_mission.execution_state NOT IN ('measuring', 'review_due') THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'mission_not_accepting_outcomes');
  END IF;
  IF v_mission.measurement_started_at IS NOT NULL
     AND p_occurred_at < v_mission.measurement_started_at - interval '5 minutes' THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'outcome_before_measurement');
  END IF;

  INSERT INTO public.outcome_events (
    mission_id,
    user_id,
    tracking_link_id,
    event_type,
    source,
    visitor_id,
    quantity,
    value,
    currency,
    metadata,
    dedupe_key,
    occurred_at
  ) VALUES (
    v_attribution.mission_id,
    v_attribution.mission_owner_user_id,
    v_attribution.tracking_link_id,
    'activation',
    'finfold-first-save',
    -- The frozen attribution row (091) never stored the visitor id; the
    -- activation is deduplicated per subject, so it stays NULL here.
    NULL,
    1,
    0,
    'XXX',
    jsonb_strip_nulls(jsonb_build_object(
      'ingestion', 'provider_native',
      'attributionRule', 'last-click-90d-frozen-v1',
      'isTest', p_is_test
    )),
    v_dedupe_key,
    p_occurred_at
  )
  ON CONFLICT (mission_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_outcome_event_id;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT id INTO v_outcome_event_id
    FROM public.outcome_events
    WHERE mission_id = v_attribution.mission_id
      AND user_id = v_attribution.mission_owner_user_id
      AND dedupe_key = v_dedupe_key;
  ELSE
    INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
    VALUES (
      v_attribution.mission_id,
      v_attribution.mission_owner_user_id,
      'outcome_recorded',
      jsonb_build_object(
        'eventType', 'activation',
        'count', 1,
        'source', 'finfold-first-save',
        'ingestion', 'provider_native',
        'isTest', p_is_test
      ),
      v_now
    );
  END IF;

  SELECT COALESCE(SUM(quantity) FILTER (WHERE event_type = 'signup'), 0)
  INTO v_actual
  FROM public.outcome_events
  WHERE mission_id = v_attribution.mission_id
    AND user_id = v_attribution.mission_owner_user_id;

  UPDATE public.growth_missions
  SET execution_state = CASE
        WHEN measurement_due_at IS NOT NULL AND measurement_due_at <= v_now THEN 'review_due'
        ELSE 'measuring'
      END,
      outcome = jsonb_build_object(
        'actualValue', v_actual,
        'baselineValue', 0,
        'targetValue', v_mission.target_value,
        'measuredAt', v_now,
        'explanation', 'Recorded business evidence is awaiting the user review decision.'
      ),
      updated_at = v_now
  WHERE id = v_attribution.mission_id
    AND user_id = v_attribution.mission_owner_user_id;

  RETURN jsonb_build_object(
    'attributed', true,
    'replayed', v_inserted = 0,
    'missionId', v_attribution.mission_id,
    'outcomeEventId', v_outcome_event_id,
    'actualValue', v_actual
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_native_activation_outcome(uuid, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_native_activation_outcome(uuid, timestamptz, boolean) TO service_role;

-- ============ K. Publication evidence: user-reported only ============

CREATE OR REPLACE FUNCTION public.confirm_mission_publication(
  p_user_id uuid,
  p_mission_id uuid,
  p_action_id uuid,
  p_variant_key text,
  p_payload_hash text,
  p_evidence_url text,
  p_execution_mode text,
  p_window_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action public.mission_actions%ROWTYPE;
  v_mission public.growth_missions%ROWTYPE;
  v_goal public.growth_loop_goals%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_execution_mode IS NULL OR p_execution_mode NOT IN ('manual', 'assisted') THEN
    RAISE EXCEPTION 'Execution mode must be manual or assisted in this release.' USING ERRCODE = '22023';
  END IF;
  IF p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Payload hash is required to confirm publication.' USING ERRCODE = '22023';
  END IF;
  IF p_evidence_url IS NULL
     OR p_evidence_url !~ '^https://([a-z0-9-]+\.)*xiaohongshu\.com/[^\s]*$'
     OR char_length(p_evidence_url) > 2048 THEN
    RAISE EXCEPTION 'Publication evidence must be an https Xiaohongshu link.' USING ERRCODE = '22023';
  END IF;
  IF p_window_days IS NULL OR p_window_days < 1 OR p_window_days > 90 THEN
    RAISE EXCEPTION 'Measurement window must be between 1 and 90 days.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_action
  FROM public.mission_actions
  WHERE id = p_action_id AND mission_id = p_mission_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission action not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_action.status = 'succeeded'
     AND v_action.evidence_url = p_evidence_url
     AND v_action.approved_payload_hash = p_payload_hash THEN
    RETURN jsonb_build_object('confirmed', false, 'replayed', true, 'actionId', p_action_id);
  END IF;

  IF v_action.kind <> 'review_and_publish' THEN
    RAISE EXCEPTION 'Only publish actions can carry publication evidence.' USING ERRCODE = '22023';
  END IF;
  IF v_action.status NOT IN ('awaiting_approval', 'running') THEN
    RAISE EXCEPTION 'This publish action can no longer be confirmed.' USING ERRCODE = 'P0001';
  END IF;
  IF v_action.approved_payload_hash IS DISTINCT FROM p_payload_hash THEN
    RAISE EXCEPTION 'Approval is stale: the approved content version no longer matches.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_mission
  FROM public.growth_missions
  WHERE id = p_mission_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_mission.mission_kind <> 'growth_loop' THEN
    RAISE EXCEPTION 'Growth loop mission not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_mission.goal_id IS NOT NULL THEN
    SELECT * INTO v_goal
    FROM public.growth_loop_goals
    WHERE id = v_mission.goal_id AND user_id = p_user_id
    FOR SHARE;
    IF v_goal.status NOT IN ('active', 'completed') THEN
      RAISE EXCEPTION 'This growth goal is paused or closed.' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.mission_actions
  SET status = 'succeeded',
      evidence_url = p_evidence_url,
      evidence_level = 'user_reported',
      evidence_reported_at = v_now,
      execution_mode = p_execution_mode,
      output = jsonb_build_object(
        'variantKey', p_variant_key,
        'evidenceLevel', 'user_reported',
        'executionMode', p_execution_mode
      ),
      completed_at = v_now,
      updated_at = v_now
  WHERE id = p_action_id AND user_id = p_user_id;

  -- The first confirmed variant flips the mission into measurement; later
  -- variants only append their own evidence.
  IF v_mission.status <> 'posted' THEN
    UPDATE public.growth_missions
    SET status = 'posted',
        execution_state = 'measuring',
        measurement_window_days = p_window_days,
        measurement_started_at = v_now,
        measurement_due_at = LEAST(
          v_now + make_interval(days => p_window_days),
          COALESCE(v_goal.end_at, v_now + make_interval(days => p_window_days))
        ),
        updated_at = v_now
    WHERE id = p_mission_id AND user_id = p_user_id;
  END IF;

  INSERT INTO public.mission_events (mission_id, user_id, event_type, payload, occurred_at)
  VALUES (
    p_mission_id,
    p_user_id,
    'publication_evidence_recorded',
    jsonb_build_object(
      'actionId', p_action_id,
      'variantKey', p_variant_key,
      'executionMode', p_execution_mode,
      'evidenceLevel', 'user_reported',
      'evidenceUrl', p_evidence_url
    ),
    v_now
  );
  RETURN jsonb_build_object('confirmed', true, 'replayed', false, 'actionId', p_action_id);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_mission_publication(uuid, uuid, uuid, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_mission_publication(uuid, uuid, uuid, text, text, text, text, integer) TO service_role;
