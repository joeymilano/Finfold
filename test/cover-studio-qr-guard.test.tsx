import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), capture: vi.fn() }));

vi.mock("@/lib/image-compliance-client", () => ({ inspectImageCompliance: mocks.inspect }));
vi.mock("@/lib/posthog", () => ({ captureEvent: mocks.capture }));
vi.mock("@/components/workbench/cover/CoverCanvas", () => ({ CoverCanvas: () => <div data-testid="cover-canvas" /> }));

import { CoverStudio } from "@/components/workbench/cover/CoverStudio";
import type { KitOutput } from "@/lib/content-schema";

const output: KitOutput = {
  id: "cover-output-xhs",
  platform: "xiaohongshu",
  title: "一张图讲清产品更新",
  body: "先说结论，再展示真实截图。",
  cta: "收藏这张检查表",
  notes: "Use a real screenshot.",
  strategy: "Visual-first Xiaohongshu note.",
  locked: false,
  publishStatus: "draft",
  userEdited: false
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inspect.mockResolvedValue({ qrCode: "detected" });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn().mockReturnValue("blob:cover") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

describe("CoverStudio Xiaohongshu QR guard", () => {
  it("shows the risk and requires an explicit manual override for a flagged upload", async () => {
    const { container } = render(<CoverStudio output={output} platform="xiaohongshu" locale="zh" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "上传" }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [new File(["image"], "cover.png", { type: "image/png" })] } });

    expect(await screen.findByTestId("xhs-cover-qr-warning")).toHaveTextContent("检测到疑似二维码");
    fireEvent.click(screen.getByRole("button", { name: "确认这不是站外导流，允许导出" }));
    expect(screen.getByTestId("xhs-cover-qr-warning")).toHaveTextContent("已人工确认");
  });
});
