"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Lock
} from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { buttonStyles } from "@/components/ui/Button";
import type {
  OperatingWeeklyQueue,
  OperatingWeeklyTask
} from "@/lib/operations/weekly-tasks";

export function OperatingWeeklyQueueCard({
  queue,
  locale
}: {
  queue: OperatingWeeklyQueue;
  locale: "zh" | "en";
}) {
  const en = locale === "en";
  const hasCurrentCommitments = queue.scheduledThisWeek > 0;
  const currentAndOverdue = queue.tasks.filter((task) =>
    task.weekStart === queue.weekStart || task.state === "overdue"
  );
  const visibleTasks = currentAndOverdue.length > 0
    ? currentAndOverdue.slice(0, 6)
    : queue.tasks.filter((task) => task.weekStart === queue.nextWeekStart).slice(0, 1);
  const nextOpen = queue.tasks.find((task) => task.status === "open");

  return (
    <Panel className="p-5 md:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={queue.overdueCount > 0 ? "warn" : "success"} dot>
              {queue.overdueCount > 0
                ? en ? `${queue.overdueCount} overdue` : `${queue.overdueCount} 个逾期`
                : !hasCurrentCommitments
                  ? en ? "Starts next week" : "下周开始"
                : en ? "On cadence" : "节奏正常"}
            </Tag>
            <span className="text-xs font-bold text-fg-muted">
              {en ? `${queue.cadencePerWeek} real posts per week` : `每周 ${queue.cadencePerWeek} 篇真实发布`}
            </span>
          </div>
          <h2 className="mt-3 text-xl font-black text-fg md:text-2xl">
            {en ? "This week's accountable publishing queue" : "本周可问责发布队列"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-fg-muted">
            {en
              ? "A slot closes only after a real publication is recorded. Finfold prepares and reminds; you still approve every publish."
              : "只有记录到真实发布，节点才会完成。Finfold 负责排期和提醒，每次发布仍由你确认。"}
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-right">
          <p className="text-[11px] font-bold uppercase tracking-wide text-fg-muted">
            {en ? "This week" : "本周真实进度"}
          </p>
          <p className="mt-1 text-2xl font-black tabular text-fg">
            {hasCurrentCommitments ? `${queue.completedThisWeek}/${queue.scheduledThisWeek}` : "—"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2.5">
        {visibleTasks.map((task) => (
          <TaskRow key={task.id} task={task} locale={locale} />
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-hairline pt-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-2 text-xs font-semibold leading-5 text-fg-muted">
          {queue.overdueCount > 0 ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" />
          )}
          <span>
            {queue.overdueCount > 0
              ? en
                ? "Overdue publishing work is placed before future slots. An overdue post is an execution gap, not an automatic business-failure verdict."
                : "逾期发布会排在未来节点之前；发布逾期只表示执行断点，不会被自动判成商业目标失败。"
              : en
                ? `Next week already has ${queue.nextWeekCount} slots. Cadence changes apply there without rewriting this week's completed evidence.`
                : `下周已排好 ${queue.nextWeekCount} 个节点；修改频次会从下周生效，不改写本周已确认的证据。`}
          </span>
        </div>
        {nextOpen ? (
          <Link href={workbenchHref(nextOpen, locale)} className={buttonStyles({ variant: "primary", size: "sm" })}>
            {en ? "Prepare next draft" : "准备下一篇草稿"}
          </Link>
        ) : null}
      </div>
    </Panel>
  );
}

function TaskRow({ task, locale }: { task: OperatingWeeklyTask; locale: "zh" | "en" }) {
  const en = locale === "en";
  const copy = {
    completed: {
      label: en ? "Published" : "已真实发布",
      detail: en ? "Completed from a recorded publication" : "已由真实发布记录核销"
    },
    overdue: {
      label: en ? "Overdue" : "已逾期",
      detail: en ? "No matching publication recorded by the deadline" : "截止时间前未发现对应发布记录"
    },
    today: {
      label: en ? "Due today" : "今天到期",
      detail: en ? "Prepare, review, and publish with confirmation" : "准备、审阅，并由你确认发布"
    },
    scheduled: {
      label: en ? "Scheduled" : "已排期",
      detail: en ? "Waiting behind more urgent accountable work" : "按到期时间等待执行"
    }
  } as const;
  const selected = copy[task.state];
  const icon = task.state === "completed"
    ? <CheckCircle2 className="h-4 w-4 text-positive" />
    : task.state === "overdue"
      ? <AlertTriangle className="h-4 w-4 text-amber-500" />
      : task.state === "today"
        ? <Clock3 className="h-4 w-4 text-action" />
        : <CalendarDays className="h-4 w-4 text-fg-muted" />;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline bg-surface-2/60 p-3.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-black text-fg">{selected.label}</p>
          <span className="text-[11px] font-bold text-fg-muted">
            {formatDueAt(task.dueAt, locale)}
          </span>
        </div>
        <p className="mt-1 text-xs font-semibold leading-5 text-fg-muted">{selected.detail}</p>
      </div>
    </div>
  );
}

function workbenchHref(task: OperatingWeeklyTask, locale: "zh" | "en"): string {
  const idea = locale === "en"
    ? "Prepare one evidence-backed post for this week's operating program. Generate a draft only; I will confirm before publishing."
    : "为本周运营计划准备一篇小红书内容。先基于业务简报和真实调研证据确定选题，只生成草稿，发布前由我确认。";
  return `/workbench?platform=${encodeURIComponent(task.platform)}&idea=${encodeURIComponent(idea)}`;
}

function formatDueAt(iso: string, locale: "zh" | "en"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}
