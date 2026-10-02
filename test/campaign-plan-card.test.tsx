import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignPlanCard } from "@/components/app-shell/CampaignPlanCard";
import type { CampaignPlan } from "@/lib/campaign";

vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/components/workbench/PlatformBrandIcon", () => ({ PlatformGlyph: () => null }));

const plan: CampaignPlan = {
  id: "plan-1",
  title: "7 day plan",
  strategy: "面向设计服务的 7 天涨粉战役，逐步从认知推进到转化。",
  durationDays: 7,
  createdAt: "2026-07-15T00:00:00.000Z",
  days: Array.from({ length: 7 }, (_, index) => ({
    day: index + 1,
    phase: `阶段 ${index + 1}`,
    theme: `第 ${index + 1} 天主题`,
    angle: `第 ${index + 1} 天内容角度`,
    primaryPlatform: "x" as const,
    supportingPlatforms: [],
    deliverable: "一条内容",
    cta: "引导关注",
    checklist: [],
    rationale: `第 ${index + 1} 天策略依据`
  }))
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as Response);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CampaignPlanCard", () => {
  it("keeps the weekly plan compact until the user expands it", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ plan, completedDays: [], progressTrackingAvailable: true })));

    render(<CampaignPlanCard locale="zh" />);

    expect(await screen.findByText("本周 7 天内容计划")).toBeInTheDocument();
    expect(screen.queryByText("第 1 天主题")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开计划" }));
    expect(screen.getByText("第 1 天主题")).toBeInTheDocument();
    expect(screen.queryByText("第 1 天内容角度")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看第 1 天详情" }));
    expect(screen.getByText("第 1 天内容角度")).toBeInTheDocument();
  });

  it("requests and renders the plan for the active English locale", async () => {
    const englishPlan: CampaignPlan = {
      ...plan,
      language: "en",
      strategy: "A 7-day audience growth campaign for design services.",
      days: plan.days.map((day) => ({
        ...day,
        phase: `Phase ${day.day}`,
        theme: `Day ${day.day} theme`,
        angle: `Day ${day.day} angle`,
        deliverable: "One post",
        cta: "Follow for more",
        rationale: `Day ${day.day} rationale`
      }))
    };
    const fetchMock = vi.fn(() => jsonResponse({ plan: englishPlan, completedDays: [], progressTrackingAvailable: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CampaignPlanCard locale="en" />);

    expect(await screen.findByText(englishPlan.strategy)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/campaign?locale=en", { cache: "no-store" });
    expect(screen.queryByText(plan.strategy)).not.toBeInTheDocument();
  });

  it("makes completion explicit and saves it optimistically", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ plan, completedDays: [], progressTrackingAvailable: true }))
      .mockImplementationOnce(() => jsonResponse({ completedDays: [1] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CampaignPlanCard locale="zh" />);
    await screen.findByText("本周 7 天内容计划");
    fireEvent.click(screen.getByRole("button", { name: "展开计划" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "标记第 1 天完成" }));

    await waitFor(() => expect(screen.getByText("已完成 1/7")).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "撤销第 1 天完成" })).toHaveAttribute("aria-checked", "true");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/campaign", expect.objectContaining({ method: "PATCH" }));
  });

  it("explains when progress tracking is unavailable instead of showing a mystery control", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ plan, completedDays: [], progressTrackingAvailable: false })));

    render(<CampaignPlanCard locale="zh" />);
    await screen.findByText("本周 7 天内容计划");
    fireEvent.click(screen.getByRole("button", { name: "展开计划" }));

    expect(screen.getByText("完成进度暂时无法保存；内容计划和“去生成”仍可正常使用。")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "标记第 1 天完成" })).toBeDisabled();
  });

  it("restores the prior state and shows a reason when saving fails", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ plan, completedDays: [], progressTrackingAvailable: true }))
      .mockImplementationOnce(() => jsonResponse({ error: "No plan for this week." }, 404));
    vi.stubGlobal("fetch", fetchMock);

    render(<CampaignPlanCard locale="zh" />);
    await screen.findByText("本周 7 天内容计划");
    fireEvent.click(screen.getByRole("button", { name: "展开计划" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "标记第 1 天完成" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("这份计划还没完成同步，暂时无法保存进度。刷新页面后再试。");
    expect(screen.getByText("已完成 0/7")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "标记第 1 天完成" })).toHaveAttribute("aria-checked", "false");
  });
});
