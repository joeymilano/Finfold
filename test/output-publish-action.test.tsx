import "@testing-library/jest-dom/vitest";
import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutputBoard } from "@/components/workbench/OutputBoard";
import type { KitOutput } from "@/lib/content-schema";
import { addToast } from "@/components/ui/Toast";

vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/components/ui/Toast", () => ({ addToast: vi.fn() }));
vi.mock("@/components/workbench/PlatformBrandIcon", () => ({ PlatformGlyph: () => null }));
vi.mock("@/components/workbench/mockups/SocialMockup", () => ({ SocialMockup: () => <div>preview</div> }));
vi.mock("@/components/workbench/visual-intelligence/VisualAssetPlanCard", () => ({ VisualAssetPlanCard: () => null }));

const draftOutput: KitOutput = {
  id: "output-1",
  platform: "x",
  title: "Launch note",
  body: "A finished launch note ready to publish.",
  cta: "Read more",
  notes: "Keep the hook direct.",
  strategy: "Founder-led launch update.",
  locked: false,
  publishStatus: "draft",
  userEdited: false
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as Response);
}

function Harness() {
  const [outputs, setOutputs] = useState<KitOutput[]>([draftOutput]);
  return (
    <OutputBoard
      outputs={outputs}
      isLoading={false}
      error={null}
      locale="zh"
      canUseOutputs
      kitId="kit-1"
      onOutputSaved={(platform, patch) => {
        setOutputs((current) => current.map((output) => output.platform === platform ? { ...output, ...patch } : output));
      }}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OutputBoard publish action", () => {
  it("shows a durable published confirmation after saving", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/outputs/output-1") && init?.method === "PUT") {
        return jsonResponse({ output: { ...draftOutput, publishStatus: "posted", publishedAt: "2026-07-15T14:00:00.000Z" } });
      }
      if (url.startsWith("/api/brand-brain")) return jsonResponse({ brain: {}, persisted: false });
      if (url.startsWith("/api/output-feedback")) return jsonResponse({ feedback: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "标记已发布" }));
    fireEvent.click(screen.getByRole("button", { name: "暂不填链接，仍标记发布" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "标记已发布" })).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("已发布");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/kits/kit-1/outputs/output-1",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ publishStatus: "posted" }) })
    );
  });

  it("rolls back and explains the failure next to the action", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/outputs/output-1") && init?.method === "PUT") {
        return jsonResponse({ error: "Temporary save failure." }, 503);
      }
      if (url.startsWith("/api/brand-brain")) return jsonResponse({ brain: {}, persisted: false });
      if (url.startsWith("/api/output-feedback")) return jsonResponse({ feedback: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "标记已发布" }));
    fireEvent.click(screen.getByRole("button", { name: "暂不填链接，仍标记发布" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Temporary save failure.");
    expect(screen.getByRole("button", { name: "标记已发布" })).toBeInTheDocument();
  });

  it("shows what Finfold really learned after the publish workflow completes", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/outputs/output-1") && init?.method === "PUT") {
        return jsonResponse({
          output: { ...draftOutput, publishStatus: "posted", publishedAt: "2026-07-15T14:00:00.000Z" },
          memoryReceipt: [{
            kind: "approved_example",
            source: "publish",
            value: draftOutput.body,
            platform: "x"
          }]
        });
      }
      if (url.startsWith("/api/brand-brain")) return jsonResponse({ brain: {}, persisted: false });
      if (url.startsWith("/api/output-feedback")) return jsonResponse({ feedback: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "标记已发布" }));
    fireEvent.click(screen.getByRole("button", { name: "暂不填链接，仍标记发布" }));

    expect(await screen.findByText("这次合作后，Finfold 更懂你了")).toBeInTheDocument();
    expect(screen.getByText("我记住了 1 件事，下次创作会自动沿用。")).toBeInTheDocument();
    expect(screen.getByText("X / Twitter这篇已发布内容，已成为参考范文")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭记忆回执" }));
    expect(screen.queryByText("这次合作后，Finfold 更懂你了")).not.toBeInTheDocument();
  });

  it("lets the user revoke a newly learned memory", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/outputs/output-1") && init?.method === "PUT") {
        return jsonResponse({
          output: { ...draftOutput, publishStatus: "posted", publishedAt: "2026-07-15T14:00:00.000Z" },
          memoryReceipt: [{
            kind: "approved_example",
            source: "publish",
            value: draftOutput.body,
            outputId: "output-1",
            platform: "x"
          }]
        });
      }
      if (url === "/api/brand-memory/forget" && init?.method === "POST") {
        return jsonResponse({ forgotten: true, count: 1 });
      }
      if (url.startsWith("/api/brand-brain")) return jsonResponse({ brain: {}, persisted: false });
      if (url.startsWith("/api/output-feedback")) return jsonResponse({ feedback: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "标记已发布" }));
    fireEvent.click(screen.getByRole("button", { name: "暂不填链接，仍标记发布" }));
    expect(await screen.findByText("这次合作后，Finfold 更懂你了")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "撤销这次记忆" }));

    await waitFor(() => expect(screen.queryByText("这次合作后，Finfold 更懂你了")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/brand-memory/forget",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          items: [{
            kind: "approved_example",
            source: "publish",
            value: draftOutput.body,
            outputId: "output-1",
            platform: "x"
          }]
        })
      })
    );
  });

  it("collects the real post URL and confirms automatic result backfill", async () => {
    const publishedUrl = "https://x.com/finfold/status/123456789";
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/outputs/output-1") && init?.method === "PUT") {
        return jsonResponse({
          output: {
            ...draftOutput,
            publishStatus: "posted",
            publishedUrl,
            publishedAt: "2026-07-15T14:00:00.000Z"
          },
          performanceBackfill: {
            mode: "automatic",
            cadenceHours: 3,
            metrics: ["likes", "comments"]
          }
        });
      }
      if (url.startsWith("/api/brand-brain")) return jsonResponse({ brain: {}, persisted: false });
      if (url.startsWith("/api/output-feedback")) return jsonResponse({ feedback: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "标记已发布" }));
    fireEvent.change(screen.getByLabelText("发布链接"), { target: { value: publishedUrl } });
    fireEvent.click(screen.getByRole("button", { name: "确认发布并连接结果" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/kits/kit-1/outputs/output-1",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ publishStatus: "posted", publishedUrl })
        })
      );
    });
    expect(addToast).toHaveBeenCalledWith(
      "success",
      "已发布。Finfold 将每 3 小时自动回采公开点赞和评论，并用于下一轮判断。"
    );
    expect(await screen.findByText("结果自动回流已开启")).toBeInTheDocument();
  });

  it("rejects a URL from the wrong platform before saving", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({})));

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "标记已发布" }));
    fireEvent.change(screen.getByLabelText("发布链接"), {
      target: { value: "https://www.reddit.com/r/startups/comments/abc/post/" }
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("请粘贴真实的 X / Twitter 发布链接。");
    expect(screen.getByRole("button", { name: "确认发布并连接结果" })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "确认发布并连接结果" })).toBeDisabled());
  });

  it("turns an unavailable paid automation into a contextual Digital Employee upgrade", async () => {
    const publishedUrl = "https://x.com/finfold/status/123456789";
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/outputs/output-1") && init?.method === "PUT") {
        return jsonResponse({
          output: {
            ...draftOutput,
            publishStatus: "posted",
            publishedUrl,
            publishedAt: "2026-07-15T14:00:00.000Z"
          },
          performanceBackfill: { mode: "needs_setup", reason: "upgrade_required" }
        });
      }
      if (url.startsWith("/api/brand-brain")) return jsonResponse({ brain: {}, persisted: false });
      if (url.startsWith("/api/output-feedback")) return jsonResponse({ feedback: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "标记已发布" }));
    fireEvent.change(screen.getByLabelText("发布链接"), { target: { value: publishedUrl } });
    fireEvent.click(screen.getByRole("button", { name: "确认发布并连接结果" }));

    const upgrade = await screen.findByRole("link", { name: "查看数字员工套餐" });
    expect(upgrade).toHaveAttribute("href", "/billing");
    expect(screen.getByText("可开启自动结果跟进")).toBeInTheDocument();
  });
});
