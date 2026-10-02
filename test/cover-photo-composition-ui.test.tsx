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
  id: "output-xhs-photo",
  platform: "xiaohongshu",
  title: "一张图讲清产品更新",
  body: "先说结论，再展示真实截图。",
  cta: "收藏这张检查表",
  notes: "Use a real screenshot.",
  strategy: "Visual-first Xiaohongshu note.",
  imageUrl: "https://example.com/existing-cover.jpg",
  locked: false,
  publishStatus: "draft",
  userEdited: false
} as unknown as KitOutput;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn().mockReturnValue("blob:cover") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

describe("CoverStudio photo composition picker", () => {
  it("offers four compositions for a photo cover with an image and switches the active one", () => {
    render(<CoverStudio output={output} platform="xiaohongshu" locale="zh" onClose={vi.fn()} />);

    const picker = screen.getByTestId("photo-composition-picker");
    const buttons = Array.from(picker.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual(["沉浸式", "分栏", "人物窗", "标题带"]);
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "人物窗" }));
    expect(screen.getByRole("button", { name: "人物窗" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "沉浸式" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "标题带" }));
    expect(screen.getByRole("button", { name: "标题带" })).toHaveAttribute("aria-pressed", "true");
  });
});
