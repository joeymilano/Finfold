import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { XhsCoachingCenter } from "@/components/app-shell/XhsCoachingCenter";
import { buildXhsDiagnosis } from "@/lib/agent/xhs-coaching";
import { resolveXhsProviderEvidence } from "@/lib/agent/xhs-data-provider";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/components/ui/Panel", () => ({ Panel: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div> }));

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as Response);
}

afterEach(() => vi.unstubAllGlobals());

describe("XhsCoachingCenter", () => {
  it("does not present a future task as today's action after Day 0 completes", async () => {
    const report = await buildReport();
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).includes("coaching-programs")
      ? jsonResponse({ program: {
          id: "program-1",
          status: "active",
          startDate: "2026-08-12",
          currentDay: 0,
          baselineDiagnosisId: "diagnosis-1",
          latestDiagnosisId: "diagnosis-1",
          finalRediagnosisReady: false,
          comparison: null,
          checkpoints: {
            day7: { status: "insufficient", evidence: "Day 7 尚未到达。" },
            day14: { status: "insufficient", evidence: "Day 14 尚未到达。" }
          },
          checkIns: [],
          tasks: [
            { ...taskRecord(0, "保存 Day 0 基线"), status: "completed" },
            taskRecord(1, "写下第一轮单变量假设")
          ]
        } })
      : jsonResponse({ diagnoses: [{ id: "diagnosis-1", report }] })));
    render(<XhsCoachingCenter />);

    expect(await screen.findByText("今天已完成。下一项 Day 1 将按日程开放。")).toBeInTheDocument();
    expect(screen.queryByText("Day 14 对比与完成证明已经保存。下一周期从最新诊断的前三项行动继续。")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /DAY 1/ })).toBeDisabled();
  });

  it("renders the five-minute intake and explicit publishing boundary on mobile-safe layout", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).includes("coaching-programs")
      ? jsonResponse({ program: null })
      : jsonResponse({ diagnoses: [] })));
    render(<XhsCoachingCenter />);

    expect(await screen.findByRole("heading", { name: "为什么这篇没流量，接下来 14 天怎么做" })).toBeInTheDocument();
    expect(screen.getByText("小红书陪跑")).toBeInTheDocument();
    expect(screen.queryByText(/beta/i)).not.toBeInTheDocument();
    expect(screen.getByText("5 分钟资料包")).toBeInTheDocument();
    expect(screen.getByText("选择创作中心截图（最多 6 张）")).toBeInTheDocument();
    expect(screen.getByText("系统可以生成选题、改稿、实验和复盘任务；不会自动评论、自动互动或无人值守代发。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成账号与逐篇诊断" })).toBeEnabled();
  });

  it("shows evidence confidence, per-note diagnosis, top actions, and Workbench handoff", async () => {
    const providerResolution = await resolveXhsProviderEvidence("https://www.xiaohongshu.com/user/profile/test");
    const report = buildXhsDiagnosis({
      accountUrl: "https://www.xiaohongshu.com/user/profile/test",
      businessGoal: "获得咨询",
      targetAudience: "独立设计师",
      representativeNotes: [{ title: "笔记 1" }, { title: "笔记 2" }, { title: "笔记 3" }],
      platformNotifications: [],
      locale: "zh",
      rows: Array.from({ length: 5 }, (_, index) => ({
        title: `笔记 ${index + 1}`,
        publishedAt: `2026-07-${String(index + 20).padStart(2, "0")}T00:00:00.000Z`,
        impressions: (index + 1) * 100,
        views: (index + 1) * 20,
        coverClickRate: (index + 1) * 2,
        averageViewSeconds: (index + 1) * 3,
        likes: index,
        comments: 0,
        saves: index,
        shares: 0,
        followerGrowth: index,
        profileVisits: index,
        observedMetrics: ["impressions", "views", "coverClickRate", "averageViewSeconds", "likes", "comments", "saves", "shares", "followerGrowth", "profileVisits"] as const
      })),
      providerResolution,
      now: new Date("2026-08-12T00:00:00.000Z")
    });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).includes("coaching-programs")
      ? jsonResponse({ program: null })
      : jsonResponse({ diagnoses: [{ id: "diagnosis-1", report, input: {
        accountUrl: "https://www.xiaohongshu.com/user/profile/test",
        businessGoal: "获得咨询",
        targetAudience: "独立设计师",
        representativeNotes: [{ title: "笔记 1", content: "第一篇原始正文" }, { title: "笔记 2" }, { title: "笔记 3" }],
        platformNotifications: [{ title: "平台通知", detail: "修改商业合作披露" }]
      }, import_id: "import-1" }] })));
    render(<XhsCoachingCenter />);

    expect(await screen.findByRole("heading", { name: report.primaryProblem.title })).toBeInTheDocument();
    expect(screen.getByText("逐篇笔记诊断")).toBeInTheDocument();
    expect(screen.getByText("证据账本")).toBeInTheDocument();
    expect(screen.getAllByText("证据支持的假设").length).toBeGreaterThan(0);
    const workbenchLinks = screen.getAllByRole("link", { name: "去创作台执行" });
    expect(workbenchLinks[0]).toHaveAttribute("href", expect.stringContaining("/workbench?platform=xiaohongshu"));
    expect(screen.getByRole("button", { name: "开始 14 天陪跑" })).toBeEnabled();
    expect(screen.getByDisplayValue("获得咨询")).toBeInTheDocument();
    expect(screen.getByDisplayValue("笔记 1")).toBeInTheDocument();
    expect(screen.getByLabelText("代表笔记 1 正文")).toHaveValue("第一篇原始正文");
    await waitFor(() => expect(screen.getByDisplayValue("修改商业合作披露")).toBeInTheDocument());
  });

  it("locks future days and explains checkpoint requirements inline", async () => {
    const report = await buildReport();
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).includes("coaching-programs")
      ? jsonResponse({ program: {
          id: "program-1",
          status: "active",
          startDate: "2026-08-01",
          currentDay: 7,
          baselineDiagnosisId: "diagnosis-1",
          latestDiagnosisId: "diagnosis-1",
          finalRediagnosisReady: false,
          comparison: null,
          checkpoints: {
            day7: { status: "insufficient", evidence: "Day 7 缺少同口径指标。" },
            day14: { status: "insufficient", evidence: "Day 14 尚未到达。" }
          },
          checkIns: [],
          tasks: [
            taskRecord(7, "Day 7 复盘第一轮"),
            taskRecord(8, "写下第二轮单变量假设")
          ]
        } })
      : jsonResponse({ diagnoses: [{ id: "diagnosis-1", report }] })));
    render(<XhsCoachingCenter />);

    const future = await screen.findByRole("button", { name: /DAY 8/ });
    expect(future).toBeDisabled();
    expect(future).toHaveAttribute("title", "Day 8 到达后开放");
    fireEvent.click(screen.getByRole("button", { name: /DAY 7/ }));
    expect(screen.getByRole("button", { name: "保存完成证明" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("链接、截图说明或数据导入记录"), { target: { value: "https://www.xiaohongshu.com/explore/test" } });
    expect(screen.getByText(/Day 7 必须填写同口径主指标/)).toBeInTheDocument();
    expect(screen.getByText(/检查点必须写下结论与下一步/)).toBeInTheDocument();
  });

  it("locks a later unlocked day until the earliest open task is closed", async () => {
    const report = await buildReport();
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).includes("coaching-programs")
      ? jsonResponse({ program: {
          id: "program-1",
          status: "active",
          startDate: "2026-08-01",
          currentDay: 7,
          baselineDiagnosisId: "diagnosis-1",
          latestDiagnosisId: "diagnosis-1",
          finalRediagnosisReady: false,
          comparison: null,
          checkpoints: {
            day7: { status: "insufficient", evidence: "尚未复盘。" },
            day14: { status: "insufficient", evidence: "尚未到达。" }
          },
          checkIns: [],
          tasks: [taskRecord(1, "最早未完成任务"), taskRecord(7, "Day 7 复盘第一轮")]
        } })
      : jsonResponse({ diagnoses: [{ id: "diagnosis-1", report }] })));
    render(<XhsCoachingCenter />);

    expect((await screen.findAllByText("最早未完成任务")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /DAY 1/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /DAY 7/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /DAY 7/ })).toHaveAttribute("title", "请先完成更早的未关闭任务");
  });
});

function taskRecord(dayNumber: number, title: string) {
  return {
    id: `task-${dayNumber}`,
    dayNumber,
    phase: dayNumber === 7 ? "review_one" : "round_two",
    kind: dayNumber === 7 ? "review" : "plan",
    title,
    reason: "原因",
    deliverable: "交付物",
    dueAt: "2026-08-08T15:59:59.999Z",
    targetMetric: "相对自身基准的封面点击率",
    singleVariable: "标题与封面承诺",
    completionProof: "数据对比、结论与下一轮决定",
    workbenchHref: "/operations/xiaohongshu",
    status: "todo",
    completedAt: null
  };
}

async function buildReport() {
  const providerResolution = await resolveXhsProviderEvidence("https://www.xiaohongshu.com/user/profile/test");
  return buildXhsDiagnosis({
    accountUrl: "https://www.xiaohongshu.com/user/profile/test",
    businessGoal: "获得咨询",
    targetAudience: "独立设计师",
    representativeNotes: [],
    platformNotifications: [],
    locale: "zh",
    rows: [],
    providerResolution,
    now: new Date("2026-08-12T00:00:00.000Z")
  });
}
