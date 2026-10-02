import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhotoImpact } from "@/components/workbench/cover/photo/PhotoImpact";
import { coverSizes, getCoverTypeScale, photoCompositions, resolvePhotoComposition } from "@/lib/cover/cover-spec";
import { getEditorialTheme } from "@/lib/cover/cover-themes";

const content = {
  title: "把增长装进一个账户",
  kicker: "增长复盘",
  meta: "2026-09",
  highlight: "从内容到转化的三步"
};

function renderComposition(composition?: "cinematic" | "split" | "portrait-window" | "bottom-band") {
  return render(
    <PhotoImpact
      imageUrl="https://example.com/portrait.jpg"
      theme={getEditorialTheme("ink-classic")}
      size={coverSizes["xhs-3x4"]}
      sizeId="xhs-3x4"
      type={getCoverTypeScale("xhs-3x4")}
      content={content}
      composition={composition}
    />
  );
}

describe("photo cover compositions", () => {
  it("offers four composition options with copy-clean labels", () => {
    expect(photoCompositions.map((option) => option.id)).toEqual(["cinematic", "split", "portrait-window", "bottom-band"]);
    for (const option of photoCompositions) {
      expect(option.nameZh).not.toMatch(/[。.]/);
      expect(option.nameEn).not.toMatch(/[。]/);
      expect(option.hintZh.length).toBeGreaterThan(4);
    }
  });

  it("falls back to the legacy cinematic treatment when no composition is chosen", () => {
    expect(resolvePhotoComposition({})).toBe("cinematic");
    expect(resolvePhotoComposition({ photoComposition: "bottom-band" })).toBe("bottom-band");
  });

  it("keeps every visible word browser-rendered in each composition", () => {
    for (const composition of ["cinematic", "split", "portrait-window", "bottom-band"] as const) {
      const { unmount } = renderComposition(composition);
      expect(screen.getByText(content.title)).toBeInTheDocument();
      expect(screen.getByText(content.kicker)).toBeInTheDocument();
      expect(screen.getByText(content.highlight)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders genuinely different canvas structures per composition", () => {
    const { container: cinematic } = renderComposition("cinematic");
    expect(cinematic.querySelector("h1")).not.toBeNull();
    expect(cinematic.textContent).toContain("FINFOLD · CONTENT STUDIO");

    const { container: split } = renderComposition("split");
    expect(split.querySelectorAll("img").length).toBe(1);
    expect(split.querySelector("h1")?.style.whiteSpace).toBe("pre-line");

    const { container: window } = renderComposition("portrait-window");
    const paperHost = window.firstElementChild as HTMLElement;
    expect(paperHost.style.background).toContain("rgb(243, 240, 232)");

    const { container: band } = renderComposition("bottom-band");
    const bandHost = band.firstElementChild as HTMLElement;
    expect(bandHost.childElementCount).toBe(2);
    expect(bandHost.lastElementChild?.tagName).toBe("DIV");
  });

  it("survives every exported board size in every composition", () => {
    const sizes = ["xhs-3x4", "wechat-21x9", "wechat-1x1", "wide-16x9", "square-1x1"] as const;
    const compositions = ["cinematic", "split", "portrait-window", "bottom-band"] as const;
    for (const sizeId of sizes) {
      for (const composition of compositions) {
        const { container, unmount } = render(
          <PhotoImpact
            imageUrl="https://example.com/portrait.jpg"
            theme={getEditorialTheme("midnight-ink")}
            size={coverSizes[sizeId]}
            sizeId={sizeId}
            type={getCoverTypeScale(sizeId)}
            content={content}
            composition={composition}
          />
        );
        expect(container.textContent, `${sizeId}/${composition}`).toContain(content.title);
        unmount();
      }
    }
  });

  it("does not crash on empty title, kicker, or highlight content", () => {
    const blank = { title: "", kicker: "", meta: "", highlight: "" };
    for (const composition of ["cinematic", "split", "portrait-window", "bottom-band"] as const) {
      const { container, unmount } = render(
        <PhotoImpact
          imageUrl="https://example.com/portrait.jpg"
          theme={getEditorialTheme("ink-classic")}
          size={coverSizes["xhs-3x4"]}
          sizeId="xhs-3x4"
          type={getCoverTypeScale("xhs-3x4")}
          content={blank}
          composition={composition}
        />
      );
      expect(container.firstElementChild).not.toBeNull();
      unmount();
    }
  });
});
