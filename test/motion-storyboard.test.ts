import { describe, expect, it } from "vitest";
import { buildAnimatedStoryHtml, buildMotionStoryboard } from "@/lib/motion-storyboard";
import { buildLocalVisualStory } from "@/lib/visual-story";

describe("motion storyboard", () => {
  const story = buildLocalVisualStory({
    title: "一个内容包如何变成动态故事",
    body: "先建立内容图谱。\n\n再让每一帧只完成一个任务。\n\n最后把结构交给不同渲染器。",
    cta: "下载这份渲染清单。"
  }, "instagram", "zh", 5, "signal", "visual-first");

  it("creates a renderer-neutral content graph with deterministic timing", () => {
    const storyboard = buildMotionStoryboard(story, "portrait-4x5");
    expect(storyboard.nodes).toHaveLength(story.pages.length);
    expect(storyboard.edges).toHaveLength(story.pages.length - 1);
    expect(storyboard.renderer.contract).toBe("render(input, context)");
    expect(storyboard.totalDurationMs).toBeGreaterThan(10000);
    expect(storyboard.nodes[1].startMs).toBe(storyboard.nodes[0].durationMs);
  });

  it("exports a self-contained animated HTML handoff", () => {
    const html = buildAnimatedStoryHtml(buildMotionStoryboard(story, "portrait-4x5"));
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('id="stage"');
    expect(html).toContain("const story=");
    expect(html).toContain("Pause");
  });
});
