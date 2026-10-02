import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FollowUpMissionDecision } from "@/components/agent/FollowUpMissionDecision";
import type { GrowthMission } from "@/lib/agent/growth-missions";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));

const mission: GrowthMission = {
  id: "22222222-2222-4222-8222-222222222222",
  platform: "reddit",
  status: "completed",
  stage: "value",
  title: "Test one Reddit value hook",
  hypothesis: "A concrete checklist should earn more saves and comments.",
  primaryMetric: "Saves + comments",
  primaryMetricKey: "save_share_per_thousand",
  baselineValue: 8,
  targetValue: 12,
  variants: [],
  workbenchIdea: "Create one controlled Reddit post.",
  kitId: "kit-1",
  missionKind: "content_experiment",
  objectiveType: null,
  executionState: "completed",
  trackingEnabled: false,
  measurementWindowDays: null,
  measurementStartedAt: null,
  measurementDueAt: null,
  reviewDecision: null,
  reviewBottleneck: null,
  reviewEvidenceNote: null,
  reviewedAt: null,
  verdict: "lost",
  outcome: { actualValue: 5, baselineValue: 8, targetValue: 12, measuredAt: "2026-08-24T02:00:00.000Z" },
  createdAt: "2026-08-20T02:00:00.000Z",
  updatedAt: "2026-08-24T02:00:00.000Z",
  completedAt: "2026-08-24T02:00:00.000Z"
};

describe("Follow-up mission decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("explains a loss without scaling it and creates only after confirmation", async () => {
    const nextMission = { ...mission, id: "33333333-3333-4333-8333-333333333333", status: "accepted" as const, verdict: null };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ mission: nextMission, existing: false })
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<FollowUpMissionDecision mission={mission} locale="zh" />);

    expect(screen.getByRole("heading", { name: "停止放大这版，换一个变量验证" })).toBeInTheDocument();
    expect(screen.getByText("只改变一个瓶颈，其余保持不变")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /确认创建下一轮任务/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      locale: "zh",
      platform: "reddit",
      sourceMissionId: mission.id
    });
    expect(router.push).toHaveBeenCalledWith(`/operations/missions/${nextMission.id}`);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("labels inconclusive evidence as another comparison, not a win", () => {
    render(<FollowUpMissionDecision mission={{ ...mission, verdict: "inconclusive" }} locale="zh" />);

    expect(screen.getByRole("heading", { name: "不宣判胜负，先建立下一条对照样本" })).toBeInTheDocument();
    expect(screen.getByText(/没有越过达标线/)).toBeInTheDocument();
  });
});
