import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OperatingProgramSetup } from "@/components/app-shell/OperatingProgramSetup";
import { EMPTY_OPERATING_PROGRAM } from "@/lib/operations/program";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/components/ui/Panel", () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));
vi.mock("@/components/ui/Tag", () => ({
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>
}));
vi.mock("@/components/app-shell/BusinessAccountabilityReview", () => ({
  BusinessAccountabilityReviewCard: () => <div>业务复盘入口</div>
}));

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as Response);
}

afterEach(() => vi.unstubAllGlobals());

describe("OperatingProgramSetup", () => {
  it("shows the exact blockers instead of silently disabling activation", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({
      program: null,
      defaults: EMPTY_OPERATING_PROGRAM,
      persisted: false
    })));

    render(<OperatingProgramSetup />);

    expect(await screen.findByRole("heading", { name: "先把生意目标交给 Finfold，再让它开始创作" })).toBeInTheDocument();
    expect(screen.queryByText(/beta/i)).not.toBeInTheDocument();
    expect(screen.getByText("业务复盘入口")).toBeInTheDocument();
    expect(screen.getByText("补全主推产品名称和说明")).toBeInTheDocument();
    expect(screen.getByText("说明目标客户和主要需求")).toBeInTheDocument();
    expect(screen.getByText("竞品和关键词合计至少 3 项")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "启动运营项目" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请先完成右侧列出的必填项，再启动运营项目。");
  });

  it("saves a partial setup as an explicit draft", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) {
        return jsonResponse({ program: null, defaults: EMPTY_OPERATING_PROGRAM, persisted: false });
      }
      const body = JSON.parse(String(init.body));
      return jsonResponse({
        program: {
          ...body,
          id: "program-1",
          createdAt: "2026-08-11T10:00:00.000Z",
          updatedAt: "2026-08-11T10:00:00.000Z"
        },
        persisted: true
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OperatingProgramSetup />);
    await screen.findByRole("heading", { name: "先把生意目标交给 Finfold，再让它开始创作" });
    fireEvent.change(screen.getByLabelText("产品或服务名称"), { target: { value: "品牌咨询" } });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      status: "draft",
      offer: { name: "品牌咨询" }
    });
    expect(await screen.findByRole("status")).toHaveTextContent("草稿已保存。");
  });

  it("puts the accountable queue and business review on the real active-program page", async () => {
    const activeProgram = {
      ...EMPTY_OPERATING_PROGRAM,
      id: "program-1",
      status: "active" as const,
      cadencePerWeek: 3,
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z"
    };
    const queue = {
      programId: "program-1",
      platform: "xiaohongshu",
      cadencePerWeek: 3,
      weekStart: "2026-08-24",
      nextWeekStart: "2026-08-31",
      completedThisWeek: 0,
      scheduledThisWeek: 1,
      overdueCount: 0,
      nextWeekCount: 3,
      tasks: [{
        id: "task-1",
        operatingProgramId: "program-1",
        platform: "xiaohongshu",
        weekStart: "2026-08-24",
        slotIndex: 2,
        cadenceSnapshot: 3,
        status: "open",
        state: "scheduled",
        dueAt: "2026-08-28T10:00:00.000Z",
        completedAt: null,
        completedOutputId: null,
        createdAt: "2026-08-24T00:00:00.000Z",
        updatedAt: "2026-08-24T00:00:00.000Z"
      }]
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/tasks")) return jsonResponse({ queue, persisted: true });
      return jsonResponse({ program: activeProgram, defaults: EMPTY_OPERATING_PROGRAM, persisted: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OperatingProgramSetup />);

    expect(await screen.findByRole("heading", { name: "本周可问责发布队列" })).toBeInTheDocument();
    expect(screen.getByText("业务复盘入口")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/operations/program/tasks", { cache: "no-store" });
  });
});
