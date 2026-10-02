import { describe, expect, it } from "vitest";
import { recommendPlatform } from "./recommendation";

const page = {
  url: "https://example.com/article",
  title: "A neutral article",
  description: "A useful summary",
  language: "en",
  text: "A sufficiently long source passage for a social post recommendation."
};

describe("local platform recommendation", () => {
  it("uses the source platform when the page is already a social conversation", () => {
    expect(recommendPlatform({ ...page, url: "https://www.reddit.com/r/startups/comments/123" })).toBe("reddit");
    expect(recommendPlatform({ ...page, url: "https://www.linkedin.com/posts/123" })).toBe("linkedin");
  });

  it("recommends Xiaohongshu for Chinese source content without a network call", () => {
    expect(recommendPlatform({
      ...page,
      language: "zh-CN",
      title: "一个适合独立开发者的增长案例",
      text: "这是一段足够长的中文内容，用来帮助用户理解产品增长方法和实际执行过程。"
    })).toBe("xiaohongshu");
  });

  it("maps professional themes to LinkedIn and questions to Reddit", () => {
    expect(recommendPlatform({ ...page, title: "B2B leadership lessons for founders" })).toBe("linkedin");
    expect(recommendPlatform({ ...page, title: "How do I find my first customers?" })).toBe("reddit");
  });
});
