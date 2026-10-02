import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GrowthMissionBanner } from "@/components/workbench/GrowthMissionBanner";
import type { GrowthMission } from "@/lib/agent/growth-missions";

const mission: GrowthMission = {
  id: "9cc86165-4795-4e78-ac2e-692f51fdbba7",
  platform: "xiaohongshu",
  status: "posted",
  stage: "conversion",
  title: "下一轮：建立关注理由",
  hypothesis: "只改变关注承诺，验证主页访问是否能转化成关注。",
  primaryMetric: "每千次观看新增关注",
  primaryMetricKey: "followers_per_thousand",
  baselineValue: -2.03,
  targetValue: 0.5,
  variants: [
    {
      name: "连续栏目",
      angle: "把单篇变成系列",
      hookInstruction: "预告下一篇",
      format: "7 页轮播"
    }
  ],
  workbenchIdea: "制作一个只验证关注承诺的 3:4 小红书轮播。",
  kitId: "kit-1",
  missionKind: "content_experiment",
  objectiveType: null,
  executionState: "measuring",
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
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T01:00:00.000Z",
  completedAt: null
};

afterEach(() => vi.unstubAllGlobals());

describe("GrowthMissionBanner", () => {
  it("shows the durable mission state and its single success metric", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ mission })
    } as Response)));

    render(<GrowthMissionBanner missionId={mission.id} locale="zh" />);

    expect(await screen.findByText("下一轮：建立关注理由")).toBeInTheDocument();
    expect(screen.getByText("等待数据")).toBeInTheDocument();
    expect(screen.getByText("每千次观看新增关注")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /返回增长智能体/ })).toHaveAttribute("href", "/dashboard");
  });
});
