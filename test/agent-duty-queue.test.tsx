import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentDutyQueue } from "@/components/app-shell/AgentDutyQueue";
import type { AgentPatrolItem } from "@/lib/agent/patrol";

vi.mock("@/components/ui/Toast", () => ({ addToast: vi.fn() }));

const item: AgentPatrolItem = {
  id: "item-1",
  status: "open",
  actionKind: "mission_measure",
  urgency: "overdue",
  title: {
    zh: "实验结果已经到期，等待回采",
    en: "Experiment results are overdue"
  },
  detail: {
    zh: "回填唯一主指标后，智能体会自动判定结果。",
    en: "Add the primary metric for an automatic verdict."
  },
  evidence: {
    zh: "每千次观看新增关注：基线 -2 → 目标 0.5",
    en: "Followers per 1K views: -2 baseline → 0.5 target"
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
};

afterEach(() => vi.unstubAllGlobals());

describe("AgentDutyQueue", () => {
  it("shows the persisted single next action and background patrol state", async () => {
    const completedItem: AgentPatrolItem = {
      ...item,
      id: "item-complete",
      status: "done",
      title: { zh: "实验草稿已经生成", en: "Experiment draft generated" },
      completedAt: "2026-07-27T12:00:00.000Z"
    };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        openItem: item,
        items: [item, completedItem],
        backgroundEligible: true
      })
    } as Response)));

    render(<AgentDutyQueue locale="zh" />);

    expect(await screen.findByText("实验结果已经到期，等待回采")).toBeInTheDocument();
    expect(screen.getByText("每天后台巡检")).toBeInTheDocument();
    expect(screen.getByText("已到期")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /回填实验结果/ })).toHaveAttribute("href", "/kits/kit-1");
    expect(screen.getByText("最近值班记录")).toBeInTheDocument();
    expect(screen.getByText("实验草稿已经生成")).toBeInTheDocument();
  });

  it("completes a review and immediately advances to the next duty item", async () => {
    const reviewItem: AgentPatrolItem = {
      ...item,
      id: "review-1",
      actionKind: "mission_review",
      title: { zh: "上一轮实验已经有结论", en: "Last experiment has a verdict" }
    };
    const nextItem: AgentPatrolItem = {
      ...item,
      id: "draft-1",
      actionKind: "review_drafts",
      title: { zh: "下一篇草稿等待发布", en: "The next draft is waiting" }
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          openItem: reviewItem,
          items: [reviewItem],
          backgroundEligible: true
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          openItem: nextItem,
          items: [nextItem, { ...reviewItem, status: "done", completedAt: "2026-07-28T08:00:00.000Z" }]
        })
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<AgentDutyQueue locale="zh" />);
    fireEvent.click(await screen.findByRole("button", { name: "完成复盘" }));

    expect(await screen.findByText("下一篇草稿等待发布")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/agent/patrol/review-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ status: "done" })
    }));
  });
});
