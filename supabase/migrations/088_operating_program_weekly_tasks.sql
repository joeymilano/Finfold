-- 088: Turn an operating program cadence into an accountable weekly queue.
--
-- A task is completed only by a real kit_outputs publication belonging to the
-- same user and platform. The queue never publishes on the user's behalf and
-- does not treat a missing publication as evidence of a business failure.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'operating_programs_id_user_unique'
  ) THEN
    ALTER TABLE public.operating_programs
      ADD CONSTRAINT operating_programs_id_user_unique UNIQUE (id, user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kit_outputs_id_user_unique'
  ) THEN
    ALTER TABLE public.kit_outputs
      ADD CONSTRAINT kit_outputs_id_user_unique UNIQUE (id, user_id);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.operating_program_weekly_tasks (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operating_program_id  uuid        NOT NULL,
  platform              text        NOT NULL,
  week_start            date        NOT NULL,
  slot_index            integer     NOT NULL,
  cadence_snapshot      integer     NOT NULL,
  status                text        NOT NULL DEFAULT 'open',
  due_at                 timestamptz NOT NULL,
  completed_at           timestamptz,
  completed_output_id    uuid,
  completion_source      text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operating_program_weekly_tasks_program_user_fk
    FOREIGN KEY (operating_program_id, user_id)
    REFERENCES public.operating_programs(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT operating_program_weekly_tasks_output_user_fk
    FOREIGN KEY (completed_output_id, user_id)
    REFERENCES public.kit_outputs(id, user_id)
    ON DELETE SET NULL (completed_output_id),
  CONSTRAINT operating_program_weekly_tasks_platform_check
    CHECK (platform IN ('xiaohongshu', 'linkedin', 'wechat')),
  CONSTRAINT operating_program_weekly_tasks_status_check
    CHECK (status IN ('open', 'done', 'missed', 'superseded')),
  CONSTRAINT operating_program_weekly_tasks_slot_check
    CHECK (slot_index BETWEEN 0 AND 4),
  CONSTRAINT operating_program_weekly_tasks_cadence_check
    CHECK (cadence_snapshot BETWEEN 2 AND 5),
  CONSTRAINT operating_program_weekly_tasks_completion_check
    CHECK (
      (status = 'done' AND completed_at IS NOT NULL AND completion_source = 'output_posted')
      OR
      (status <> 'done' AND completed_at IS NULL AND completed_output_id IS NULL AND completion_source IS NULL)
    ),
  CONSTRAINT operating_program_weekly_tasks_slot_unique
    UNIQUE (operating_program_id, week_start, slot_index)
);

CREATE UNIQUE INDEX IF NOT EXISTS operating_program_weekly_tasks_output_unique
  ON public.operating_program_weekly_tasks(completed_output_id)
  WHERE completed_output_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS operating_program_weekly_tasks_user_due_idx
  ON public.operating_program_weekly_tasks(user_id, due_at)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS operating_program_weekly_tasks_program_week_idx
  ON public.operating_program_weekly_tasks(operating_program_id, week_start DESC, slot_index);

ALTER TABLE public.operating_program_weekly_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operating weekly tasks: select own" ON public.operating_program_weekly_tasks;
CREATE POLICY "operating weekly tasks: select own"
  ON public.operating_program_weekly_tasks FOR SELECT
  USING (auth.uid() = user_id);

-- Writes remain service-role only. Users can inspect the accountability ledger
-- but cannot manufacture completed cadence slots from the browser.

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
    'xhs_review',
    'operating_publish'
  ));
