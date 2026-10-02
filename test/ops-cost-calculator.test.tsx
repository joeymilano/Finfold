import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentOpsCostCalculator } from "@/components/landing/CurrentOpsCostCalculator";
import {
  calculateCurrentOpsCost,
  getOpsCostAnalyticsBuckets
} from "@/lib/ops-cost";
import { captureEvent } from "@/lib/posthog";

vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));

class IntersectionObserverMock {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0.25];
  constructor(private readonly callback: IntersectionObserverCallback) {}
  disconnect = vi.fn();
  observe = vi.fn((element: Element) => {
    this.callback([{ isIntersecting: true, target: element } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  });
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
});

describe("current operations cost calculation", () => {
  it("calculates money and solo-operator time saved from the user's chosen handoff rate", () => {
    const result = calculateCurrentOpsCost({
      postsPerWeek: 3,
      platformsPerPost: 4,
      minutesPerPlatform: 30,
      hourlyCost: 150,
      agencyMonthlyCost: 3_000,
      delegationRate: 50
    }, 199);

    expect(result.monthlyPlatformTasks).toBeCloseTo(51.96);
    expect(result.monthlyHours).toBeCloseTo(25.98);
    expect(result.monthlyLaborCost).toBeCloseTo(3_897);
    expect(result.currentMonthlyCost).toBeCloseTo(6_897);
    expect(result.estimatedMonthlyHoursSaved).toBeCloseTo(12.99);
    expect(result.estimatedMonthlySavings).toBeCloseTo(4_749.5);
  });

  it("returns privacy-safe analytics buckets instead of exact financial inputs", () => {
    const inputs = { postsPerWeek: 3, platformsPerPost: 4, minutesPerPlatform: 30, hourlyCost: 100, agencyMonthlyCost: 3_000, delegationRate: 50 };
    const result = calculateCurrentOpsCost(inputs, 199);

    expect(getOpsCostAnalyticsBuckets(inputs, result)).toEqual({
      posts_per_week_bucket: "2-3",
      platform_count_bucket: "4-6",
      minutes_per_platform_bucket: "16-30",
      monthly_hours_bucket: "25-49.9"
    });
  });
});

describe("CurrentOpsCostCalculator", () => {
  it("shows current workload and emits bucketed result analytics", async () => {
    const user = userEvent.setup();
    render(<CurrentOpsCostCalculator locale="zh" />);

    expect(screen.getByLabelText(/^每周发布多少条内容/)).toHaveValue(3);
    expect(screen.getByLabelText(/^每条内容覆盖几个平台/)).toHaveValue(4);
    expect(screen.getByLabelText(/^处理单个平台要多久/)).toHaveValue(30);
    expect(screen.getByLabelText(/^执行人员时薪/)).toHaveValue(100);
    expect(screen.getByLabelText(/^可由 Finfold 替代的机构 \/ 小红书陪跑月费/)).toHaveValue(0);
    expect(screen.getByRole("button", { name: "50%" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("你现在每月花多少")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "算算每月能省多少" }));

    expect(screen.queryByLabelText(/^每周发布多少条内容/)).not.toBeInTheDocument();
    expect(screen.getByText("52")).toBeInTheDocument();
    expect(screen.getByText("26")).toBeInTheDocument();
    expect(screen.getAllByText(/2,598/)).toHaveLength(2);
    expect(screen.getByText(/1,100/)).toBeInTheDocument();
    expect(screen.getByText("个人 / OPC 时间")).toBeInTheDocument();
    expect(screen.queryByText(/65%/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /先用一次真实任务试试/ })).toHaveAttribute(
      "href",
      "/signup?next=%2Fdashboard"
    );
    expect(screen.getByRole("button", { name: "重新计算" })).toBeInTheDocument();
    expect(captureEvent).toHaveBeenCalledWith("ops_cost_result_generated", {
      calculation_version: "ops-cost-v1",
      locale: "zh",
      currency: "CNY",
      posts_per_week_bucket: "2-3",
      platform_count_bucket: "4-6",
      minutes_per_platform_bucket: "16-30",
      monthly_hours_bucket: "25-49.9"
    });

    await user.click(screen.getByRole("button", { name: "重新计算" }));

    expect(screen.getByLabelText(/^每周发布多少条内容/)).toHaveValue(3);
    expect(screen.queryByText("你现在每月花多少")).not.toBeInTheDocument();
  });

  it("adds agency or RedNote coaching fees to the monthly savings scenario", async () => {
    const user = userEvent.setup();
    render(<CurrentOpsCostCalculator locale="zh" />);

    fireEvent.change(screen.getByLabelText(/^可由 Finfold 替代的机构 \/ 小红书陪跑月费/), { target: { value: "3000" } });
    await user.click(screen.getByRole("button", { name: "算算每月能省多少" }));

    expect(screen.getByText(/5,598/)).toBeInTheDocument();
    expect(screen.getByText(/4,100/)).toBeInTheDocument();
  });

  it("does not calculate invalid input", async () => {
    const user = userEvent.setup();
    render(<CurrentOpsCostCalculator locale="zh" />);

    fireEvent.change(screen.getByLabelText(/^每周发布多少条内容/), { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "算算每月能省多少" }));

    expect(screen.getByRole("alert")).toHaveTextContent("有一项数字不对 请检查后再算");
    expect(captureEvent).not.toHaveBeenCalledWith("ops_cost_result_generated", expect.anything());
  });

  it("uses USD defaults and labels on the English page", async () => {
    const user = userEvent.setup();
    render(<CurrentOpsCostCalculator locale="en" />);

    expect(screen.getByLabelText(/^Operator hourly cost/)).toHaveValue(30);
    await user.click(screen.getByRole("button", { name: "See what I could save" }));
    expect(screen.getAllByText(/779/)).toHaveLength(2);
    expect(screen.getByText(/361/)).toBeInTheDocument();
    expect(screen.getByText("current total cost / month")).toBeInTheDocument();
    expect(screen.getByText("solo operator time")).toBeInTheDocument();
  });
});
