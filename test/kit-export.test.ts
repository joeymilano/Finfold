import { describe, it, expect } from "vitest";
import { formatBodyWithVisualAssets, formatOutput, formatOutputHTML } from "@/lib/kit-export";
import type { KitOutput } from "@/lib/content-schema";

function sampleOutput(overrides: Partial<KitOutput> = {}): KitOutput {
  return {
    platform: "xiaohongshu",
    title: "一个测试标题",
    body: "第一段内容。\n第二行仍在第一段。\n\n第二段内容。",
    cta: "点击试试",
    notes: "备注",
    strategy: "策略",
    locked: false,
    publishStatus: "draft",
    userEdited: false,
    ...overrides
  };
}

describe("formatOutputHTML", () => {
  it("把标题渲染为 h2 并保留正文", () => {
    const html = formatOutputHTML(sampleOutput(), "zh");
    expect(html).toContain("<h2");
    expect(html).toContain("一个测试标题");
    expect(html).toContain("第一段内容。");
  });

  it("双换行拆成多个段落，段内单换行转 <br/>", () => {
    const html = formatOutputHTML(sampleOutput(), "zh");
    // 两段正文 → 两个正文段落（CTA 用不同 margin，不计入）
    expect(html.match(/<p style="margin:0 0 12px/g)?.length).toBe(2);
    // 段内单换行 → <br/>
    expect(html).toContain("<br/>");
  });

  it("转义 HTML 特殊字符，避免破坏排版或注入", () => {
    const html = formatOutputHTML(sampleOutput({ title: "a<b>c&d", body: "x<y" }), "zh");
    expect(html).toContain("a&lt;b&gt;c&amp;d");
    expect(html).toContain("x&lt;y");
    // 原始未转义形式不应出现
    expect(html).not.toContain("a<b>c");
  });

  it("有 CTA 时渲染强调的 CTA 段落", () => {
    const html = formatOutputHTML(sampleOutput(), "zh");
    expect(html).toContain("点击试试");
    expect(html).toContain("font-weight:600");
  });

  it("将旧内容里的 Markdown 加粗安全转换为富文本并从纯文本导出中移除", () => {
    const output = sampleOutput({
      title: "**重要标题**",
      body: "**重点内容**\n\n普通内容。",
      cta: "**现在试试**"
    });
    const html = formatOutputHTML(output, "zh");

    expect(html).toContain("<strong");
    expect(html).not.toContain("**重点内容**");
    expect(formatOutput(output, "小红书", "zh")).not.toContain("**");
  });

  it("CTA 为空时不渲染空 CTA 段落", () => {
    const html = formatOutputHTML(sampleOutput({ cta: "" }), "zh");
    expect(html).not.toContain("font-weight:600");
  });

  it("优先使用 finalBody（用户编辑后的正文）", () => {
    const html = formatOutputHTML(sampleOutput({ finalBody: "编辑后的正文", body: "原始正文" }), "zh");
    expect(html).toContain("编辑后的正文");
    expect(html).not.toContain("原始正文");
  });

  it("空标题、N/A 和乱码在导出中统一显示为无标题", () => {
    expect(formatOutput(sampleOutput({ title: "N/A" }), "小红书", "zh")).toContain("标题：无标题");
    expect(formatOutputHTML(sampleOutput({ title: "新品 �" }), "zh")).toContain(">无标题</h2>");
    expect(formatOutput(sampleOutput({ title: "N/A" }), "X / Twitter", "en")).toContain("Title: Untitled");
  });

  it("外层包成 section 容器，带内联字体样式", () => {
    const html = formatOutputHTML(sampleOutput(), "zh");
    expect(html.startsWith("<section")).toBe(true);
    expect(html).toContain("font-family");
  });

  it("把文章配图放回与 sourceExcerpt 对应的原文段落之后", () => {
    const output = sampleOutput({
      platform: "wechat",
      visualAssets: [{
        id: "visual-1",
        assetType: "article_illustration",
        positionIndex: 0,
        role: "concept",
        sourceExcerpt: "第一段内容。 第二行仍在第一段。",
        placementHint: "第一段之后",
        prompt: "Editorial visual",
        imageUrl: "https://example.com/visual.jpg",
        altText: "第一段的概念配图",
        metadata: {}
      }]
    });
    const markdownBody = formatBodyWithVisualAssets(output);
    expect(markdownBody).toContain("第一段内容。\n第二行仍在第一段。\n\n![第一段的概念配图](https://example.com/visual.jpg)\n\n第二段内容。");
    expect(formatOutput(output, "微信公众号", "zh")).toContain("![第一段的概念配图]");
  });

  it("在富文本导出中插入安全的响应式图片", () => {
    const html = formatOutputHTML(sampleOutput({
      visualAssets: [{
        assetType: "article_illustration",
        positionIndex: 0,
        role: "concept",
        sourceExcerpt: "第二段内容。",
        placementHint: "第二段之后",
        prompt: "Visual",
        imageUrl: "https://example.com/visual.jpg?x=1&y=2",
        altText: "配图 <说明>",
        metadata: {}
      }]
    }), "zh");
    expect(html.indexOf("第二段内容。")).toBeLessThan(html.indexOf("<figure"));
    expect(html).toContain("https://example.com/visual.jpg?x=1&amp;y=2");
    expect(html).toContain('alt="配图 &lt;说明&gt;"');
  });
});
