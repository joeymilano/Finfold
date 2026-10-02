-- 069: Platform-neutral Agent content workflows.
--
-- WeChat and X package generation shares the durable generation-run and
-- content-kit pipeline, but must not share Xiaohongshu's specialized workflow
-- tables or action kinds.

CREATE TABLE IF NOT EXISTS public.agent_content_workflows (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform              text        NOT NULL,
  status                text        NOT NULL DEFAULT 'active',
  stage                 text        NOT NULL DEFAULT 'draft',
  request               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  kit_id                uuid        REFERENCES public.content_kits(id) ON DELETE SET NULL,
  generation_request_id text,
  generation_run_id     uuid        REFERENCES public.generation_runs(id) ON DELETE SET NULL,
  completion_receipt    jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  CONSTRAINT agent_content_workflows_platform_check
    CHECK (platform IN ('wechat', 'x')),
  CONSTRAINT agent_content_workflows_status_check
    CHECK (status IN ('active', 'completed', 'dismissed', 'superseded')),
  CONSTRAINT agent_content_workflows_stage_check
    CHECK (stage IN ('draft', 'generating', 'ready', 'review'))
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_content_workflows_one_active_platform_idx
  ON public.agent_content_workflows(user_id, platform)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS agent_content_workflows_user_updated_idx
  ON public.agent_content_workflows(user_id, updated_at DESC);

ALTER TABLE public.content_kits
  ADD COLUMN IF NOT EXISTS agent_content_workflow_id uuid
  REFERENCES public.agent_content_workflows(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS content_kits_agent_content_workflow_idx
  ON public.content_kits(agent_content_workflow_id)
  WHERE agent_content_workflow_id IS NOT NULL;

ALTER TABLE public.agent_content_workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent content workflows: select own" ON public.agent_content_workflows;
CREATE POLICY "agent content workflows: select own"
  ON public.agent_content_workflows FOR SELECT
  USING (auth.uid() = user_id);