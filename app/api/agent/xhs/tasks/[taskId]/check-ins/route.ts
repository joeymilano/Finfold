import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildXhsCoachingIdea,
  getXhsCoachingDay,
  getXhsPrimaryBaselineValue,
  resolveXhsRoundTwoPlan,
  updateXhsCoachingWorkbenchHref,
  type XhsDiagnosisReport
} from "@/lib/agent/xhs-coaching";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { refreshUserPatrol } from "@/lib/agent/patrol";
import { apiError } from "@/lib/i18n";

const checkInSchema = z.object({
  proof: z.object({
    type: z.enum(["note_url", "screenshot", "data_import", "workbench_kit", "text"]),
    value: z.string().trim().min(1).max(2000),
    label: z.string().trim().max(200).optional()
  }),
  observedMetrics: z.record(z.string(), z.number().finite()).default({}),
  reflection: z.string().trim().max(4000).default("")
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { taskId } = await params;
    const input = checkInSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: apiError(request.headers, "陪跑打卡持久化不可用。", "Check-in persistence is unavailable.") }, { status: 503 });
    const { data: task, error: taskError } = await admin
      .from("xhs_coaching_tasks")
      .select("id, program_id, status, day_number, task_kind, target_metric, completed_at")
      .eq("id", taskId)
      .eq("user_id", userId)
      .maybeSingle();
    if (taskError) throw taskError;
    if (!task) return NextResponse.json({ error: apiError(request.headers, "任务不存在或不属于当前账号。", "Task not found or not owned by this account.") }, { status: 404 });

    const checkInId = String(task.id);
    const { data: storedCheckIn, error: storedCheckInError } = await admin
      .from("xhs_coaching_check_ins")
      .select("proof, observed_metrics, reflection, created_at")
      .eq("id", checkInId)
      .eq("task_id", task.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (storedCheckInError) throw storedCheckInError;
    const { data: program, error: programError } = await admin
      .from("xhs_coaching_programs")
      .select("id, start_date, timezone, baseline_diagnosis_id, latest_diagnosis_id, baseline, status")
      .eq("id", task.program_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (programError) throw programError;
    if (!program) return NextResponse.json({ error: apiError(request.headers, "陪跑计划不存在或不属于当前账号。", "Coaching program not found or not owned by this account.") }, { status: 404 });
    if (String(task.status) === "completed") {
      if (!storedCheckIn) {
        return NextResponse.json({ error: apiError(request.headers, "这项任务已经完成，但没有找到可重放的完成证明。", "This task is already completed, but no replayable proof of completion was found.") }, { status: 409 });
      }
      const replayInput = checkInSchema.parse({
        proof: storedCheckIn.proof,
        observedMetrics: storedCheckIn.observed_metrics,
        reflection: storedCheckIn.reflection
      });
      const roundTwoPlan = Number(task.day_number) === 7
        ? resolveXhsRoundTwoPlan({
            stage: (program.baseline as unknown as XhsDiagnosisReport).primaryProblem.stage,
            roundOneVariable: (program.baseline as unknown as XhsDiagnosisReport).topActions[0]?.singleVariable ?? "第一轮变量",
            baseline: getXhsPrimaryBaselineValue(program.baseline as unknown as XhsDiagnosisReport),
            current: typeof replayInput.observedMetrics[String(task.target_metric)] === "number"
              ? replayInput.observedMetrics[String(task.target_metric)]
              : null
          })
        : null;
      return NextResponse.json({
        checkIn: {
          id: checkInId,
          taskId: String(task.id),
          programId: String(task.program_id),
          proof: replayInput.proof,
          observedMetrics: replayInput.observedMetrics,
          reflection: replayInput.reflection,
          createdAt: String(storedCheckIn.created_at)
        },
        task: { id: String(task.id), status: "completed", completedAt: task.completed_at ? String(task.completed_at) : null },
        roundTwoPlan,
        replayed: true
      });
    }
    if (String(program.status) !== "active") {
      return NextResponse.json({ error: apiError(request.headers, "陪跑计划当前不是进行中，不能提交完成证明。", "The coaching program is not active, so completion proof cannot be submitted.") }, { status: 409 });
    }
    const currentDay = getXhsCoachingDay(String(program.start_date), String(program.timezone));
    if (Number(task.day_number) > currentDay) {
      return NextResponse.json({ error: `Day ${String(task.day_number)} 将在陪跑日程到达后开放，不能提前提交完成证明。` }, { status: 409 });
    }
    const { data: earlierOpenTask, error: earlierTaskError } = await admin
      .from("xhs_coaching_tasks")
      .select("day_number")
      .eq("program_id", task.program_id)
      .eq("user_id", userId)
      .lt("day_number", task.day_number)
      .in("status", ["todo", "in_progress"])
      .order("day_number", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (earlierTaskError) throw earlierTaskError;
    if (earlierOpenTask) {
      return NextResponse.json({ error: `请先处理 Day ${String(earlierOpenTask.day_number)}，陪跑任务不能跳序。` }, { status: 409 });
    }
    if (Number(task.day_number) === 7 && Object.keys(input.observedMetrics).length === 0) {
      return NextResponse.json({ error: `Day 7 复盘必须填写与 Day 0 同口径的主指标：${String(task.target_metric)}` }, { status: 400 });
    }
    if ((Number(task.day_number) === 7 || Number(task.day_number) === 14) && input.reflection.length === 0) {
      return NextResponse.json({ error: apiError(request.headers, "Day 7 / Day 14 复盘必须记录结论与下一步。", "Day 7 / Day 14 reviews must record a conclusion and the next step.") }, { status: 400 });
    }
    if ((Number(task.day_number) === 7 || Number(task.day_number) === 14) && Object.keys(input.observedMetrics).length > 0) {
      const metricNames = Object.keys(input.observedMetrics);
      if (metricNames.length !== 1 || metricNames[0] !== String(task.target_metric)) {
        return NextResponse.json({ error: `复盘指标必须使用任务定义的同一口径：${String(task.target_metric)}` }, { status: 400 });
      }
    }
    if (Number(task.day_number) === 14 || String(task.task_kind) === "rediagnose") {
      const [{ data: latestDiagnosis, error: diagnosisError }, { data: day13, error: day13Error }] = await Promise.all([
        program?.latest_diagnosis_id
          ? admin.from("xhs_diagnoses").select("created_at").eq("id", program.latest_diagnosis_id).eq("user_id", userId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        admin.from("xhs_coaching_tasks").select("status, updated_at").eq("program_id", task.program_id).eq("user_id", userId).eq("day_number", 13).maybeSingle()
      ]);
      if (diagnosisError) throw diagnosisError;
      if (day13Error) throw day13Error;
      const latestTime = latestDiagnosis?.created_at ? new Date(String(latestDiagnosis.created_at)).getTime() : Number.NaN;
      const day13Time = day13?.updated_at ? new Date(String(day13.updated_at)).getTime() : Number.NaN;
      const finalReady = Boolean(
        program
        && program.latest_diagnosis_id
        && String(program.latest_diagnosis_id) !== String(program.baseline_diagnosis_id)
        && day13
        && ["completed", "skipped"].includes(String(day13.status))
        && Number.isFinite(latestTime)
        && Number.isFinite(day13Time)
        && latestTime > day13Time
      );
      if (!finalReady) {
        return NextResponse.json({ error: apiError(request.headers, "Day 14 必须先导入新数据并完成重新诊断，再提交最终复盘。", "Day 14 requires a fresh data import and re-diagnosis before the final review.") }, { status: 409 });
      }
    }

    const effectiveInput = storedCheckIn
      ? checkInSchema.parse({
          proof: storedCheckIn.proof,
          observedMetrics: storedCheckIn.observed_metrics,
          reflection: storedCheckIn.reflection
        })
      : input;
    const now = new Date().toISOString();
    let roundTwoPlan = null;
    const roundTwoUpdates: Array<{
      id: string;
      single_variable: string;
      target_metric: string;
      reason: string;
      workbench_href: string;
    }> = [];
    if (Number(task.day_number) === 7) {
      const baseline = program.baseline as unknown as XhsDiagnosisReport;
      const current = effectiveInput.observedMetrics[String(task.target_metric)];
      roundTwoPlan = resolveXhsRoundTwoPlan({
        stage: baseline.primaryProblem.stage,
        roundOneVariable: baseline.topActions[0]?.singleVariable ?? "第一轮变量",
        baseline: getXhsPrimaryBaselineValue(baseline),
        current: typeof current === "number" ? current : null
      });
      const { data: roundTwoTasks, error: roundTwoLoadError } = await admin
        .from("xhs_coaching_tasks")
        .select("id, day_number, task_kind, title, reason, workbench_href")
        .eq("program_id", task.program_id)
        .eq("user_id", userId)
        .gte("day_number", 8)
        .lte("day_number", 13)
        .order("day_number", { ascending: true });
      if (roundTwoLoadError) throw roundTwoLoadError;
      for (const roundTwoTask of roundTwoTasks ?? []) {
        const isWorkbenchTask = ["plan", "create"].includes(String(roundTwoTask.task_kind));
        const guidance = buildXhsCoachingIdea(
          baseline,
          roundTwoPlan.variable,
          `${String(roundTwoTask.title)}\nDay 7 决策：${roundTwoPlan.reason}`
        );
        roundTwoUpdates.push({
          id: String(roundTwoTask.id),
          single_variable: roundTwoPlan.variable,
          target_metric: roundTwoPlan.targetMetric,
          reason: Number(roundTwoTask.day_number) === 8
            ? roundTwoPlan.reason
            : String(roundTwoTask.reason),
          workbench_href: isWorkbenchTask
            ? updateXhsCoachingWorkbenchHref(String(roundTwoTask.workbench_href), guidance)
            : String(roundTwoTask.workbench_href)
        });
      }
    }

    const { data: completion, error: completionError } = await admin.rpc("complete_xhs_coaching_check_in", {
      p_user_id: userId,
      p_task_id: task.id,
      p_program_id: task.program_id,
      p_check_in: {
        proof: effectiveInput.proof,
        observed_metrics: effectiveInput.observedMetrics,
        reflection: effectiveInput.reflection,
        created_at: now
      },
      p_round_two_updates: roundTwoUpdates,
      p_complete_program: Number(task.day_number) === 14 || String(task.task_kind) === "rediagnose"
    });
    if (completionError) throw completionError;
    const completionResult = completion && typeof completion === "object"
      ? completion as { replayed?: boolean; createdAt?: string; completedAt?: string }
      : {};
    let responseInput = effectiveInput;
    if (completionResult.replayed && !storedCheckIn) {
      const { data: durableCheckIn, error: durableCheckInError } = await admin
        .from("xhs_coaching_check_ins")
        .select("proof, observed_metrics, reflection")
        .eq("id", checkInId)
        .eq("task_id", task.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (durableCheckInError || !durableCheckIn) throw durableCheckInError ?? new Error("无法读取已保存的完成证明。");
      responseInput = checkInSchema.parse({
        proof: durableCheckIn.proof,
        observedMetrics: durableCheckIn.observed_metrics,
        reflection: durableCheckIn.reflection
      });
    }
    const durableCreatedAt = completionResult.createdAt ?? storedCheckIn?.created_at;
    const checkInCreatedAt = durableCreatedAt ? String(durableCreatedAt) : now;
    const completedAt = completionResult.completedAt ? String(completionResult.completedAt) : now;

    await refreshUserPatrol(admin, userId).catch((error) => {
      console.error(`[xhs/coaching] patrol refresh failed for user=${userId}:`, error);
    });

    return NextResponse.json({
      checkIn: {
        id: checkInId,
        taskId: String(task.id),
        programId: String(task.program_id),
        proof: responseInput.proof,
        observedMetrics: responseInput.observedMetrics,
        reflection: responseInput.reflection,
        createdAt: checkInCreatedAt
      },
      task: { id: String(task.id), status: "completed", completedAt },
      roundTwoPlan,
      replayed: completionResult.replayed === true
    }, { status: completionResult.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "请先登录再提交陪跑证明。", "Please log in before submitting coaching proof.") }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法提交陪跑证明。" }, { status: 400 });
  }
}
