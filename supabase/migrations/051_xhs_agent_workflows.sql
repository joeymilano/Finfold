-- 051: Persistent Xiaohongshu operating workflow for the built-in Agent.
--
-- The Agent chat is intentionally ephemeral: users can open a new session
-- without losing positioning, approved artifacts, or the current operating
-- stage. Read-only Agent tools may propose work, but every durable transition
-- is represented by a short-lived pending action that the user confirms.

CREATE TABLE IF NOT EXISTS public.creator_strategy_profiles (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform              text        NOT NULL DEFAULT 'xiaohongshu',
  positioning_statement text        NOT NULL DEFAULT '',
  audience_labels       jsonb       NOT NULL DEFAULT '[]',
  content_pillars       jsonb       NOT NULL DEFAULT '[]',
  identity_proofs       jsonb       NOT NULL DEFAULT '[]',
  series_promises       jsonb       NOT NULL DEFAULT '[]',
  sustainable_cadence   text        NOT NULL DEFAULT '',
  boundaries            jsonb       NOT NULL DEFAULT '[]',
  version               integer     NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);

CREATE TABLE IF NOT EXISTS public.xhs_workflows (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                text        NOT NULL DEFAULT 'active',
  stage                 text        NOT NULL DEFAULT 'positioning',
  current_bottleneck    text,
  primary_metric        text,
  next_action           jsonb       NOT NULL DEFAULT '{}',
  strategy_profile_id   uuid        REFERENCES public.creator_strategy_profiles(id) ON DELETE SET NULL,
  growth_mission_id     uuid        REFERENCES public.growth_missions(id) ON DELETE SET NULL,
  kit_id                uuid        REFERENCES public.content_kits(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  CONSTRAINT xhs_workflows_status_check
    CHECK (status IN ('active', 'completed', 'dismissed', 'superseded')),
  CONSTRAINT xhs_workflows_stage_check
    CHECK (stage IN ('positioning', 'topic', 'draft', 'title', 'visual', 'publish', 'review'))
);

CREATE UNIQUE INDEX IF NOT EXISTS xhs_one_active_workflow_user_idx
  ON public.xhs_workflows(user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS xhs_workflows_user_updated_idx
  ON public.xhs_workflows(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.xhs_workflow_artifacts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id     uuid        NOT NULL REFERENCES public.xhs_workflows(id) ON DELETE CASCADE,
  kind            text        NOT NULL,
  version         integer     NOT NULL CHECK (version > 0),
  status          text        NOT NULL DEFAULT 'approved',
  payload         jsonb       NOT NULL DEFAULT '{}',
  provenance      jsonb       NOT NULL DEFAULT '{}',
  confidence      text        NOT NULL DEFAULT 'hypothesis',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xhs_artifact_kind_check
    CHECK (kind IN (
      'creator_strategy',
      'topic_evidence',
      'note_brief',
      'title_matrix',
      'visual_plan',
      'analytics_report'
    )),
  CONSTRAINT xhs_artifact_status_check
    CHECK (status IN ('proposed', 'approved', 'superseded')),
  CONSTRAINT xhs_artifact_confidence_check
    CHECK (confidence IN ('measured', 'inferred', 'hypothesis')),
  UNIQUE (workflow_id, kind, version)
);

CREATE INDEX IF NOT EXISTS xhs_artifacts_workflow_kind_idx
  ON public.xhs_workflow_artifacts(workflow_id, kind, version DESC);

CREATE TABLE IF NOT EXISTS public.agent_pending_actions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      uuid        REFERENCES public.agent_sessions(id) ON DELETE SET NULL,
  workflow_id     uuid        REFERENCES public.xhs_workflows(id) ON DELETE CASCADE,
  action_kind     text        NOT NULL,
  payload         jsonb       NOT NULL DEFAULT '{}',
  fingerprint     text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending',
  result          jsonb,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  executed_at     timestamptz,
  CONSTRAINT agent_pending_action_kind_check
    CHECK (action_kind IN (
      'confirm_positioning',
      'select_topic',
      'confirm_draft',
      'select_title',
      'confirm_visual',
      'link_kit',
      'mark_published',
      'complete_review',
      'tool_mutation'
    )),
  CONSTRAINT agent_pending_action_status_check
    CHECK (status IN ('pending', 'executing', 'executed', 'expired', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_pending_action_fingerprint_idx
  ON public.agent_pending_actions(user_id, fingerprint)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS agent_pending_actions_user_created_idx
  ON public.agent_pending_actions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_data_imports (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id       uuid        REFERENCES public.xhs_workflows(id) ON DELETE CASCADE,
  platform          text        NOT NULL DEFAULT 'xiaohongshu',
  source_type       text        NOT NULL,
  original_name     text,
  normalized_rows   jsonb       NOT NULL DEFAULT '[]',
  provenance        jsonb       NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_data_import_source_check
    CHECK (source_type IN ('pasted_text', 'screenshot', 'csv', 'xlsx'))
);

CREATE INDEX IF NOT EXISTS agent_data_imports_user_created_idx
  ON public.agent_data_imports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_data_imports_workflow_created_idx
  ON public.agent_data_imports(workflow_id, created_at DESC)
  WHERE workflow_id IS NOT NULL;

ALTER TABLE public.content_kits
  ADD COLUMN IF NOT EXISTS xhs_workflow_id uuid REFERENCES public.xhs_workflows(id) ON DELETE SET NULL;
ALTER TABLE public.content_kits
  ADD COLUMN IF NOT EXISTS xhs_artifact_version_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS content_kits_xhs_workflow_idx
  ON public.content_kits(xhs_workflow_id)
  WHERE xhs_workflow_id IS NOT NULL;

ALTER TABLE public.creator_strategy_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xhs_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xhs_workflow_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_data_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator strategy: select own" ON public.creator_strategy_profiles;
CREATE POLICY "creator strategy: select own"
  ON public.creator_strategy_profiles FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "creator strategy: insert own" ON public.creator_strategy_profiles;
CREATE POLICY "creator strategy: insert own"
  ON public.creator_strategy_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "creator strategy: update own" ON public.creator_strategy_profiles;
CREATE POLICY "creator strategy: update own"
  ON public.creator_strategy_profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "xhs workflows: select own" ON public.xhs_workflows;
CREATE POLICY "xhs workflows: select own"
  ON public.xhs_workflows FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "xhs workflows: insert own" ON public.xhs_workflows;
CREATE POLICY "xhs workflows: insert own"
  ON public.xhs_workflows FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "xhs workflows: update own" ON public.xhs_workflows;
CREATE POLICY "xhs workflows: update own"
  ON public.xhs_workflows FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "xhs artifacts: select own" ON public.xhs_workflow_artifacts;
CREATE POLICY "xhs artifacts: select own"
  ON public.xhs_workflow_artifacts FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "xhs artifacts: insert own" ON public.xhs_workflow_artifacts;
CREATE POLICY "xhs artifacts: insert own"
  ON public.xhs_workflow_artifacts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "agent pending actions: select own" ON public.agent_pending_actions;
CREATE POLICY "agent pending actions: select own"
  ON public.agent_pending_actions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "agent data imports: select own" ON public.agent_data_imports;
CREATE POLICY "agent data imports: select own"
  ON public.agent_data_imports FOR SELECT USING (auth.uid() = user_id);

-- Agent actions use the service role, but users can still inspect their audit
-- trail. Expand the existing guarded audit target for XHS workflow changes.
ALTER TABLE public.agent_action_audit
  DROP CONSTRAINT IF EXISTS agent_action_audit_target_type_check;
ALTER TABLE public.agent_action_audit
  ADD CONSTRAINT agent_action_audit_target_type_check
  CHECK (target_type IN ('guardrails', 'brand_brain', 'xhs_workflow'));

ALTER TABLE public.agent_patrol_items
  DROP CONSTRAINT IF EXISTS agent_patrol_items_action_check;
ALTER TABLE public.agent_patrol_items
  ADD CONSTRAINT agent_patrol_items_action_check
  CHECK (action_kind IN (
    'mission_generate',
    'mission_publish',
    'mission_measure',
    'mission_review',
    'measure_results',
    'review_drafts',
    'new_experiment',
    'first_measured_post',
    'xhs_positioning',
    'xhs_topic',
    'xhs_draft',
    'xhs_title',
    'xhs_visual',
    'xhs_publish',
    'xhs_review'
  ));
