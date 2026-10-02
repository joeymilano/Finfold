import { describe, expect, it } from "vitest";
import {
  buildLocalVisualStory,
  buildVisualStoryPrompt,
  parseVisualStoryResponse
} from "@/lib/visual-story";

const input = {
  platform: "xiaohongshu" as const,
  locale: "zh" as const,
  title: "一个更新，不该手工重写七遍",
  body: "先保留同一个核心观点，再根据每个平台的阅读习惯调整开头。\n\n小红书需要可收藏的结构，X 需要一句明确判断，LinkedIn 需要完整论证。\n\n最后检查事实和行动号召，避免平台适配改变原意。",
  cta: "保存这套方法，下次发布前照着检查。",
  pageCount: 5
};

describe("visual story", () => {
  it("asks the model for an exact, evidence-bound visual narrative", () => {
    const prompt = buildVisualStoryPrompt(input);
    expect(prompt).toContain("exactly 5 pages");
    expect(prompt).toContain('Page 1 role must be "cover"');
    expect(prompt).toContain("Never invent statistics, customers, results, testimonials, or product capabilities");
    expect(prompt).toContain("所有可见文案必须使用简体中文");
    expect(prompt).toContain("story-driven, information-dense, or visual-first");
  });

  it("extracts JSON, assigns stable page ids, and protects the first and last roles", () => {
    const raw = `Storyboard follows:\n${JSON.stringify({
      title: "发布方法",
      theme: "signal",
      artDirection: "高对比信息卡",
      pages: [
        { role: "insight", kicker: "方法", title: "一个更新，不该重写七遍", body: "", points: [], emphasis: "" },
        { role: "insight", kicker: "01", title: "先守住核心观点", body: "不要让适配改变原意。", points: [], emphasis: "核心观点" },
        { role: "list", kicker: "02", title: "再适配阅读习惯", body: "", points: ["小红书做成可收藏结构", "X 给出一句明确判断"], emphasis: "" },
        { role: "quote", kicker: "03", title: "适配形式，不改事实", body: "", points: [], emphasis: "" },
        { role: "insight", kicker: "下一步", title: "保存这套方法", body: "发布前照着检查。", points: [], emphasis: "" }
      ]
    })}\nDone.`;

    const story = parseVisualStoryResponse(raw, 5);
    expect(story.pages).toHaveLength(5);
    expect(story.pages[0].role).toBe("cover");
    expect(story.pages.at(-1)?.role).toBe("cta");
    expect(story.pages.every((page) => page.id.length > 10)).toBe(true);
    expect(story.theme).toBe("signal");
    expect(story.strategy).toBe("information-dense");
  });

  it("truncates a model response with more pages than requested instead of discarding it", () => {
    const pages = Array.from({ length: 7 }, (_, index) => ({
      role: "insight",
      kicker: `${index}`,
      title: `Page ${index}`,
      body: "",
      points: [],
      emphasis: ""
    }));
    const raw = JSON.stringify({ title: "Too many", theme: "editorial", artDirection: "", pages });
    const story = parseVisualStoryResponse(raw, 5);
    expect(story.pages).toHaveLength(5);
    expect(story.pages[0].role).toBe("cover");
    expect(story.pages.at(-1)?.role).toBe("cta");
  });

  it("accepts a model response with fewer pages than requested, as long as it clears the schema minimum", () => {
    const raw = JSON.stringify({
      title: "Fewer pages",
      theme: "editorial",
      artDirection: "",
      pages: [
        { role: "cover", title: "Cover", kicker: "", body: "", points: [], emphasis: "" },
        { role: "insight", title: "Middle", kicker: "", body: "", points: [], emphasis: "" },
        { role: "cta", title: "CTA", kicker: "", body: "", points: [], emphasis: "" }
      ]
    });
    const story = parseVisualStoryResponse(raw, 5);
    expect(story.pages).toHaveLength(3);
  });

  it("still rejects a model response with no pages at all", () => {
    const raw = JSON.stringify({ title: "Empty", theme: "editorial", artDirection: "", pages: [] });
    expect(() => parseVisualStoryResponse(raw, 5)).toThrow("did not return any visual-story pages");
  });

  it("builds an honest editable draft from the supplied content without requiring AI", () => {
    const story = buildLocalVisualStory(input, "xiaohongshu", "zh", 5);
    expect(story.pages).toHaveLength(5);
    expect(story.pages[0].title).toBe(input.title);
    expect(story.pages[0].role).toBe("cover");
    expect(story.pages.at(-1)?.role).toBe("cta");
    expect(story.pages.at(-1)?.title).toBe(input.cta);
    expect(story.strategy).toBe("information-dense");
    expect(story.pages.slice(1, -1).map((page) => `${page.title}${page.body}`).join(" ")).toContain("核心观点");
  });

  it("carries a selected content strategy into both prompt and local draft", () => {
    const prompt = buildVisualStoryPrompt({ ...input, strategy: "visual-first", primaryMetric: "封面点击率" });
    const story = buildLocalVisualStory(input, "xiaohongshu", "zh", 5, "signal", "visual-first");
    expect(prompt).toContain("minimal copy and maximum visual contrast");
    expect(prompt).toContain("封面点击率");
    expect(story.strategy).toBe("visual-first");
    expect(story.theme).toBe("signal");
  });

  it("still produces a valid minimum story when the source body is very short", () => {
    const story = buildLocalVisualStory({ title: "短标题", body: "短内容", cta: "去行动" }, "x", "zh", 5);
    expect(story.pages).toHaveLength(3);
    expect(story.pages[1].title).toBe("短内容");
  });
});
