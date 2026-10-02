import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PackagesPage from "@/app/(dashboard)/packages/page";
import { addToast } from "@/components/ui/Toast";
import type { ContentKit } from "@/lib/content-schema";

const removeKit = vi.fn();

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/components/workbench/WorkbenchProvider", () => ({ useWorkbench: () => ({ removeKit }) }));
vi.mock("@/components/ui/Toast", () => ({ addToast: vi.fn() }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/lib/kit-export", () => ({
  copyKitToClipboard: vi.fn(),
  downloadKitMarkdown: vi.fn()
}));

const kit: ContentKit = {
  id: "kit-1",
  ideaText: "一份可以安全删除的历史内容包",
  goal: "lead-gen",
  persona: "ai-saas",
  platforms: ["x"],
  mediaAssets: [],
  outputs: [{
    id: "output-1",
    platform: "x",
    title: "标题",
    body: "正文",
    cta: "行动",
    notes: "备注",
    strategy: "策略",
    locked: false,
    publishStatus: "draft",
    userEdited: false
  }],
  status: "saved",
  createdAt: "2026-07-15T12:00:00.000Z"
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
  removeKit.mockReset();
});

describe("Content Library deletion", () => {
  it("requires confirmation and removes a kit only after the API succeeds", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") return jsonResponse({ deleted: true, kitId: kit.id });
      return jsonResponse({ kits: [kit] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PackagesPage />);
    expect(await screen.findByText(kit.ideaText)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /删除: 一份可以安全删除/ }));
    expect(screen.getByText("删除后无法恢复")).toBeInTheDocument();
    expect(screen.getByText(kit.ideaText)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(screen.queryByText(kit.ideaText)).not.toBeInTheDocument());
    expect(screen.getByText("还没有内容包")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/kits/kit-1", { method: "DELETE" });
    expect(removeKit).toHaveBeenCalledWith(kit.id);
  });

  it("keeps the kit and explains an API failure inline", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") return jsonResponse({ error: "暂时无法删除，请重试。" }, 503);
      return jsonResponse({ kits: [kit] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PackagesPage />);
    expect(await screen.findByText(kit.ideaText)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /删除: 一份可以安全删除/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法删除，请重试。");
    expect(screen.getByText(kit.ideaText)).toBeInTheDocument();
    expect(removeKit).not.toHaveBeenCalled();
  });
});

const kit2: ContentKit = { ...kit, id: "kit-2", ideaText: "第二条可删除内容", createdAt: "2026-07-14T12:00:00.000Z" };
const kit3: ContentKit = { ...kit, id: "kit-3", ideaText: "第三条可删除内容", createdAt: "2026-07-13T12:00:00.000Z" };
const kit4: ContentKit = { ...kit, id: "kit-4", ideaText: "第四条可删除内容", createdAt: "2026-07-12T12:00:00.000Z" };

describe("Content Library batch delete", () => {
  afterEach(() => {
    // Restore real timers in case a test (e.g. the aggregation one) left
    // fake timers enabled after failing mid-flight.
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.mocked(addToast).mockReset();
    removeKit.mockReset();
  });

  it("restores batch-deleted kits when Undo is clicked inside the window", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") return jsonResponse({ deleted: true, kitId: "kit-1" });
      return jsonResponse({ kits: [kit, kit2] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PackagesPage />);
    expect(await screen.findByText(kit.ideaText)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "批量管理" }));
    fireEvent.click(screen.getAllByRole("button", { name: "全选本页" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /删除 \(2\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    // Optimistic removal — both kits gone before the server is touched.
    expect(screen.queryByText(kit.ideaText)).not.toBeInTheDocument();

    // Fire the Undo callback captured on the success toast.
    const lastCall = vi.mocked(addToast).mock.calls.at(-1);
    const undo = (lastCall?.[3] as { onClick?: () => void } | undefined)?.onClick;
    await act(async () => {
      undo?.();
    });

    expect(await screen.findByText(kit.ideaText)).toBeInTheDocument();
    expect(screen.getByText(kit2.ideaText)).toBeInTheDocument();
    // Undo cleared the commit timer, so no DELETE ever reached the server.
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("aggregates batch delete failures into a single restore toast", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") return jsonResponse({ deleted: false, error: "fail" }, 500);
      return jsonResponse({ kits: [kit, kit2, kit3] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PackagesPage />);
    await act(async () => {
      await vi.runAllTicks();
    });

    fireEvent.click(screen.getByRole("button", { name: "批量管理" }));
    fireEvent.click(screen.getAllByRole("button", { name: "全选本页" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /删除 \(3\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    vi.mocked(addToast).mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6001);
    });

    // Three kits failed, but only ONE error toast fires (the regression was N).
    expect(vi.mocked(addToast).mock.calls.filter((c) => c[0] === "error")).toHaveLength(1);
    // Failed kits are restored to the list.
    expect(screen.getByText(kit.ideaText)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("keeps two overlapping batch deletes independently undoable", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") return jsonResponse({ deleted: true });
      return jsonResponse({ kits: [kit, kit2, kit3, kit4] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PackagesPage />);
    expect(await screen.findByText(kit.ideaText)).toBeInTheDocument();

    // Batch 1: select the two newest kits (rendered first by createdAt desc).
    fireEvent.click(screen.getByRole("button", { name: "批量管理" }));
    const checkboxes1 = screen.getAllByRole("button", { name: "已选 1 项" });
    fireEvent.click(checkboxes1[0]);
    fireEvent.click(checkboxes1[1]);
    fireEvent.click(screen.getByRole("button", { name: /删除 \(2\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    const undo1 = (vi.mocked(addToast).mock.calls.at(-1)?.[3] as { onClick: () => void }).onClick;

    // Batch 2: remaining two kits, while batch 1 is still in its undo window.
    fireEvent.click(screen.getByRole("button", { name: "批量管理" }));
    const checkboxes2 = screen.getAllByRole("button", { name: "已选 1 项" });
    fireEvent.click(checkboxes2[0]);
    fireEvent.click(checkboxes2[1]);
    fireEvent.click(screen.getByRole("button", { name: /删除 \(2\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    const undo2 = (vi.mocked(addToast).mock.calls.at(-1)?.[3] as { onClick: () => void }).onClick;

    expect(screen.queryByText(kit.ideaText)).not.toBeInTheDocument();
    expect(screen.queryByText(kit3.ideaText)).not.toBeInTheDocument();

    // Undo batch 1 → only kit & kit2 come back (previously the 2nd batch
    // clobbered batch 1's snapshot, making it un-undoable).
    await act(async () => {
      undo1();
    });
    expect(await screen.findByText(kit.ideaText)).toBeInTheDocument();
    expect(screen.getByText(kit2.ideaText)).toBeInTheDocument();
    expect(screen.queryByText(kit3.ideaText)).not.toBeInTheDocument();

    // Undo batch 2 → kit3 & kit4 come back too.
    await act(async () => {
      undo2();
    });
    expect(await screen.findByText(kit3.ideaText)).toBeInTheDocument();

    // Both undone before their windows elapsed → nothing committed.
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
