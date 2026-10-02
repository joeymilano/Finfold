import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessOutcomeFollowUpDecision } from "@/components/agent/BusinessOutcomeFollowUpDecision";
import type { GrowthMission } from "@/lib/agent/growth-missions";
import { emptyMissionOutcomeSummary } from "@/lib/mission-attribution";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));

const mission: GrowthMission = {
  id: "22222222-2222-4222-8222-222222222222",
  platform: "linkedin",
  status: "completed",
  stage: "conversion",
  title: "Get qualified leads",
  hypothesis: "Use the audited offer.",
  primaryMetric: "有效线索",
  primaryMetricKey: "leads",
  baselineValue: 0,
  targetValue: 1,
  variants: [],
  workbenchIdea: "Keep the audited offer and audience.",
  kitId: null,
  missionKind: "growth_opportunity",
  objectiveType: "leads",
  executionState: "completed",
  trackingEnabled: true,
  measurementWindowDays: 14,
  measurementStartedAt: "2026-08-10T02:00:00.000Z",
  measurementDueAt: "2026-08-24T02:00:00.000Z",
  reviewDecision: "goal_achieved",
  reviewBottleneck: null,
  reviewEvidenceNote: null,
  reviewedAt: "2026-08-24T02:00:00.000Z",
  verdict: "won",
  outcome: { actualValue: 3, targetValue: 1 },
  createdAt: "2026-08-20T02:00:00.000Z",
  updatedAt: "2026-08-24T02:00:00.000Z",
  completedAt: "2026-08-24T02:00:00.000Z"
};

describe("Business outcome follow-up decision", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the recorded result and creates a replication only after confirmation", async () => {
    const nextMission = { ...mission, id: "33333333-3333-4333-8333-333333333333", status: "accepted" as const, verdict: null };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ mission: nextMission, existing: false })
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<BusinessOutcomeFollowUpDecision
      mission={mission}
      outcomeSummary={{ ...emptyMissionOutcomeSummary(), leads: 3 }}
      locale="zh"
    />);

    expect(screen.getByRole("heading", { name: "复现已达成的获客结果" })).toBeInTheDocument();
    expect(screen.getByText("3 个有效线索")).toBeInTheDocument();
    expect(screen.getByText("再次达到3 个有效线索")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /确认创建结果复现任务/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      locale: "zh",
      platform: "linkedin",
      sourceMissionId: mission.id
    });
    expect(router.push).toHaveBeenCalledWith(`/operations/missions/${nextMission.id}`);
  });
});
