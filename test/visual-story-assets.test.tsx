import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VisualStoryStudio } from "@/components/workbench/visual-story/VisualStoryStudio";
import { VisualAssetPlanCard } from "@/components/workbench/visual-intelligence/VisualAssetPlanCard";
import type { KitOutput } from "@/lib/content-schema";
import type { VisualIntelligencePlan } from "@/lib/visual-intelligence";

vi.mock("@/components/workbench/visual-story/VisualStoryCanvas", () => ({
  VisualStoryCanvas: ({ coverImageUrl }: { coverImageUrl?: string }) => (
    <div data-testid="story-canvas" data-cover-image={coverImageUrl ?? ""} />
  )
}));

vi.mock("@/components/workbench/cover/CoverStudio", () => ({
  CoverStudio: ({ onSaveCover, onClose }: { onSaveCover?: (url: string) => void; onClose: () => void }) => (
    <div role="dialog" aria-label="完整封面工作室">
      <p>模板 · Pexels · Pixabay · 上传 · AI 图片</p>
      <button type="button" onClick={() => onSaveCover?.("https://cdn.example.com/new-cover.png")}>保存测试封面</button>
      <button type="button" onClick={onClose}>返回图文组</button>
    </div>
  )
}));

const output: KitOutput = {
  id: "output-visual-1",
  platform: "xiaohongshu",
  title: "为什么好内容仍然需要好封面",
  body: "一套完整图文组应该让封面、图库与逐页编排在同一个连续工作流中完成。",
  cta: "收藏这套方法",
  notes: "保持品牌一致",
  strategy: "用封面建立停留，再用逐页内容承接",
  locked: false,
  publishStatus: "draft",
  imageUrl: "https://cdn.example.com/old-cover.png",
  userEdited: false
};

const plan: VisualIntelligencePlan = {
  skillId: "xhs-native-carousel",
  strategy: "information-dense",
  layout: "checklist",
  outcome: "收藏与分享",
  steps: ["拆解内容", "逐页排版"],
  assetKind: "carousel",
  primaryStudio: "story",
  formatId: "portrait-3x4",
  pageCount: 5,
  theme: "editorial",
  title: "高信号图文组",
  rationale: "用多页结构承接完整内容。",
  formatSummary: "1080×1440 · 3:4",
  confidence: "high",
  brandAligned: false
};

afterEach(() => {
  if (typeof window.localStorage.clear === "function") window.localStorage.clear();
});

describe("visual story asset workflow", () => {
  it("keeps the full cover and stock-library workflow inside the visual-story studio", () => {
    const onCoverSaved = vi.fn();
    render(
      <VisualStoryStudio
        output={output}
        platform="xiaohongshu"
        locale="zh"
        plan={plan}
        onClose={vi.fn()}
        onCoverSaved={onCoverSaved}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "封面与素材" }));
    expect(screen.getByRole("dialog", { name: "完整封面工作室" })).toBeInTheDocument();
    expect(screen.getByText("模板 · Pexels · Pixabay · 上传 · AI 图片")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存测试封面" }));
    expect(onCoverSaved).toHaveBeenCalledWith("https://cdn.example.com/new-cover.png");
    expect(screen.getAllByTestId("story-canvas")[0]).toHaveAttribute("data-cover-image", "https://cdn.example.com/new-cover.png");
  });

  it("names both visual actions explicitly on the output card", () => {
    render(
      <VisualAssetPlanCard
        plan={plan}
        locale="zh"
        onOpenPrimary={vi.fn()}
        onOpenCover={vi.fn()}
        onOpenStory={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "编辑完整图文组" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "封面与图库" })).toBeInTheDocument();
  });
});
