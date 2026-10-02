import { NextResponse } from "next/server";
import { z } from "zod";
import { getXhsCoachingDay } from "@/lib/agent/xhs-coaching";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { refreshUserPatrol } from "@/lib/agent/patrol";
import { apiError } from "@/lib/i18n";

const taskUpdateSchema = z.object({
  status: z.enum(["todo", "in_progress", "skipped"])
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { taskId } = await params;
    const input = taskUpdateSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: apiError(request.headers, "陪跑任务持久化不可用。", "Coaching task persistence is unavailable.") }, { status: 503 });
    const { data: task, error: taskError } = await admin
      .from("xhs_coaching_tasks")
      .select("id, program_id, day_number, status")
      .eq("id", taskId)
      .eq("user_id", userId)
      .maybeSingle();
    if (taskError) throw taskError;
    if (!task) return NextResponse.json({ error: apiError(request.headers, "任务不存在。", "Task not found.") }, { status: 404 });
    if (String(task.status) === "completed") {
      return NextResponse.json({ error: apiError(request.headers, "已完成的任务不能改回其他状态。", "A completed task cannot be moved back to another status.") }, { status: 409 });
    }
    if (input.status === "skipped" && [0, 7, 14].includes(Number(task.day_number))) {
      return NextResponse.json({ error: apiError(request.headers, "Day 0、Day 7 和 Day 14 是闭环检查点，不能跳过。", "Day 0, Day 7, and Day 14 are checkpoint days and cannot be skipped.") }, { status: 409 });
    }
    const { data: program, error: programError } = await admin
      .from("xhs_coaching_programs")
      .select("start_date, timezone, status")
      .eq("id", task.program_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (programError) throw programError;
    if (!program) return NextResponse.json({ error: apiError(request.headers, "陪跑计划不存在。", "Coaching program not found.") }, { status: 404 });
    if (String(program.status) !== "active") {
      return NextResponse.json({ error: apiError(request.headers, "陪跑计划当前不是进行中，不能更新任务。", "The coaching program is not active, so tasks cannot be updated.") }, { status: 409 });
    }
    if (Number(task.day_number) > getXhsCoachingDay(String(program.start_date), String(program.timezone))) {
      return NextResponse.json({ error: `Day ${String(task.day_number)} 尚未开放。` }, { status: 409 });
    }
    if (input.status !== "todo") {
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
    }
    const { data, error } = await admin
      .from("xhs_coaching_tasks")
      .update({ status: input.status, updated_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("user_id", userId)
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: apiError(request.headers, "任务不存在。", "Task not found.") }, { status: 404 });
    await refreshUserPatrol(admin, userId).catch((patrolError) => {
      console.error(`[xhs/coaching] patrol refresh failed for user=${userId}:`, patrolError);
    });
    return NextResponse.json({ task: { id: String(data.id), status: String(data.status) } });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "请先登录再更新任务。", "Please log in before updating tasks.") }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法更新任务。" }, { status: 400 });
  }
}
