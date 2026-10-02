import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeeklyGrowthPulse } from "@/components/app-shell/WeeklyGrowthPulse";
import { buildWeeklyGrowthReport } from "@/lib/agent/weekly-growth-report";

afterEach(() => vi.unstubAllGlobals());

describe("WeeklyGrowthPulse", () => {
  it("renders the evidence-led alert and sends its investigation prompt to Agent", async () => {
    const report = buildWeeklyGrowthReport({
      platform: "xiaohongshu",
      mode: "account_snapshots",
      current: {
        samples: 1,
        impressions: 4771,
        views: 984,
        coverClickRate: 20.6,
        averageViewSeconds: 0,
        likes: 8,
        comments: 2,
        saves: 1,
        shares: 5,
        followerGrowth: -2,
        profileVisits: 45
      },
      previous: {
        samples: 1,
        impressions: 5200,
        views: 900,
        coverClickRate: 22,
        averageViewSeconds: 0,
        likes: 10,
        comments: 2,
        saves: 4,
        shares: 6,
        followerGrowth: 3,
        profileVisits: 50
      },
      currentKey: "2026-07-28",
      previousKey: "2026-07-21"
    }, "zh", new Date("2026-07-28T08:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ report })
    } as Response)));
    const onAskAgent = vi.fn();

    render(<WeeklyGrowthPulse locale="zh" variant="dark" onAskAgent={onAskAgent} />);

    expect(await screen.findByText(/最大异常：观看没有转成关注/)).toBeInTheDocument();
    expect(screen.getByText("显著异常")).toBeInTheDocument();
    expect(screen.getByText("千次观看新增关注")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /让智能体调查/ }));
    expect(onAskAgent).toHaveBeenCalledWith(expect.stringContaining("只改变单一变量"));
  });
});
