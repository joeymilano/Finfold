import "@testing-library/jest-dom/vitest";
import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutputBoard } from "@/components/workbench/OutputBoard";
import type { KitOutput, MediaAsset } from "@/lib/content-schema";

vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/components/ui/Toast", () => ({ addToast: vi.fn() }));
vi.mock("@/components/workbench/PlatformBrandIcon", () => ({ PlatformGlyph: () => null }));
vi.mock("@/components/workbench/mockups/SocialMockup", () => ({ SocialMockup: () => <div>preview</div> }));
vi.mock("@/components/workbench/cover/CoverStudio", () => ({ CoverStudio: () => null }));
vi.mock("@/components/workbench/visual-intelligence/VisualAssetPlanCard", () => ({ VisualAssetPlanCard: () => null }));

const output: KitOutput = {
  id: "xhs-output-1",
  platform: "xiaohongshu",
  title: "设计师 7 天复盘清单",
  body: "先说结论：问题不是能力，而是表达顺序。\n\n1. 写真实场景\n2. 放过程截图\n3. 用检查表收束",
  cta: "关注这个系列，下一篇继续公开真实复盘。",
  notes: "Keep it concrete.",
  strategy: "Save-worthy checklist.",
  locked: false,
  publishStatus: "draft",
  userEdited: false
};

const riskyAsset: MediaAsset = {
  id: "asset-qr",
  name: "product-with-qr.png",
  type: "image",
  size: 1200,
  compliance: { qrCode: "detected" }
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as Response);
}

function Harness() {
  const [outputs, setOutputs] = useState([output]);
  return (
    <OutputBoard
      outputs={outputs}
      isLoading={false}
      error={null}
      locale="zh"
      canUseOutputs
      kitId="kit-xhs"
      mediaAssets={[riskyAsset]}
      onOutputSaved={(platform, patch) => setOutputs((current) => current.map((item) => item.platform === platform ? { ...item, ...patch } : item))}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Xiaohongshu publish guard", () => {
  it("requires an explicit final-image confirmation before marking published", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/outputs/xhs-output-1") && init?.method === "PUT") {
        return jsonResponse({ output: { ...output, publishStatus: "posted", publishedAt: new Date().toISOString() } });
      }
      if (url.startsWith("/api/brand-brain")) return jsonResponse({ brain: {}, persisted: false });
      if (url.startsWith("/api/output-feedback")) return jsonResponse({ feedback: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness />);
    expect(screen.getByTestId("xhs-image-compliance-alert")).toHaveTextContent("发布前必须复核");

    fireEvent.click(screen.getByRole("button", { name: "标记已发布" }));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/outputs/xhs-output-1"), expect.objectContaining({ method: "PUT" }));

    const confirm = screen.getByRole("button", { name: "已确认最终发布图无站外导流，继续" });
    fireEvent.click(confirm);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/kits/kit-xhs/outputs/xhs-output-1",
      expect.objectContaining({ method: "PUT" })
    ));
  });
});
