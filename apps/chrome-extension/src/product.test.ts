import { describe, expect, it } from "vitest";
import { completeResultLength, generationIntent, shouldRetainRequestId, sourceMetric } from "./product";

describe("extension product helpers", () => {
  it("keeps a generation intent stable for the same page and platform set", () => {
    expect(generationIntent("https://example.com/post", ["x"]))
      .toBe("https://example.com/post\nx");
    expect(generationIntent("https://example.com/post", ["x", "linkedin", "xiaohongshu", "reddit"]))
      .toBe("https://example.com/post\nx,linkedin,xiaohongshu,reddit");
  });

  it("reports a useful local source metric for English and Chinese", () => {
    expect(sourceMetric("A short source passage", false)).toBe(4);
    expect(sourceMetric("这 是 一段中文", true)).toBe(6);
  });

  it("counts the complete copyable result", () => {
    expect(completeResultLength({ title: "Hi", body: "Body", cta: "Go" })).toBe(12);
  });

  it("only retains an idempotency key for uncertain outcomes", () => {
    expect(shouldRetainRequestId(new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetainRequestId(new Error("REQUEST_IN_PROGRESS"))).toBe(true);
    expect(shouldRetainRequestId(new Error("HTTP_503"))).toBe(true);
    expect(shouldRetainRequestId(new Error("INSUFFICIENT_CREDITS"))).toBe(false);
  });
});
