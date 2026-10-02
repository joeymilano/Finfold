import type { SubagentEvent } from "@/lib/agent/subagents";
import { workRecordCollaboration } from "@/lib/agent/work-record";

/**
 * Client-side view state for subagent collaboration. Mirrors the server's
 * Work Record collaboration block so the live SSE stream and the restored
 * history render through one component without any new surface area.
 */

export type CollaborationTaskView = {
  id: string;
  kind: string;
  label: string;
  status: "running" | "completed" | "failed" | "cancelled";
  durationMs?: number;
  evidenceCount?: number;
  summary?: string;
};

export type CollaborationGroupView = {
  id: string;
  status: "running" | "completed" | "partial" | "failed" | "cancelled";
  tasks: CollaborationTaskView[];
};

export type CollaborationViewState = {
  groups: CollaborationGroupView[];
};

/** Mutable accumulator fed by SSE events during a live run. */
export function createCollaborationViewState(): {
  apply: (event: SubagentEvent) => void;
  snapshot: () => CollaborationViewState;
} {
  const groups: CollaborationGroupView[] = [];
  const tasks = new Map<string, CollaborationTaskView>();
  const groupOf = (id: string) => groups.find((group) => group.id === id);
  const key = (groupId: string, taskId: string) => `${groupId}:${taskId}`;

  return {
    apply(event) {
      switch (event.type) {
        case "subagent_group_started":
          groups.push({ id: event.groupId, status: "running", tasks: [] });
          break;
        case "subagent_task_started": {
          const group = groupOf(event.groupId);
          if (!group) break;
          const task: CollaborationTaskView = {
            id: event.taskId,
            kind: event.kind,
            label: event.label,
            status: "running"
          };
          group.tasks.push(task);
          tasks.set(key(event.groupId, event.taskId), task);
          break;
        }
        case "subagent_task_completed": {
          const task = tasks.get(key(event.groupId, event.taskId));
          if (!task) break;
          task.status = "completed";
          task.durationMs = event.durationMs;
          task.evidenceCount = event.evidenceCount;
          task.summary = event.summary;
          break;
        }
        case "subagent_task_failed": {
          const task = tasks.get(key(event.groupId, event.taskId));
          if (!task) break;
          task.status = "failed";
          task.durationMs = event.durationMs;
          break;
        }
        case "subagent_group_completed": {
          const group = groupOf(event.groupId);
          if (!group) break;
          group.status = event.failed === 0
            ? "completed"
            : event.completed > 0
              ? "partial"
              : "failed";
          break;
        }
      }
    },
    snapshot: () => ({ groups: groups.map((group) => ({ ...group, tasks: group.tasks.map((task) => ({ ...task })) })) })
  };
}

/** Restores the view from a persisted AgentWorkRecord (history reload). */
export function collaborationFromWorkRecord(work: unknown): CollaborationViewState | undefined {
  const groups = workRecordCollaboration(work);
  if (groups.length === 0) return undefined;
  return {
    groups: groups.map((group) => ({
      id: group.id,
      status: group.status,
      tasks: group.tasks.map((task) => ({
        id: task.id,
        kind: task.kind,
        label: task.label,
        status: task.status,
        ...(task.durationMs !== undefined ? { durationMs: task.durationMs } : {}),
        ...(task.evidenceCount !== undefined ? { evidenceCount: task.evidenceCount } : {}),
        ...(task.summary !== undefined ? { summary: task.summary } : {})
      }))
    }))
  };
}

export function collaborationTaskCount(view: CollaborationViewState): number {
  return view.groups.reduce((total, group) => total + group.tasks.length, 0);
}

export function collaborationIsRunning(view: CollaborationViewState): boolean {
  return view.groups.some((group) => group.status === "running");
}

export type CollaborationSummary = {
  tone: "running" | "complete" | "partial" | "failed" | "cancelled";
  labelZh: string;
  labelEn: string;
  doneCount: number;
  totalCount: number;
  durationMs?: number;
};

/** Copy for the one-line strip. Icons and text always appear together. */
export function summarizeCollaboration(view: CollaborationViewState): CollaborationSummary | null {
  const groups = view.groups;
  if (groups.length === 0) return null;
  const total = collaborationTaskCount(view);
  const done = view.groups.reduce(
    (count, group) => count + group.tasks.filter((task) => task.status === "completed").length,
    0
  );
  const worst = groups.some((group) => group.status === "running")
    ? "running"
    : groups.some((group) => group.status === "cancelled")
      ? "cancelled"
      : groups.some((group) => group.status === "partial")
        ? "partial"
        : groups.some((group) => group.status === "failed")
          ? "failed"
          : "complete";
  const durations = view.groups
    .map((group) => group.tasks.reduce((max, task) => Math.max(max, task.durationMs ?? 0), 0))
    .filter((ms) => ms > 0);
  const durationMs = durations.length > 0 ? Math.max(...durations) : undefined;
  const seconds = durationMs !== undefined ? Math.max(1, Math.round(durationMs / 1000)) : null;

  switch (worst) {
    case "running":
      return {
        tone: "running",
        labelZh: `${total} 个子智能体正在协作`,
        labelEn: `${total} specialists collaborating`,
        doneCount: done,
        totalCount: total
      };
    case "partial":
      return {
        tone: "partial",
        labelZh: `${done} 项完成，${total - done} 项未完成`,
        labelEn: `${done} done, ${total - done} unfinished`,
        doneCount: done,
        totalCount: total
      };
    case "failed":
      return {
        tone: "failed",
        labelZh: "并行分析未完成",
        labelEn: "Parallel analysis unfinished",
        doneCount: done,
        totalCount: total
      };
    case "cancelled":
      return {
        tone: "cancelled",
        labelZh: "协作已取消",
        labelEn: "Collaboration cancelled",
        doneCount: done,
        totalCount: total
      };
    default:
      return {
        tone: "complete",
        labelZh: seconds !== null ? `${total} 个子智能体已完成 · ${seconds} 秒` : `${total} 个子智能体已完成`,
        labelEn: seconds !== null ? `${total} specialists done · ${seconds}s` : `${total} specialists done`,
        doneCount: done,
        totalCount: total,
        ...(durationMs !== undefined ? { durationMs } : {})
      };
  }
}
