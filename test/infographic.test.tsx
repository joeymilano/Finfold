import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ capture: vi.fn(), exportPng: vi.fn() }));

vi.mock("@/lib/posthog", () => ({ captureEvent: mocks.capture }));
vi.mock("@/lib/cover/cover-export", () => ({ exportCoverPng: mocks.exportPng }));

import { InfographicCanvas } from "@/components/workbench/infographic/InfographicCanvas";
import { InfographicStudio } from "@/components/workbench/infographic/InfographicStudio";
import { defaultInfographicSpec, getInfographicSize, infographicLayouts } from "@/lib/infographic/spec";
import type { KitOutput } from "@/lib/content-schema";

const output: KitOutput = {
  id: "output-wechat",
  platform: "wechat",
  title: "内容增长的三个数字",
  body: "先说结论：闭环比产量更重要。\n\n- 曝光量提升 42%\n- 点击率提升 3.1%\n- 关注转化翻 2 倍\n\n把每次发布当成一次实验。",
  cta: "回复漏斗断点",
  imageUrl: "",
  visualAssets: []
} as unknown as KitOutput;

const spec = defaultInfographicSpec(output);

describe("infographic spec", () => {
  it("offers six layouts with copy-clean labels", () => {
    expect(infographicLayouts.map((layout) => layout.id)).toEqual(["stats-grid", "timeline", "process", "comparison", "checklist", "quote-board"]);
    for (const layout of infographicLayouts) {
      expect(layout.nameZh).not.toMatch(/[。]/);
      expect(layout.hintZh.length).toBeGreaterThan(4);
      expect(layout.minItems).toBeLessThanOrEqual(layout.maxItems);
    }
  });

  it("seeds a spec from the body's list lines and surfaces embedded numbers", () => {
    const spec = defaultInfographicSpec(output);
    expect(spec.items.length).toBe(3);
    expect(spec.items[0].label).toContain("曝光量");
    expect(spec.items[0].value).toBe("42%");
    expect(spec.items[1].value).toBe("3.1%");
  });

  it("falls back to the tall board for unknown size ids", () => {
    expect(getInfographicSize("xhs-3x4").width).toBe(1080);
  });
});

describe("infographic canvas", () => {
  it("renders the title and items as real text in every layout", () => {
    for (const layout of infographicLayouts) {
      const clamped = layout.id === "quote-board" ? { ...spec, layout: layout.id, items: [spec.items[0]] } : { ...spec, layout: layout.id };
      const { container, unmount } = render(<InfographicCanvas spec={clamped} size={getInfographicSize("xhs-3x4")} sizeId="xhs-3x4" />);
      expect(container.textContent).toContain("内容增长的三个数字");
      expect(container.textContent).toContain("FINFOLD · INFOGRAPHIC");
      unmount();
    }
  });

  it("switches palette assets between editorial and swiss styles", () => {
    const { container: editorial } = render(<InfographicCanvas spec={{ ...spec, style: "editorial", themeId: "ink-classic" }} size={getInfographicSize("xhs-3x4")} sizeId="xhs-3x4" />);
    expect((editorial.firstElementChild as HTMLElement).style.background).toContain("rgb(243, 240, 232)");

    const { container: swiss } = render(<InfographicCanvas spec={{ ...spec, style: "swiss", themeId: "ikb" }} size={getInfographicSize("xhs-3x4")} sizeId="xhs-3x4" />);
    const swissHost = swiss.firstElementChild as HTMLElement;
    expect(swissHost.style.background).toContain("250, 250, 248");
    expect(swissHost.style.backgroundImage).toContain("radial-gradient");
  });
});

describe("infographic studio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens with the layout picker and clamps items when switching layouts", () => {
    render(<InfographicStudio output={output} locale="zh" onClose={() => undefined} />);

    expect(screen.getByTestId("infographic-layout-picker").childElementCount).toBe(6);
    expect(screen.getAllByTestId("infographic-items-editor").length).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "清单" }));
    expect(screen.getByTestId("infographic-items-editor").childElementCount).toBe(3);

    fireEvent.click(screen.getByRole("button", { name: "金句板" }));
    expect(screen.getByTestId("infographic-items-editor").childElementCount).toBe(1);

    expect(screen.getByTestId("infographic-preview").textContent).toContain("内容增长的三个数字");
  });

  it("routes locked exports through the upgrade gate instead of exporting", async () => {
    const onLockedExport = vi.fn();
    const { exportPng } = mocks;
    render(<InfographicStudio output={output} locale="zh" canExport={false} onLockedExport={onLockedExport} onClose={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "升级后导出" }));
    expect(onLockedExport).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(exportPng).not.toHaveBeenCalled();
  });

  it("survives degenerate specs: empty items, single-sided comparison, square board", () => {
    const { container: emptyItems } = render(<InfographicCanvas spec={{ ...spec, items: [] }} size={getInfographicSize("xhs-3x4")} sizeId="xhs-3x4" />);
    expect(emptyItems.textContent).toContain("内容增长的三个数字");

    const { container: oneSided } = render(
      <InfographicCanvas spec={{ ...spec, layout: "comparison", items: [{ label: "只有一侧" }] }} size={getInfographicSize("xhs-3x4")} sizeId="xhs-3x4" />
    );
    expect(oneSided.textContent).toContain("只有一侧");
    expect(oneSided.textContent).toContain("B");

    for (const layout of infographicLayouts) {
      const { container, unmount } = render(
        <InfographicCanvas spec={{ ...spec, layout: layout.id, items: layout.id === "quote-board" ? spec.items.slice(0, 1) : spec.items }} size={getInfographicSize("square-1x1")} sizeId="square-1x1" />
      );
      expect(container.textContent, layout.id).toContain("FINFOLD · INFOGRAPHIC");
      unmount();
    }
  });

  it("renders with an empty body without inventing content", () => {
    const seeded = defaultInfographicSpec({ title: "空正文", body: "", finalBody: "" } as unknown as KitOutput);
    expect(seeded.items.length).toBeGreaterThanOrEqual(2);
    const { container } = render(<InfographicCanvas spec={seeded} size={getInfographicSize("xhs-3x4")} sizeId="xhs-3x4" />);
    expect(container.textContent).toContain("空正文");
  });
});
