import { describe, expect, it } from "vitest";
import { platforms } from "@/lib/platforms";
import { coverSizes, defaultCoverConfig, getPlatformCoverSpec, isWechatPair, platformCoverSpecs, resolvePhotoComposition } from "@/lib/cover/cover-spec";

describe("cover spec", () => {
  it("defines a spec for every platform", () => {
    platforms.forEach((platform) => {
      expect(platformCoverSpecs[platform.id]).toBeDefined();
    });
  });

  it("gives wechat exactly the 21:9 + 1:1 pair", () => {
    const spec = getPlatformCoverSpec("wechat");
    expect(spec.sizes).toEqual(["wechat-21x9", "wechat-1x1"]);
    expect(isWechatPair("wechat")).toBe(true);
  });

  it("marks non-wechat platforms as single-size", () => {
    expect(isWechatPair("xiaohongshu")).toBe(false);
    expect(isWechatPair("x")).toBe(false);
  });

  it("recommends photo-led covers for visual platforms, editorial for narrative platforms, and swiss for product/data platforms", () => {
    expect(getPlatformCoverSpec("xiaohongshu").recommendedStyle).toBe("photo");
    expect(getPlatformCoverSpec("instagram").recommendedStyle).toBe("photo");
    expect(getPlatformCoverSpec("wechat").recommendedStyle).toBe("editorial");
    expect(getPlatformCoverSpec("zhihu").recommendedStyle).toBe("editorial");
    expect(getPlatformCoverSpec("moments").recommendedStyle).toBe("editorial");
    expect(getPlatformCoverSpec("medium-substack").recommendedStyle).toBe("editorial");

    expect(getPlatformCoverSpec("x").recommendedStyle).toBe("swiss");
    expect(getPlatformCoverSpec("linkedin").recommendedStyle).toBe("swiss");
    expect(getPlatformCoverSpec("product-hunt").recommendedStyle).toBe("swiss");
    expect(getPlatformCoverSpec("hacker-news").recommendedStyle).toBe("swiss");
    expect(getPlatformCoverSpec("indie-hackers").recommendedStyle).toBe("swiss");
    expect(getPlatformCoverSpec("reddit").recommendedStyle).toBe("swiss");
    expect(getPlatformCoverSpec("threads").recommendedStyle).toBe("swiss");
  });

  it("computes exported pixel dimensions consistently from css size and scale", () => {
    Object.values(coverSizes).forEach((size) => {
      expect(size.width).toBe(size.cssWidth * size.scale);
      expect(size.height).toBe(size.cssHeight * size.scale);
    });
  });

  it("builds a default config that matches the platform's recommended style", () => {
    const config = defaultCoverConfig("x", { title: "Ship it" });
    expect(config.style).toBe("swiss");
    expect(config.layout).toBe("statement");

    const wechatConfig = defaultCoverConfig("wechat", { title: "长标题示例" });
    expect(wechatConfig.style).toBe("editorial");
    expect(wechatConfig.shortTitle).toBe("长标题示例");

    const xhsWithVisual = defaultCoverConfig("xiaohongshu", { title: "别让图片模型写中文", imageUrl: "https://example.com/visual.jpg" });
    expect(xhsWithVisual.style).toBe("photo");
    expect(xhsWithVisual.themeId).toBe("midnight-ink");

    const xhsWithoutVisual = defaultCoverConfig("xiaohongshu", { title: "没有图片也能安全降级" });
    expect(xhsWithoutVisual.style).toBe("editorial");
  });

  it("preserves a normalized source focal point for deterministic crops", () => {
    const config = defaultCoverConfig("xiaohongshu", {
      title: "Astra",
      imageUrl: "https://example.com/astra.jpg",
      imageSource: {
        id: "source-astra",
        cachedUrl: "https://example.com/astra.jpg",
        originalUrl: "https://openai.com/astra.jpg",
        pageUrl: "https://openai.com/astra",
        provider: "official_page",
        domain: "openai.com",
        width: 1600,
        height: 900,
        rightsStatus: "official_unverified",
        confidence: "high",
        focalPoint: { x: 0.72, y: 0.31 },
        capturedAt: "2026-09-04T00:00:00.000Z"
      }
    });
    expect(config.focalPoint).toEqual({ x: 0.72, y: 0.31 });
    expect(config.photoComposition).toBeUndefined();
    expect(resolvePhotoComposition(config)).toBe("cinematic");
  });
});
