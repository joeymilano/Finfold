import { describe, expect, it } from "vitest";
import { buildPublicationPackage } from "@/lib/publication-package";
import type { KitOutput } from "@/lib/content-schema";
import type { VisualStory } from "@/lib/visual-story";

const output: KitOutput = {
  id: "output-1",
  platform: "xiaohongshu",
  title: "内容系统",
  body: "第一段证据。\n\n第二段结论。",
  cta: "保存这份方法",
  notes: "notes",
  strategy: "strategy",
  locked: false,
  publishStatus: "draft",
  userEdited: false,
  visualAssets: [
    {
      id: "old",
      assetType: "article_illustration",
      positionIndex: 0,
      role: "evidence",
      sourceExcerpt: "第一段证据。",
      placementHint: "第一段后",
      prompt: "old",
      imageUrl: "https://example.com/old.png",
      altText: "旧图",
      metadata: {},
      revision: 1,
      isCurrent: false
    },
    {
      id: "current",
      assetType: "article_illustration",
      positionIndex: 0,
      role: "evidence",
      sourceExcerpt: "第一段证据。",
      placementHint: "第一段后",
      prompt: "current",
      imageUrl: "https://example.com/current.png",
      altText: "当前证据图",
      metadata: {},
      revision: 2,
      isCurrent: true
    }
  ]
};

const story: VisualStory = {
  title: "内容系统图文",
  artDirection: "清晰编辑感",
  theme: "editorial",
  strategy: "information-dense",
  pages: [
    { id: "p1", role: "cover", kicker: "方法", title: "内容系统", body: "", points: [], emphasis: "" },
    { id: "p2", role: "insight", kicker: "证据", title: "先看证据", body: "第一段证据。", points: [], emphasis: "证据" },
    { id: "p3", role: "cta", kicker: "行动", title: "保存方法", body: "", points: [], emphasis: "现在开始" }
  ]
};

describe("buildPublicationPackage", () => {
  it("装配正文、当前配图和轮播平台规格", () => {
    const result = buildPublicationPackage({
      output,
      platform: "xiaohongshu",
      locale: "zh",
      story,
      formatId: "portrait-3x4",
      generatedAt: "2026-07-15T10:00:00.000Z"
    });

    expect(result.publication.body).toContain("![当前证据图](https://example.com/current.png)");
    expect(result.publication.body).not.toContain("old.png");
    expect(result.articleIllustrations).toHaveLength(1);
    expect(result.schemaVersion).toBe(2);
    expect(result.contentSkill.id).toBe("xhs-native-carousel");
    expect(result.motionStoryboard.nodes).toHaveLength(3);
    expect(result.visualStory).toMatchObject({ width: 1080, height: 1440, ratio: "3:4", pageCount: 3 });
    expect(result.visualStory.pages.map((page) => page.filename)).toEqual([
      "visual-story-01.png",
      "visual-story-02.png",
      "visual-story-03.png"
    ]);
  });
});
