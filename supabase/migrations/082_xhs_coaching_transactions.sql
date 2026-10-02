-- 082: Keep the user-visible Xiaohongshu coaching workflow atomic.
-- Program creation and check-in completion each touch several durable rows;
-- these service-role-only functions make those writes succeed or fail together.

CREATE OR REPLACE FUNCTION public.create_xhs_coaching_program(
  p_user_id uuid,
  p_program jsonb,
  p_tasks jsonb,
  p_baseline_check_in jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_program_id uuid := (p_program ->> 'id')::uuid;
  v_diagnosis_id uuid := (p_program ->> 'baseline_diagnosis_id')::uuid;
  v_task jsonb;
BEGIN
  IF jsonb_typeof(p_program) <> 'object'
     OR jsonb_typeof(p_tasks) <> 'array'
     OR jsonb_array_length(p_tasks) <> 15
     OR jsonb_typeof(p_baseline_check_in) <> 'object' THEN
    RAISE EXCEPTION 'Invalid coaching program payload.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.xhs_diagnoses diagnosis
    WHERE diagnosis.id = v_diagnosis_id
      AND diagnosis.user_id = p_user_id
      AND diagnosis.workflow_id = (p_program ->> 'workflow_id')::uuid
  ) THEN
    RAISE EXCEPTION 'Diagnosis not found for this account.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.xhs_coaching_programs (
    id, user_id, workflow_id, operating_program_id, baseline_diagnosis_id,
    latest_diagnosis_id, status, start_date, timezone, objective,
    target_audience, baseline
  ) VALUES (
    v_program_id,
    p_user_id,
    (p_program ->> 'workflow_id')::uuid,
    NULLIF(p_program ->> 'operating_program_id', '')::uuid,
    v_diagnosis_id,
    NULLIF(p_program ->> 'latest_diagnosis_id', '')::uuid,
    'active',
    (p_program ->> 'start_date')::date,
    p_program ->> 'timezone',
    COALESCE(p_program ->> 'objective', ''),
    COALESCE(p_program ->> 'target_audience', ''),
    p_program -> 'baseline'
  );

  FOR v_task IN SELECT value FROM jsonb_array_elements(p_tasks)
  LOOP
    IF (v_task ->> 'program_id')::uuid <> v_program_id
       OR (v_task ->> 'day_number')::integer NOT BETWEEN 0 AND 14 THEN
      RAISE EXCEPTION 'Invalid coaching task payload.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.xhs_coaching_tasks (
      id, user_id, program_id, day_number, phase, task_kind, title, reason,
      deliverable, due_at, target_metric, single_variable, completion_proof,
      workbench_href, status, completed_at
    ) VALUES (
      (v_task ->> 'id')::uuid,
      p_user_id,
      v_program_id,
      (v_task ->> 'day_number')::integer,
      v_task ->> 'phase',
      v_task ->> 'task_kind',
      v_task ->> 'title',
      v_task ->> 'reason',
      v_task ->> 'deliverable',
      (v_task ->> 'due_at')::timestamptz,
      v_task ->> 'target_metric',
      v_task ->> 'single_variable',
      v_task ->> 'completion_proof',
      v_task ->> 'workbench_href',
      v_task ->> 'status',
      NULLIF(v_task ->> 'completed_at', '')::timestamptz
    );
  END LOOP;

  IF (p_baseline_check_in ->> 'program_id')::uuid <> v_program_id THEN
    RAISE EXCEPTION 'Invalid baseline check-in payload.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.xhs_coaching_check_ins (
    id, user_id, program_id, task_id, proof, observed_metrics, reflection, created_at
  ) VALUES (
    (p_baseline_check_in ->> 'id')::uuid,
    p_user_id,
    v_program_id,
    (p_baseline_check_in ->> 'task_id')::uuid,
    p_baseline_check_in -> 'proof',
    COALESCE(p_baseline_check_in -> 'observed_metrics', '{}'::jsonb),
    COALESCE(p_baseline_check_in ->> 'reflection', ''),
    (p_baseline_check_in ->> 'created_at')::timestamptz
  );

  RETURN v_program_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_xhs_coaching_check_in(
  p_user_id uuid,
  p_task_id uuid,
  p_program_id uuid,
  p_check_in jsonb,
  p_round_two_updates jsonb DEFAULT '[]'::jsonb,
  p_complete_program boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_task public.xhs_coaching_tasks%ROWTYPE;
  v_program public.xhs_coaching_programs%ROWTYPE;
  v_update jsonb;
  v_now timestamptz := COALESCE(NULLIF(p_check_in ->> 'created_at', '')::timestamptz, now());
  v_created_at timestamptz;
  v_replayed boolean := false;
BEGIN
  IF jsonb_typeof(p_check_in) <> 'object' OR jsonb_typeof(p_round_two_updates) <> 'array' THEN
    RAISE EXCEPTION 'Invalid coaching check-in payload.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_task
  FROM public.xhs_coaching_tasks
  WHERE id = p_task_id AND program_id = p_program_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coaching task not found for this account.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_program
  FROM public.xhs_coaching_programs
  WHERE id = p_program_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coaching program not found for this account.' USING ERRCODE = 'P0002';
  END IF;

  SELECT created_at INTO v_created_at
  FROM public.xhs_coaching_check_ins
  WHERE id = p_task_id AND task_id = p_task_id AND program_id = p_program_id AND user_id = p_user_id;

  IF v_task.status = 'completed' THEN
    IF v_created_at IS NULL THEN
      RAISE EXCEPTION 'Completed coaching task has no durable check-in.' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'replayed', true,
      'createdAt', v_created_at,
      'completedAt', v_task.completed_at
    );
  END IF;
  IF v_program.status <> 'active' THEN
    RAISE EXCEPTION 'Coaching program is not active.' USING ERRCODE = 'P0001';
  END IF;

  IF v_created_at IS NULL THEN
    INSERT INTO public.xhs_coaching_check_ins (
      id, user_id, program_id, task_id, proof, observed_metrics, reflection, created_at
    ) VALUES (
      p_task_id,
      p_user_id,
      p_program_id,
      p_task_id,
      p_check_in -> 'proof',
      COALESCE(p_check_in -> 'observed_metrics', '{}'::jsonb),
      COALESCE(p_check_in ->> 'reflection', ''),
      v_now
    );
    v_created_at := v_now;
  ELSE
    v_replayed := true;
  END IF;

  FOR v_update IN SELECT value FROM jsonb_array_elements(p_round_two_updates)
  LOOP
    UPDATE public.xhs_coaching_tasks
    SET single_variable = v_update ->> 'single_variable',
        target_metric = v_update ->> 'target_metric',
        reason = v_update ->> 'reason',
        workbench_href = v_update ->> 'workbench_href',
        updated_at = v_now
    WHERE id = (v_update ->> 'id')::uuid
      AND user_id = p_user_id
      AND program_id = p_program_id
      AND day_number BETWEEN 8 AND 13;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid round-two coaching task.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  UPDATE public.xhs_coaching_tasks
  SET status = 'completed', completed_at = v_now, updated_at = v_now
  WHERE id = p_task_id AND user_id = p_user_id AND program_id = p_program_id;

  IF p_complete_program THEN
    UPDATE public.xhs_coaching_programs
    SET status = 'completed', completed_at = v_now, updated_at = v_now
    WHERE id = p_program_id AND user_id = p_user_id;
  ELSE
    UPDATE public.xhs_coaching_programs
    SET updated_at = v_now
    WHERE id = p_program_id AND user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'replayed', v_replayed,
    'createdAt', v_created_at,
    'completedAt', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_xhs_coaching_program(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_xhs_coaching_check_in(uuid, uuid, uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_xhs_coaching_program(uuid, jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_xhs_coaching_check_in(uuid, uuid, uuid, jsonb, jsonb, boolean) TO service_role;
