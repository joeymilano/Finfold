import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionControl } from "@/components/app-shell/MissionControl";
import type { GrowthMission } from "@/lib/agent/growth-missions";
import type { MissionControlDetail } from "@/lib/mission-control";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/components/ui/Panel", () => ({
  Panel: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>
}));
vi.mock("@/components/ui/Tag", () => ({
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>
}));

const mission: GrowthMission = {
  id: "9cc86165-4795-4e78-ac2e-692f51fdbba7",
  platform: "xiaohongshu",
  status: "accepted",
  stage: "conversion",
  title: "把 Starter 访问变成注册",
  hypothesis: "一个清晰的转化入口会带来首个可归因注册。",
  primaryMetric: "新增注册",
  primaryMetricKey: "signups",
  baselineValue: 0,
  targetValue: 1,
  variants: [],
  workbenchIdea: "Source: https://finfold.app/pricing",
  kitId: null,
  missionKind: "growth_opportunity",
  objectiveType: "signups",
  executionState: "planned",
  trackingEnabled: false,
  measurementWindowDays: null,
  measurementStartedAt: null,
  measurementDueAt: null,
  reviewDecision: null,
  reviewBottleneck: null,
  reviewEvidenceNote: null,
  reviewedAt: null,
  verdict: null,
  outcome: null,
  createdAt: "2026-08-13T08:00:00.000Z",
  updatedAt: "2026-08-13T08:00:00.000Z",
  completedAt: null
};

const detail: MissionControlDetail = {
  mission,
  actions: [{
    id: "action-1",
    kind: "prepare_execution_draft",
    status: "awaiting_approval",
    riskLevel: "low",
    requiresApproval: true,
    input: {},
    output: null,
    error: null,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    completedAt: null
  }],
  events: [{ id: "event-1", eventType: "mission_created", payload: {}, occurredAt: mission.createdAt }],
  trackingLink: null,
  outcomeSummary: { views: 0, clicks: 0, leads: 0, signups: 0, trials: 0, purchases: 0, revenue: 0, currency: "CNY" },
  decisionCount: 1,
  workbenchHref: "/workbench?missionId=9cc86165-4795-4e78-ac2e-692f51fdbba7"
};

afterEach(() => vi.unstubAllGlobals());

describe("Mission Control", () => {
  it("shows one accountable mission, decision, attribution, and outcome loop", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url === "/api/agent/missions?limit=25" ? { missions: [mission] } : detail;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MissionControl initialMissionId={mission.id} />);

    expect(await screen.findByRole("heading", { name: "Finfold 推进，你做关键决策" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: mission.title })).toBeInTheDocument();
    expect(screen.getByText("决策收件箱")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /批准下一步/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /开启任务归因/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /记录结果/ })).not.toBeInTheDocument();
    expect(screen.getByText("确认发布后再记录本轮业务结果。")).toBeInTheDocument();
    expect(screen.getByText("Finfold 实际完成了什么")).toBeInTheDocument();
    expect(screen.getByText("工作记录与任务资产")).toBeInTheDocument();
    expect(screen.getByText("普通访问使用追踪链接；真人希望获得回复时，使用自愿留资表单。")).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("shows three human review decisions when a commercial window expires", async () => {
    const dueMission: GrowthMission = {
      ...mission,
      status: "posted",
      executionState: "review_due",
      measurementWindowDays: 7,
      measurementStartedAt: "2026-08-17T08:00:00.000Z",
      measurementDueAt: "2026-08-24T08:00:00.000Z",
      updatedAt: "2026-08-24T08:00:00.000Z"
    };
    const dueDetail: MissionControlDetail = {
      ...detail,
      mission: dueMission,
      actions: [],
      decisionCount: 0
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const body = String(input) === "/api/agent/missions?limit=25" ? { missions: [dueMission] } : dueDetail;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MissionControl initialMissionId={dueMission.id} />);

    expect(await screen.findByRole("heading", { name: "确认真实证据支持哪种结论" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /目标已达成/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /目标未达成：修复一个断点/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /证据不足：继续取证/ })).toBeInTheDocument();
    expect(screen.getByText(/不会擅自推断因果/)).toBeInTheDocument();
  });
});
