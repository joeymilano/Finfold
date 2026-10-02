import { describe, expect, it } from "vitest";
import {
  buildPublicationHtml,
  buildStandalonePublicationHtml,
  publicationThemes,
  validatePublicationMetadata,
  validateWechatCompliance
} from "@/lib/publication-html";

const output = {
  title: "为什么内容生成器做不出增长",
  body: "先说结论：生成不是终点，反馈闭环才是。\n\n## 从结果倒推内容\n\n1. 先看曝光\n2. 再看点击\n3. 最后看关注\n\n把每次发布当成一次可验证实验。",
  cta: "回复你的当前漏斗断点。",
  imageUrl: "https://example.com/cover.jpg",
  visualAssets: [{
    assetType: "article_illustration" as const,
    positionIndex: 0,
    role: "process" as const,
    sourceExcerpt: "从结果倒推内容",
    placementHint: "标题后",
    prompt: "flow",
    imageUrl: "https://example.com/flow.jpg",
    altText: "增长漏斗流程",
    metadata: {}
  }]
};

describe("publication HTML", () => {
  it("produces self-contained inline-styled article markup", () => {
    const html = buildPublicationHtml(output, "grace");
    expect(html).toContain('data-finfold-publication-theme="grace"');
    expect(html).toContain('style="');
    expect(html).toContain("https://example.com/flow.jpg");
    expect(html).not.toContain("<script");
  });

  it("wraps the fragment in a standalone document with metadata", () => {
    const html = buildStandalonePublicationHtml(output, "simple", "zh");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain("<meta name=\"description\"");
  });

  it("can copy an editor-ready body without duplicating the title or Finfold attribution", () => {
    const html = buildPublicationHtml(output, "default", {
      includeTitle: false,
      includeAttribution: false
    });

    expect(html).not.toContain("<h1");
    expect(html).not.toContain("Finfold · Content Operations");
    expect(html).toContain("从结果倒推内容");
  });

  it("renders historical Markdown emphasis without exposing its markers", () => {
    const html = buildPublicationHtml({
      ...output,
      title: "**为什么内容生成器做不出增长**",
      body: "**具体流程**\n\n普通说明。",
      cta: "**回复你的当前漏斗断点。**"
    }, "default");

    expect(html).toContain("<strong>");
    expect(html).not.toContain("**具体流程**");
  });

  it("reports missing cover and body readiness instead of silently publishing", () => {
    const checks = validatePublicationMetadata({
      title: "短",
      body: "太短。",
      imageUrl: "",
      visualAssets: []
    });
    expect(checks.find((check) => check.key === "cover")?.ok).toBe(false);
    expect(checks.find((check) => check.key === "body")?.ok).toBe(false);
  });

  it("ships six polished themes with full inline block styles", () => {
    expect(Object.keys(publicationThemes)).toEqual(["default", "grace", "simple", "magazine", "techblue", "sunset"]);
    for (const theme of Object.values(publicationThemes)) {
      expect(theme.quoteStyle.length).toBeGreaterThan(0);
      expect(theme.dividerHtml).toMatch(/^<(?:hr|p) /);
      expect(theme.olBadgeStyle.length).toBeGreaterThan(0);
    }
  });

  it("keeps ordered-list numbering visible instead of flattening it to bullets", () => {
    const html = buildPublicationHtml({
      ...output,
      body: "1. 先看曝光\n2. 再看点击\n3. 最后看关注"
    }, "default");
    expect(html).toContain("<ol");
    expect(html).toContain(">1</span>");
    expect(html).toContain(">3</span>");
  });

  it("renders dividers, fenced code, tables, and standalone markdown images", () => {
    const html = buildPublicationHtml({
      ...output,
      body: [
        "开头段落。",
        "---",
        "```js\nconst growth = true;\n```",
        "| 渠道 | 占比 |\n| --- | --- |\n| 搜索 | 42% |\n| 推荐 | 31% |",
        "![增长漏斗](https://example.com/funnel.jpg)"
      ].join("\n\n")
    }, "techblue");

    expect(html).toContain("border-top:1px solid");
    expect(html).toContain("const growth = true;");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain("搜索");
    expect(html).toContain("https://example.com/funnel.jpg");
  });

  it("escapes markup injected through the body so the paste stays clean", () => {
    const html = buildPublicationHtml({
      ...output,
      body: '正常段落。\n\n<script>alert("x")</script>'
    }, "default");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("passes the WeChat paste compliance gate on every theme", () => {
    for (const themeId of Object.keys(publicationThemes) as (keyof typeof publicationThemes)[]) {
      const html = buildPublicationHtml(output, themeId);
      const failed = validateWechatCompliance(html).filter((check) => !check.ok);
      expect(failed, `${themeId}: ${failed.map((check) => check.key).join(",")}`).toEqual([]);
    }
  });

  it("passes the compliance gate on every theme with every block type at once", () => {
    const richBody = [
      "导语段落。",
      "## 章节标题",
      "1）中文序号步骤一",
      "2）中文序号步骤二",
      "- 无序要点甲",
      "- 无序要点乙",
      "> 第一行引用",
      "> 第二行引用",
      "---",
      "```python\nprint('hi')\n```",
      "| 列一 | 列二 |\n| --- | --- |\n| 值一 | 值二 |",
      "![带\"引号\"的图注](https://example.com/a.jpg)",
      "收尾段落。"
    ].join("\n\n");
    for (const themeId of Object.keys(publicationThemes) as (keyof typeof publicationThemes)[]) {
      const html = buildPublicationHtml({ ...output, body: richBody }, themeId);
      const failed = validateWechatCompliance(html).filter((check) => !check.ok);
      expect(failed, `${themeId}: ${failed.map((check) => check.key).join(",")}`).toEqual([]);
      expect(html).toContain("第二行引用");
      expect(html).toContain("&#39;hi&#39;");
    }
  });

  it("renders multi-line quotes with line breaks and keeps chinese-ordered numbering", () => {
    const html = buildPublicationHtml({
      ...output,
      body: "> 第一行\n> 第二行\n\n1）步一\n2）步二"
    }, "grace");
    expect(html).toContain("第一行<br/>第二行");
    expect(html).toContain(">2</span>");
  });

  it("does not crash on frontmatter bodies, empty bodies, or stray bold markers", () => {
    const frontmatter = buildPublicationHtml({ ...output, body: "---\ntitle: 旧格式\n---\n\n正文开始。" }, "simple");
    expect(frontmatter).toContain("正文开始");

    const empty = buildPublicationHtml({ ...output, body: "   \n\n  " }, "default");
    expect(empty).toContain("<h1");

    const stray = buildPublicationHtml({ ...output, body: "这里有一个 ** 未闭合的加粗。" }, "default");
    expect(stray).not.toContain("**");
  });

  it("falls back to a paragraph when ordered markers are interleaved with prose", () => {
    const html = buildPublicationHtml({
      ...output,
      body: "1. 第一步\n中间一句普通说明\n2. 第二步"
    }, "default");
    expect(html).not.toContain("<ol");
    expect(html).toContain("中间一句普通说明");
  });
});
