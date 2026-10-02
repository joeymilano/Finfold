import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeeklyPlanCard } from "@/components/app-shell/WeeklyPlanCard";
import type { GrowthSummary } from "@/components/app-shell/OperatingDashboard";

const summary: GrowthSummary = {
  toReview: 3,
  awaitingMetrics: 2,
  closedLoops: 0,
  publishedThisWeek: 0,
  daysSinceLastPublish: 9,
  automatedSignalsThisWeek: 0,
  outcomes: { engagement: 0, leads: 0, signups: 0, revenue: 0 },
  learnedRules: [],
  nextAction: { kind: "review", href: "/packages" },
  dutyItem: {
    id: "patrol-1",
    status: "open",
    actionKind: "mission_measure",
    urgency: "overdue",
    title: {
      zh: "实验结果已经到期，等待回采",
      en: "Experiment results are overdue"
    },
    detail: {
      zh: "先回填唯一主指标，再决定下一轮。",
      en: "Add the primary metric before planning the next round."
    },
    evidence: {
      zh: "每千次观看新增关注：目标 0.5",
      en: "Followers per 1K views: target 0.5"
    },
    actionHref: "/kits/kit-1",
    fingerprint: "mission_measure:mission-1",
    missionId: "mission-1",
    sourceState: {},
    dueAt: "2026-07-27T00:00:00.000Z",
    firstSeenAt: "2026-07-27T00:00:00.000Z",
    lastSeenAt: "2026-07-28T00:00:00.000Z",
    completedAt: null,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z"
  }
};

describe("WeeklyPlanCard", () => {
  it("uses the persisted duty item as the only recommendation", () => {
    render(<WeeklyPlanCard summary={summary} locale="zh" />);

    expect(screen.getByText(/实验结果已经到期，等待回采/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回填结果" })).toHaveAttribute("href", "/kits/kit-1");
    expect(screen.queryByText(/已 9 天没发/)).not.toBeInTheDocument();
    expect(screen.queryByText(/有 3 条草稿/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2 条已发布/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
