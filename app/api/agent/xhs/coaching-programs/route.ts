import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildXhsCoachingTasks,
  compareXhsCheckpoint,
  compareXhsDiagnoses,
  getXhsIsoDay,
  getXhsPrimaryBaselineValue,
  getXhsCoachingDay,
  isValidXhsCoachingTimezone,
  type XhsDiagnosisReport
} from "@/lib/agent/xhs-coaching";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { refreshUserPatrol } from "@/lib/agent/patrol";
import { apiError } from "@/lib/i18n";

const createProgramSchema = z.object({
  diagnosisId: z.string().uuid(),
  startDate: z.string().date().optional(),
  timezone: z.string().trim().min(1).max(80).default("Asia/Shanghai")
    .refine(isValidXhsCoachingTimezone, "请选择有效时区。")
});

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) return NextResponse.json({ program: null, persisted: false });
      return NextResponse.json({ error: persistenceUnavailableMessage("Xiaohongshu coaching") }, { status: 503 });
    }
    const { data: program, error } = await admin
      .from("xhs_coaching_programs")
      .select("id, workflow_id, operating_program_id, baseline_diagnosis_id, latest_diagnosis_id, status, start_date, timezone, objective, target_audience, baseline, created_at, updated_at, completed_at")
      .eq("user_id", userId)
      .in("status", ["active", "paused", "completed"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!program) return NextResponse.json({ program: null, persisted: true });

    const [{ data: tasks, error: taskError }, { data: checkIns, error: checkInError }, diagnoses] = await Promise.all([
      admin
        .from("xhs_coaching_tasks")
        .select("id, day_number, phase, task_kind, title, reason, deliverable, due_at, target_metric, single_variable, completion_proof, workbench_href, status, completed_at, updated_at")
        .eq("user_id", userId)
        .eq("program_id", program.id)
        .order("day_number", { ascending: true }),
      admin
        .from("xhs_coaching_check_ins")
        .select("id, task_id, proof, observed_metrics, reflection, created_at")
        .eq("user_id", userId)
        .eq("program_id", program.id)
        .order("created_at", { ascending: false }),
      loadDiagnosisPair(admin, userId, String(program.baseline_diagnosis_id), program.latest_diagnosis_id ? String(program.latest_diagnosis_id) : null)
    ]);
    if (taskError) throw taskError;
    if (checkInError) throw checkInError;
    const baselineReport = diagnoses.baseline?.report ?? null;
    const latestReport = diagnoses.latest?.report ?? null;
    const day13 = (tasks ?? []).find((item) => Number(item.day_number) === 13);
    const day13ClosedAt = day13 && ["completed", "skipped"].includes(String(day13.status))
      ? timestampOrNull(day13.updated_at)
      : null;
    const latestDiagnosedAt = timestampOrNull(diagnoses.latest?.createdAt);
    const finalRediagnosisReady = Boolean(
      program.latest_diagnosis_id !== program.baseline_diagnosis_id
      && day13ClosedAt !== null
      && latestDiagnosedAt !== null
      && latestDiagnosedAt > day13ClosedAt
    );
    const baselineValue = baselineReport ? getXhsPrimaryBaselineValue(baselineReport) : null;
    const day7Value = checkpointValue(7, tasks ?? [], checkIns ?? []);
    const day14CheckInValue = checkpointValue(14, tasks ?? [], checkIns ?? []);
    const day14DiagnosisValue = latestReport && program.latest_diagnosis_id !== program.baseline_diagnosis_id
      ? getXhsPrimaryBaselineValue(latestReport, baselineReport?.primaryProblem.stage)
      : null;
    return NextResponse.json({
      program: {
        id: String(program.id),
        workflowId: String(program.workflow_id),
        operatingProgramId: program.operating_program_id ? String(program.operating_program_id) : null,
        baselineDiagnosisId: String(program.baseline_diagnosis_id),
        latestDiagnosisId: program.latest_diagnosis_id ? String(program.latest_diagnosis_id) : null,
        finalRediagnosisReady,
        status: String(program.status),
        startDate: String(program.start_date),
        timezone: String(program.timezone),
        objective: String(program.objective),
        targetAudience: String(program.target_audience),
        currentDay: getXhsCoachingDay(String(program.start_date), String(program.timezone)),
        baseline: program.baseline,
        comparison: finalRediagnosisReady && baselineReport && latestReport
          ? compareXhsDiagnoses(baselineReport, latestReport)
          : null,
        checkpoints: {
          day7: compareXhsCheckpoint(7, baselineValue, day7Value),
          day14: compareXhsCheckpoint(14, baselineValue, finalRediagnosisReady ? day14DiagnosisValue ?? day14CheckInValue : null)
        },
        tasks: (tasks ?? []).map(mapTask),
        checkIns: (checkIns ?? []).map((item) => ({
          id: String(item.id),
          taskId: String(item.task_id),
          proof: item.proof,
          observedMetrics: item.observed_metrics,
          reflection: String(item.reflection ?? ""),
          createdAt: String(item.created_at)
        }))
      },
      persisted: true
    });
  } catch (error) {
    return coachingError(error, request.headers, "无法读取 14 天陪跑计划。", "Could not load the 14-day coaching program.");
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = createProgramSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (!isLocalMockMode()) {
        return NextResponse.json({ error: persistenceUnavailableMessage("Xiaohongshu coaching") }, { status: 503 });
      }
      return NextResponse.json({ error: apiError(request.headers, "本地预览未配置持久化，不能创建需要打卡的 14 天计划。", "Persistence is not configured locally, so check-in based 14-day programs cannot be created.") }, { status: 503 });
    }
    const { data: existing } = await admin
      .from("xhs_coaching_programs")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: apiError(request.headers, "已有进行中的小红书 14 天陪跑计划。", "An active Xiaohongshu 14-day coaching program already exists."), programId: existing.id }, { status: 409 });
    }

    const { data: diagnosis, error: diagnosisError } = await admin
      .from("xhs_diagnoses")
      .select("id, workflow_id, operating_program_id, input, report")
      .eq("id", input.diagnosisId)
      .eq("user_id", userId)
      .maybeSingle();
    if (diagnosisError) throw diagnosisError;
    if (!diagnosis?.workflow_id) return NextResponse.json({ error: apiError(request.headers, "诊断不存在或未关联小红书工作流。", "The diagnosis does not exist or is not linked to a Xiaohongshu workflow.") }, { status: 404 });

    const report = diagnosis.report as unknown as XhsDiagnosisReport;
    const diagnosisInput = diagnosis.input && typeof diagnosis.input === "object"
      ? diagnosis.input as Record<string, unknown>
      : {};
    const programId = crypto.randomUUID();
    const startDate = input.startDate ?? getXhsIsoDay(input.timezone);
    const tasks = buildXhsCoachingTasks({
      programId,
      workflowId: String(diagnosis.workflow_id),
      diagnosisId: String(diagnosis.id),
      diagnosis: report,
      startDate,
      timezone: input.timezone
    });
    const baselineCompletedAt = new Date().toISOString();
    const baselineTask = tasks.find((task) => task.dayNumber === 0);
    if (!baselineTask) throw new Error("Day 0 基线任务生成失败。");
    const taskRows = tasks.map((task) => ({
      id: task.id,
      program_id: programId,
      day_number: task.dayNumber,
      phase: task.phase,
      task_kind: task.kind,
      title: task.title,
      reason: task.reason,
      deliverable: task.deliverable,
      due_at: task.dueAt,
      target_metric: task.targetMetric,
      single_variable: task.singleVariable,
      completion_proof: task.completionProof,
      workbench_href: task.workbenchHref,
      status: task.dayNumber === 0 ? "completed" : task.status,
      completed_at: task.dayNumber === 0 ? baselineCompletedAt : null
    }));
    const { error: createProgramError } = await admin.rpc("create_xhs_coaching_program", {
      p_user_id: userId,
      p_program: {
        id: programId,
        workflow_id: diagnosis.workflow_id,
        operating_program_id: diagnosis.operating_program_id,
        baseline_diagnosis_id: diagnosis.id,
        latest_diagnosis_id: diagnosis.id,
        start_date: startDate,
        timezone: input.timezone,
        objective: String(diagnosisInput.businessGoal ?? ""),
        target_audience: String(diagnosisInput.targetAudience ?? ""),
        baseline: report
      },
      p_tasks: taskRows,
      p_baseline_check_in: {
      id: crypto.randomUUID(),
      program_id: programId,
      task_id: baselineTask.id,
      proof: {
        type: "text",
        value: `diagnosis:${String(diagnosis.id)}`,
        label: "Day 0 基线诊断"
      },
      observed_metrics: {},
      reflection: "系统已保存 Day 0 诊断、资料包状态与个人成熟笔记分位。",
      created_at: baselineCompletedAt
      }
    });
    if (createProgramError) throw createProgramError;
    await refreshUserPatrol(admin, userId).catch((error) => {
      console.error(`[xhs/coaching] patrol refresh failed for user=${userId}:`, error);
    });
    return NextResponse.json({
      program: {
        id: programId,
        workflowId: String(diagnosis.workflow_id),
        baselineDiagnosisId: String(diagnosis.id),
        status: "active",
        startDate,
        currentDay: 0,
        tasks: tasks.map((task) => task.dayNumber === 0
          ? { ...task, status: "completed" as const, completedAt: baselineCompletedAt }
          : task)
      },
      persisted: true
    }, { status: 201 });
  } catch (error) {
    return coachingError(error, request.headers, "无法创建 14 天陪跑计划。", "Could not create the 14-day coaching program.");
  }
}

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

async function loadDiagnosisPair(admin: AdminClient, userId: string, baselineId: string, latestId: string | null) {
  const ids = Array.from(new Set([baselineId, latestId].filter((id): id is string => Boolean(id))));
  const { data } = await admin
    .from("xhs_diagnoses")
    .select("id, report, created_at")
    .eq("user_id", userId)
    .in("id", ids);
  const byId = new Map((data ?? []).map((row) => [String(row.id), {
    report: row.report as unknown as XhsDiagnosisReport,
    createdAt: String(row.created_at)
  }]));
  return { baseline: byId.get(baselineId) ?? null, latest: latestId ? byId.get(latestId) ?? null : null };
}

function timestampOrNull(value: unknown): number | null {
  if (!value) return null;
  const timestamp = new Date(String(value)).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function mapTask(item: Record<string, unknown>) {
  return {
    id: String(item.id),
    dayNumber: Number(item.day_number),
    phase: String(item.phase),
    kind: String(item.task_kind),
    title: String(item.title),
    reason: String(item.reason),
    deliverable: String(item.deliverable),
    dueAt: String(item.due_at),
    targetMetric: String(item.target_metric),
    singleVariable: String(item.single_variable),
    completionProof: String(item.completion_proof),
    workbenchHref: String(item.workbench_href),
    status: String(item.status),
    completedAt: item.completed_at ? String(item.completed_at) : null
  };
}

function checkpointValue(day: 7 | 14, tasks: Array<Record<string, unknown>>, checkIns: Array<Record<string, unknown>>): number | null {
  const task = tasks.find((item) => Number(item.day_number) === day);
  if (!task) return null;
  const checkIn = checkIns.find((item) => String(item.task_id) === String(task.id));
  const metrics = checkIn?.observed_metrics && typeof checkIn.observed_metrics === "object"
    ? checkIn.observed_metrics as Record<string, unknown>
    : {};
  const value = metrics[String(task.target_metric)];
  return typeof value === "number" ? value : null;
}

function coachingError(error: unknown, headers: Headers, fallbackZh: string, fallbackEn: string) {
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: apiError(headers, "请先登录再使用小红书陪跑。", "Please log in before using Xiaohongshu coaching.") }, { status: 401 });
  }
  const message = error instanceof Error ? error.message : "";
  const migrationMissing = /xhs_coaching_|xhs_diagnoses|relation .* does not exist/i.test(message);
  return NextResponse.json({ error: migrationMissing ? "小红书陪跑存储尚未上线，请先执行 079_xhs_diagnosis_coaching.sql。" : apiError(headers, message || fallbackZh, fallbackEn) }, { status: migrationMissing ? 503 : 400 });
}
