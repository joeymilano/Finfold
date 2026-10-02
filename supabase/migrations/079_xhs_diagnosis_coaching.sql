-- 079: Evidence-led Xiaohongshu diagnosis and 14-day coaching loop.
--
-- Independent from 078_research_missions. It reuses the already deployed
-- operating_programs, xhs_workflows and agent_data_imports contracts so the
-- first-party diagnosis remains complete when a commercial provider is down.

CREATE TABLE IF NOT EXISTS public.xhs_diagnoses (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id           uuid        REFERENCES public.xhs_workflows(id) ON DELETE SET NULL,
  operating_program_id  uuid        REFERENCES public.operating_programs(id) ON DELETE SET NULL,
  import_id             uuid        REFERENCES public.agent_data_imports(id) ON DELETE SET NULL,
  diagnosis_type        text        NOT NULL DEFAULT 'account',
  evidence_level        text        NOT NULL DEFAULT 'insufficient',
  primary_stage         text        NOT NULL DEFAULT 'measurement',
  input                 jsonb       NOT NULL DEFAULT '{}',
  report                jsonb       NOT NULL DEFAULT '{}',
  provider_status       jsonb       NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xhs_diagnoses_type_check
    CHECK (diagnosis_type IN ('account', 'rediagnosis')),
  CONSTRAINT xhs_diagnoses_evidence_check
    CHECK (evidence_level IN ('confirmed', 'supported_hypothesis', 'insufficient')),
  CONSTRAINT xhs_diagnoses_stage_check
    CHECK (primary_stage IN ('measurement', 'policy', 'distribution', 'click', 'retention', 'value', 'conversion')),
  CONSTRAINT xhs_diagnoses_input_object_check CHECK (jsonb_typeof(input) = 'object'),
  CONSTRAINT xhs_diagnoses_report_object_check CHECK (jsonb_typeof(report) = 'object'),
  CONSTRAINT xhs_diagnoses_provider_object_check CHECK (jsonb_typeof(provider_status) = 'object')
);

CREATE INDEX IF NOT EXISTS xhs_diagnoses_user_created_idx
  ON public.xhs_diagnoses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS xhs_diagnoses_workflow_created_idx
  ON public.xhs_diagnoses(workflow_id, created_at DESC)
  WHERE workflow_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.xhs_coaching_programs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id           uuid        NOT NULL REFERENCES public.xhs_workflows(id) ON DELETE CASCADE,
  operating_program_id  uuid        REFERENCES public.operating_programs(id) ON DELETE SET NULL,
  baseline_diagnosis_id uuid        NOT NULL REFERENCES public.xhs_diagnoses(id) ON DELETE RESTRICT,
  latest_diagnosis_id   uuid        REFERENCES public.xhs_diagnoses(id) ON DELETE SET NULL,
  status                text        NOT NULL DEFAULT 'active',
  start_date            date        NOT NULL DEFAULT current_date,
  timezone              text        NOT NULL DEFAULT 'Asia/Shanghai',
  objective             text        NOT NULL DEFAULT '',
  target_audience       text        NOT NULL DEFAULT '',
  baseline              jsonb       NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  CONSTRAINT xhs_coaching_program_status_check
    CHECK (status IN ('active', 'completed', 'paused', 'archived')),
  CONSTRAINT xhs_coaching_program_baseline_object_check CHECK (jsonb_typeof(baseline) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS xhs_one_active_coaching_program_user_idx
  ON public.xhs_coaching_programs(user_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS xhs_coaching_programs_user_updated_idx
  ON public.xhs_coaching_programs(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.xhs_coaching_tasks (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id        uuid        NOT NULL REFERENCES public.xhs_coaching_programs(id) ON DELETE CASCADE,
  day_number        integer     NOT NULL CHECK (day_number BETWEEN 0 AND 14),
  phase             text        NOT NULL,
  task_kind         text        NOT NULL,
  title             text        NOT NULL,
  reason            text        NOT NULL,
  deliverable       text        NOT NULL,
  due_at            timestamptz NOT NULL,
  target_metric     text        NOT NULL,
  single_variable   text        NOT NULL,
  completion_proof  text        NOT NULL,
  workbench_href    text        NOT NULL,
  status            text        NOT NULL DEFAULT 'todo',
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xhs_coaching_tasks_phase_check
    CHECK (phase IN ('baseline', 'round_one', 'review_one', 'round_two', 'rediagnosis')),
  CONSTRAINT xhs_coaching_tasks_kind_check
    CHECK (task_kind IN ('baseline', 'plan', 'create', 'publish', 'observe', 'review', 'rediagnose')),
  CONSTRAINT xhs_coaching_tasks_status_check
    CHECK (status IN ('todo', 'in_progress', 'completed', 'skipped')),
  CONSTRAINT xhs_coaching_tasks_program_day_unique UNIQUE (program_id, day_number)
);

CREATE INDEX IF NOT EXISTS xhs_coaching_tasks_user_due_idx
  ON public.xhs_coaching_tasks(user_id, due_at);
CREATE INDEX IF NOT EXISTS xhs_coaching_tasks_program_day_idx
  ON public.xhs_coaching_tasks(program_id, day_number);

CREATE TABLE IF NOT EXISTS public.xhs_coaching_check_ins (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id        uuid        NOT NULL REFERENCES public.xhs_coaching_programs(id) ON DELETE CASCADE,
  task_id           uuid        NOT NULL REFERENCES public.xhs_coaching_tasks(id) ON DELETE CASCADE,
  proof             jsonb       NOT NULL DEFAULT '{}',
  observed_metrics  jsonb       NOT NULL DEFAULT '{}',
  reflection        text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xhs_coaching_check_ins_proof_object_check CHECK (jsonb_typeof(proof) = 'object'),
  CONSTRAINT xhs_coaching_check_ins_metrics_object_check CHECK (jsonb_typeof(observed_metrics) = 'object')
);

CREATE INDEX IF NOT EXISTS xhs_coaching_check_ins_task_created_idx
  ON public.xhs_coaching_check_ins(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS xhs_coaching_check_ins_user_created_idx
  ON public.xhs_coaching_check_ins(user_id, created_at DESC);

ALTER TABLE public.xhs_diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xhs_coaching_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xhs_coaching_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xhs_coaching_check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "xhs diagnoses: select own" ON public.xhs_diagnoses;
CREATE POLICY "xhs diagnoses: select own"
  ON public.xhs_diagnoses FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "xhs diagnoses: insert own" ON public.xhs_diagnoses;
CREATE POLICY "xhs diagnoses: insert own"
  ON public.xhs_diagnoses FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "xhs coaching programs: select own" ON public.xhs_coaching_programs;
CREATE POLICY "xhs coaching programs: select own"
  ON public.xhs_coaching_programs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "xhs coaching programs: insert own" ON public.xhs_coaching_programs;
CREATE POLICY "xhs coaching programs: insert own"
  ON public.xhs_coaching_programs FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "xhs coaching programs: update own" ON public.xhs_coaching_programs;
CREATE POLICY "xhs coaching programs: update own"
  ON public.xhs_coaching_programs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "xhs coaching tasks: select own" ON public.xhs_coaching_tasks;
CREATE POLICY "xhs coaching tasks: select own"
  ON public.xhs_coaching_tasks FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "xhs coaching tasks: insert own" ON public.xhs_coaching_tasks;
CREATE POLICY "xhs coaching tasks: insert own"
  ON public.xhs_coaching_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "xhs coaching tasks: update own" ON public.xhs_coaching_tasks;
CREATE POLICY "xhs coaching tasks: update own"
  ON public.xhs_coaching_tasks FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "xhs coaching check ins: select own" ON public.xhs_coaching_check_ins;
CREATE POLICY "xhs coaching check ins: select own"
  ON public.xhs_coaching_check_ins FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "xhs coaching check ins: insert own" ON public.xhs_coaching_check_ins;
CREATE POLICY "xhs coaching check ins: insert own"
  ON public.xhs_coaching_check_ins FOR INSERT WITH CHECK (auth.uid() = user_id);
