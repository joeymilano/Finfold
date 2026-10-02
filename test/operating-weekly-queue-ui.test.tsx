import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperatingWeeklyQueueCard } from "@/components/app-shell/OperatingWeeklyQueue";
import type { OperatingWeeklyQueue } from "@/lib/operations/weekly-tasks";

const queue: OperatingWeeklyQueue = {
  programId: "program-1",
  platform: "xiaohongshu",
  cadencePerWeek: 3,
  weekStart: "2026-08-24",
  nextWeekStart: "2026-08-31",
  completedThisWeek: 1,
  scheduledThisWeek: 3,
  overdueCount: 1,
  nextWeekCount: 3,
  tasks: [
    {
      id: "task-overdue",
      operatingProgramId: "program-1",
      platform: "xiaohongshu",
      weekStart: "2026-08-24",
      slotIndex: 1,
      cadenceSnapshot: 3,
      status: "open",
      state: "overdue",
      dueAt: "2026-08-26T10:00:00.000Z",
      completedAt: null,
      completedOutputId: null,
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z"
    },
    {
      id: "task-done",
      operatingProgramId: "program-1",
      platform: "xiaohongshu",
      weekStart: "2026-08-24",
      slotIndex: 0,
      cadenceSnapshot: 3,
      status: "done",
      state: "completed",
      dueAt: "2026-08-24T10:00:00.000Z",
      completedAt: "2026-08-24T09:00:00.000Z",
      completedOutputId: "output-real",
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T09:00:00.000Z"
    }
  ]
};

describe("OperatingWeeklyQueueCard", () => {
  it("shows real completion, execution overdue, and the human publish boundary", () => {
    render(<OperatingWeeklyQueueCard queue={queue} locale="zh" />);

    expect(screen.getByText("本周可问责发布队列")).toBeInTheDocument();
    expect(screen.getByText("已由真实发布记录核销")).toBeInTheDocument();
    expect(screen.getByText("截止时间前未发现对应发布记录")).toBeInTheDocument();
    expect(screen.getByText(/不会被自动判成商业目标失败/)).toBeInTheDocument();
    expect(screen.getByText(/每次发布仍由你确认/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "准备下一篇草稿" })).toHaveAttribute("href", expect.stringContaining("/workbench?platform=xiaohongshu"));
  });
});
