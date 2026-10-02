import { describe, expect, it } from "vitest";
import {
  buildPublishingHandoffManifest,
  getPublishingHandoffProfile,
  publishingImageUrls,
  supportsPublishingHandoff,
  validatePublishingHandoff
} from "@/lib/publishing-handoff";

const output = {
  platform: "xiaohongshu" as const,
  title: "内容增长别只看爆款",
  body: "先判断真实基线，再只改变一个变量。每次发布都记录目标、结果和下一步，让内容经验能被复用，而不是追逐偶然爆款。",
  cta: "收藏这份发布检查清单",
  imageUrl: "https://example.com/cover.jpg",
  visualAssets: [
    {
      assetType: "article_illustration" as const,
      positionIndex: 2,
      role: "evidence" as const,
      sourceExcerpt: "记录结果",
      placementHint: "结尾前",
      prompt: "result card",
      imageUrl: "https://example.com/page-3.jpg",
      altText: "结果卡片",
      metadata: {}
    },
    {
      assetType: "article_illustration" as const,
      positionIndex: 0,
      role: "process" as const,
      sourceExcerpt: "判断基线",
      placementHint: "首段后",
      prompt: "baseline",
      imageUrl: "https://example.com/page-1.jpg",
      altText: "基线判断",
      metadata: {}
    },
    {
      assetType: "article_illustration" as const,
      positionIndex: 1,
      role: "process" as const,
      sourceExcerpt: "改变变量",
      placementHint: "中段",
      prompt: "variable",
      imageUrl: "https://example.com/page-2.jpg",
      altText: "单变量实验",
      metadata: {},
      isCurrent: false
    }
  ]
};

describe("publishing handoff", () => {
  it("supports only the three verified handoff routes", () => {
    expect(supportsPublishingHandoff("wechat")).toBe(true);
    expect(supportsPublishingHandoff("linkedin")).toBe(true);
    expect(supportsPublishingHandoff("xiaohongshu")).toBe(true);
    expect(supportsPublishingHandoff("x")).toBe(false);
  });

  it("uses the official editors and platform-appropriate copy formats", () => {
    expect(getPublishingHandoffProfile("wechat")).toMatchObject({
      editorUrl: "https://mp.weixin.qq.com/",
      copyFormat: "rich_html"
    });
    expect(getPublishingHandoffProfile("linkedin")).toMatchObject({
      editorUrl: "https://www.linkedin.com/article/new/",
      copyFormat: "rich_html"
    });
    expect(getPublishingHandoffProfile("xiaohongshu")).toMatchObject({
      editorUrl: "https://creator.xiaohongshu.com/publish/publish",
      copyFormat: "plain_text"
    });
  });

  it("keeps the cover first and current inline images in content order", () => {
    expect(publishingImageUrls(output)).toEqual([
      "https://example.com/cover.jpg",
      "https://example.com/page-1.jpg",
      "https://example.com/page-3.jpg"
    ]);
  });

  it("states the real delivery boundary in the downloadable manifest", () => {
    const manifest = buildPublishingHandoffManifest(output, "zh");

    expect(manifest.deliveryMode).toBe("guided_handoff");
    expect(manifest.directPublishing).toBe(false);
    expect(manifest.imageWorkflow).toBe("ordered-carousel");
    expect(manifest.imageUrls).toHaveLength(3);
    expect(manifest.steps).toContain("按编号一次上传全部图片");
  });

  it("blocks a weak handoff instead of silently calling it ready", () => {
    const checks = validatePublishingHandoff({
      platform: "xiaohongshu",
      title: "太短",
      body: "也太短",
      cta: "",
      imageUrl: "",
      visualAssets: []
    }, "zh");

    expect(checks.find((check) => check.key === "title")?.ok).toBe(false);
    expect(checks.find((check) => check.key === "body")?.ok).toBe(false);
    expect(checks.find((check) => check.key === "cover")?.ok).toBe(false);
    expect(checks.find((check) => check.key === "images")?.ok).toBe(false);
  });
});
