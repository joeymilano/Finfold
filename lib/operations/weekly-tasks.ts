import type { createSupabaseAdminClient } from "@/lib/supabase";
import type { OperatingPlatform, OperatingProgram } from "@/lib/operations/program";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type OperatingWeeklyTaskStatus = "open" | "done" | "missed" | "superseded";
export type OperatingWeeklyTaskState = "completed" | "overdue" | "today" | "scheduled";

export type OperatingWeeklyTask = {
  id: string;
  operatingProgramId: string;
  platform: OperatingPlatform;
  weekStart: string;
  slotIndex: number;
  cadenceSnapshot: number;
  status: OperatingWeeklyTaskStatus;
  state: OperatingWeeklyTaskState;
  dueAt: string;
  completedAt: string | null;
  completedOutputId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OperatingWeeklyQueue = {
  programId: string;
  platform: OperatingPlatform;
  cadencePerWeek: number;
  weekStart: string;
  nextWeekStart: string;
  completedThisWeek: number;
  scheduledThisWeek: number;
  overdueCount: number;
  nextWeekCount: number;
  tasks: OperatingWeeklyTask[];
};

type OperatingWeeklyTaskRow = {
  id: string;
  operating_program_id: string;
  platform: OperatingPlatform;
  week_start: string;
  slot_index: number;
  cadence_snapshot: number;
  status: OperatingWeeklyTaskStatus;
  due_at: string;
  completed_at: string | null;
  completed_output_id: string | null;
  created_at: string;
  updated_at: string;
};

const TASK_FIELDS = [
  "id",
  "operating_program_id",
  "platform",
  "week_start",
  "slot_index",
  "cadence_snapshot",
  "status",
  "due_at",
  "completed_at",
  "completed_output_id",
  "created_at",
  "updated_at"
].join(", ");

const OPERATING_UTC_OFFSET_HOURS = 8;

// These are operational deadlines, not claims about an algorithmic "best
// time" to post. Spreading the slots across weekdays prevents the queue from
// asking a user to burst-post several items on one day.
const CADENCE_DAY_OFFSETS: Record<number, number[]> = {
  2: [1, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4]
};

export type InitialOperatingWeekSlot = {
  slotIndex: number;
  cadenceSnapshot: number;
  status: "open" | "done";
  dueAt: string;
  completedAt: string | null;
  completedOutputId: string | null;
};

export function getOperatingWeekStart(now: Date): string {
  const local = new Date(now.getTime() + OPERATING_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  const mondayOffset = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - mondayOffset);
  return formatUtcDate(local);
}

export function getNextOperatingWeekStart(weekStart: string): string {
  return addDateDays(weekStart, 7);
}

export function buildOperatingWeekSlots(
  cadencePerWeek: number,
  weekStart: string
): Array<{ slotIndex: number; dueAt: string }> {
  const offsets = CADENCE_DAY_OFFSETS[cadencePerWeek];
  if (!offsets) throw new Error("Operating cadence must be between 2 and 5 posts per week.");
  return offsets.map((dayOffset, slotIndex) => ({
    slotIndex,
    // 18:00 Asia/Shanghai. The operating program currently supports
    // Xiaohongshu only, so this is a stable, DST-free operating timezone.
    dueAt: localDateTimeToIso(addDateDays(weekStart, dayOffset), 18)
  }));
}

export function deriveOperatingTaskState(
  task: Pick<OperatingWeeklyTask, "status" | "dueAt">,
  now = new Date()
): OperatingWeeklyTaskState {
  if (task.status === "done") return "completed";
  const due = new Date(task.dueAt);
  if (due.getTime() <= now.getTime()) return "overdue";
  return operatingLocalDate(due) === operatingLocalDate(now) ? "today" : "scheduled";
}

export function planInitialOperatingWeek(
  cadencePerWeek: number,
  weekStart: string,
  publications: Array<{ id: string; publishedAt: string }>,
  now = new Date()
): InitialOperatingWeekSlot[] {
  const planned: InitialOperatingWeekSlot[] = [];
  for (const [index, slot] of buildOperatingWeekSlots(cadencePerWeek, weekStart).entries()) {
    const publication = publications[index];
    if (publication) {
      planned.push({
        slotIndex: slot.slotIndex,
        cadenceSnapshot: cadencePerWeek,
        status: "done",
        dueAt: slot.dueAt,
        completedAt: publication.publishedAt,
        completedOutputId: publication.id
      });
      continue;
    }
    if (new Date(slot.dueAt).getTime() <= now.getTime()) continue;
    planned.push({
      slotIndex: slot.slotIndex,
      cadenceSnapshot: cadencePerWeek,
      status: "open",
      dueAt: slot.dueAt,
      completedAt: null,
      completedOutputId: null
    });
  }
  return planned;
}

export async function loadOperatingWeeklyQueue(
  admin: AdminClient,
  userId: string,
  now = new Date()
): Promise<OperatingWeeklyQueue | null> {
  const { data, error } = await admin
    .from("operating_programs")
    .select("id, platform, status, offer, audience, objective, qualified_lead_rule, watchlist, cadence_per_week, baseline, created_at, updated_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const program: OperatingProgram = {
    id: String(data.id),
    platform: data.platform as OperatingPlatform,
    status: "active",
    offer: data.offer as OperatingProgram["offer"],
    audience: data.audience as OperatingProgram["audience"],
    objective: data.objective as OperatingProgram["objective"],
    qualifiedLeadRule: data.qualified_lead_rule as OperatingProgram["qualifiedLeadRule"],
    watchlist: data.watchlist as OperatingProgram["watchlist"],
    cadencePerWeek: Number(data.cadence_per_week),
    baseline: data.baseline as OperatingProgram["baseline"],
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at)
  };
  return ensureOperatingProgramWeeklyTasks(admin, userId, program, now);
}

export async function ensureOperatingProgramWeeklyTasks(
  admin: AdminClient,
  userId: string,
  program: OperatingProgram,
  now = new Date()
): Promise<OperatingWeeklyQueue | null> {
  if (program.status !== "active") return null;

  const weekStart = getOperatingWeekStart(now);
  const nextWeekStart = getNextOperatingWeekStart(weekStart);
  const nextWeekEnd = getNextOperatingWeekStart(nextWeekStart);
  const nextSlots = buildOperatingWeekSlots(program.cadencePerWeek, nextWeekStart);

  // A missed calendar-week commitment is preserved as an execution fact, but
  // it must not block every future week forever. The new week gets a fresh
  // cadence while the missed row remains available for later business review.
  const { error: closePreviousError } = await admin
    .from("operating_program_weekly_tasks")
    .update({ status: "missed", updated_at: now.toISOString() })
    .eq("user_id", userId)
    .eq("operating_program_id", program.id)
    .eq("status", "open")
    .lt("week_start", weekStart);
  if (closePreviousError) throw closePreviousError;

  const [{ data: existingRows, error: existingError }, { data: publishedRows, error: publishedError }] = await Promise.all([
    admin
      .from("operating_program_weekly_tasks")
      .select(TASK_FIELDS)
      .eq("user_id", userId)
      .eq("operating_program_id", program.id)
      .gte("week_start", weekStart)
      .lte("week_start", nextWeekStart)
      .order("week_start", { ascending: true })
      .order("slot_index", { ascending: true }),
    admin
      .from("kit_outputs")
      .select("id, published_at")
      .eq("user_id", userId)
      .eq("platform", program.platform)
      .not("published_at", "is", null)
      .gte("published_at", localDateTimeToIso(weekStart, 0))
      .lt("published_at", localDateTimeToIso(nextWeekStart, 0))
      .order("published_at", { ascending: true })
  ]);
  if (existingError) throw existingError;
  if (publishedError) throw publishedError;

  let rows = (existingRows ?? []) as unknown as OperatingWeeklyTaskRow[];
  const currentRows = rows.filter((row) => row.week_start === weekStart);
  const nextRows = rows.filter((row) => row.week_start === nextWeekStart);
  const publications = (publishedRows ?? []).filter((row) => row.published_at);

  if (currentRows.length === 0) {
    const initialRows = planInitialOperatingWeek(
      program.cadencePerWeek,
      weekStart,
      publications.map((publication) => ({
        id: String(publication.id),
        publishedAt: String(publication.published_at)
      })),
      now
    ).map((slot) => ({
        id: crypto.randomUUID(),
        user_id: userId,
        operating_program_id: program.id,
        platform: program.platform,
        week_start: weekStart,
        slot_index: slot.slotIndex,
        cadence_snapshot: slot.cadenceSnapshot,
        status: slot.status,
        due_at: slot.dueAt,
        completed_at: slot.completedAt,
        completed_output_id: slot.completedOutputId,
        completion_source: slot.status === "done" ? "output_posted" : null,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      }));
    if (initialRows.length > 0) {
      const { error } = await admin
        .from("operating_program_weekly_tasks")
        .upsert(initialRows, {
          onConflict: "operating_program_id,week_start,slot_index",
          ignoreDuplicates: true
        });
      if (error) throw error;
    }
  }

  // Next week's queue always reflects the latest cadence. Current-week
  // commitments remain stable when a user edits cadence mid-cycle.
  const desiredNextRows = nextSlots.map((slot) => ({
    user_id: userId,
    operating_program_id: program.id,
    platform: program.platform,
    week_start: nextWeekStart,
    slot_index: slot.slotIndex,
    cadence_snapshot: program.cadencePerWeek,
    status: "open",
    due_at: slot.dueAt,
    completed_at: null,
    completed_output_id: null,
    completion_source: null,
    updated_at: now.toISOString()
  }));
  const { error: nextUpsertError } = await admin
    .from("operating_program_weekly_tasks")
    .upsert(desiredNextRows, { onConflict: "operating_program_id,week_start,slot_index" });
  if (nextUpsertError) throw nextUpsertError;

  const excessNextIds = nextRows
    .filter((row) => row.slot_index >= program.cadencePerWeek && row.status === "open")
    .map((row) => row.id);
  if (excessNextIds.length > 0) {
    const { error } = await admin
      .from("operating_program_weekly_tasks")
      .update({ status: "superseded", updated_at: now.toISOString() })
      .eq("user_id", userId)
      .eq("operating_program_id", program.id)
      .in("id", excessNextIds)
      .eq("status", "open");
    if (error) throw error;
  }

  // Re-read after the idempotent upserts, then attach any real publications
  // that were not yet linked (for example after a transient post-event error).
  const { data: reconciledRows, error: reconciledError } = await admin
    .from("operating_program_weekly_tasks")
    .select(TASK_FIELDS)
    .eq("user_id", userId)
    .eq("operating_program_id", program.id)
    .gte("week_start", weekStart)
    .lte("week_start", nextWeekStart)
    .order("week_start", { ascending: true })
    .order("slot_index", { ascending: true });
  if (reconciledError) throw reconciledError;
  rows = (reconciledRows ?? []) as unknown as OperatingWeeklyTaskRow[];
  await attachUnlinkedPublications(admin, userId, program, weekStart, rows, publications, now);

  const [{ data: queueRows, error: queueError }, { data: overdueRows, error: overdueError }] = await Promise.all([
    admin
      .from("operating_program_weekly_tasks")
      .select(TASK_FIELDS)
      .eq("user_id", userId)
      .eq("operating_program_id", program.id)
      .gte("week_start", weekStart)
      .lt("week_start", nextWeekEnd)
      .neq("status", "superseded")
      .order("week_start", { ascending: true })
      .order("slot_index", { ascending: true }),
    admin
      .from("operating_program_weekly_tasks")
      .select(TASK_FIELDS)
      .eq("user_id", userId)
      .eq("operating_program_id", program.id)
      .eq("status", "open")
      .lt("week_start", weekStart)
      .order("due_at", { ascending: true })
      .limit(20)
  ]);
  if (queueError) throw queueError;
  if (overdueError) throw overdueError;

  const uniqueRows = new Map<string, OperatingWeeklyTaskRow>();
  for (const row of [...(overdueRows ?? []), ...(queueRows ?? [])] as unknown as OperatingWeeklyTaskRow[]) {
    uniqueRows.set(row.id, row);
  }
  const tasks = [...uniqueRows.values()]
    .map((row) => mapOperatingWeeklyTask(row, now))
    .sort(compareOperatingTasks);
  const currentTasks = tasks.filter((task) => task.weekStart === weekStart);

  return {
    programId: program.id,
    platform: program.platform,
    cadencePerWeek: program.cadencePerWeek,
    weekStart,
    nextWeekStart,
    completedThisWeek: currentTasks.filter((task) => task.status === "done").length,
    scheduledThisWeek: currentTasks.length,
    overdueCount: tasks.filter((task) => task.state === "overdue").length,
    nextWeekCount: tasks.filter((task) => task.weekStart === nextWeekStart && task.status === "open").length,
    tasks
  };
}

export async function reconcileOperatingTaskAfterPublication(
  admin: AdminClient,
  userId: string,
  platform: OperatingPlatform,
  outputId: string,
  now = new Date()
): Promise<OperatingWeeklyTask | null> {
  const queue = await loadOperatingWeeklyQueue(admin, userId, now);
  if (!queue || queue.platform !== platform) return null;
  return queue.tasks.find((task) => task.completedOutputId === outputId) ?? null;
}

async function attachUnlinkedPublications(
  admin: AdminClient,
  userId: string,
  program: OperatingProgram,
  weekStart: string,
  rows: OperatingWeeklyTaskRow[],
  publications: Array<{ id: unknown; published_at: unknown }>,
  now: Date
): Promise<void> {
  const currentRows = rows.filter((row) => row.week_start === weekStart);
  const linkedOutputs = new Set(
    currentRows.map((row) => row.completed_output_id).filter((value): value is string => Boolean(value))
  );
  const openRows = currentRows
    .filter((row) => row.status === "open")
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
  const occupiedSlots = new Set(currentRows.map((row) => row.slot_index));

  for (const publication of publications) {
    const outputId = String(publication.id);
    if (linkedOutputs.has(outputId)) continue;
    const publishedAt = String(publication.published_at);
    const open = openRows.shift();
    if (open) {
      const { error } = await admin
        .from("operating_program_weekly_tasks")
        .update({
          status: "done",
          completed_at: publishedAt,
          completed_output_id: outputId,
          completion_source: "output_posted",
          updated_at: now.toISOString()
        })
        .eq("id", open.id)
        .eq("user_id", userId)
        .eq("operating_program_id", program.id)
        .eq("status", "open");
      if (error) throw error;
      linkedOutputs.add(outputId);
      continue;
    }

    // If activation happened after all scheduled deadlines, a real post still
    // counts for the current week. Create only the evidence-backed completed
    // slot; never create a retroactive open/failed slot beside it.
    const missingSlot = buildOperatingWeekSlots(program.cadencePerWeek, weekStart)
      .find((slot) => !occupiedSlots.has(slot.slotIndex));
    if (!missingSlot) break;
    const { error } = await admin
      .from("operating_program_weekly_tasks")
      .upsert({
        id: crypto.randomUUID(),
        user_id: userId,
        operating_program_id: program.id,
        platform: program.platform,
        week_start: weekStart,
        slot_index: missingSlot.slotIndex,
        cadence_snapshot: program.cadencePerWeek,
        status: "done",
        due_at: missingSlot.dueAt,
        completed_at: publishedAt,
        completed_output_id: outputId,
        completion_source: "output_posted",
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      }, {
        onConflict: "operating_program_id,week_start,slot_index",
        ignoreDuplicates: true
      });
    if (error) throw error;
    occupiedSlots.add(missingSlot.slotIndex);
    linkedOutputs.add(outputId);
  }
}

function mapOperatingWeeklyTask(row: OperatingWeeklyTaskRow, now: Date): OperatingWeeklyTask {
  const task: OperatingWeeklyTask = {
    id: row.id,
    operatingProgramId: row.operating_program_id,
    platform: row.platform,
    weekStart: row.week_start,
    slotIndex: row.slot_index,
    cadenceSnapshot: row.cadence_snapshot,
    status: row.status,
    state: "scheduled",
    dueAt: row.due_at,
    completedAt: row.completed_at,
    completedOutputId: row.completed_output_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  task.state = deriveOperatingTaskState(task, now);
  return task;
}

function compareOperatingTasks(a: OperatingWeeklyTask, b: OperatingWeeklyTask): number {
  const rank: Record<OperatingWeeklyTaskState, number> = {
    overdue: 0,
    today: 1,
    scheduled: 2,
    completed: 3
  };
  return rank[a.state] - rank[b.state] || a.dueAt.localeCompare(b.dueAt);
}

function operatingLocalDate(date: Date): string {
  return formatUtcDate(new Date(date.getTime() + OPERATING_UTC_OFFSET_HOURS * 60 * 60 * 1000));
}

function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDateDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return formatUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

function localDateTimeToIso(date: string, hour: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - OPERATING_UTC_OFFSET_HOURS)).toISOString();
}
