import { describe, expect, it } from "vitest";
import {
  buildVisionLocatePrompt,
  parseVisionLocateResult,
  visionLocateRequestSchema
} from "@/lib/extension/reply-automation";

const validScreenshot = `data:image/jpeg;base64,${"A".repeat(64)}`;

describe("extension reply automation vision locate", () => {
  it("accepts a base64 jpeg/png data URL screenshot with platform", () => {
    const parsed = visionLocateRequestSchema.safeParse({ platform: "xiaohongshu", screenshot: validScreenshot });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.targetHint).toBe("");
    expect(visionLocateRequestSchema.safeParse({ platform: "x", screenshot: validScreenshot }).success).toBe(true);
  });

  it("rejects remote URLs, foreign image types, and oversized screenshots", () => {
    expect(visionLocateRequestSchema.safeParse({ platform: "linkedin", screenshot: "https://example.com/a.jpg" }).success).toBe(false);
    expect(visionLocateRequestSchema.safeParse({ platform: "linkedin", screenshot: "data:image/webp;base64,AAAA" }).success).toBe(false);
    expect(visionLocateRequestSchema.safeParse({ platform: "xiaohongshu", screenshot: `data:image/png;base64,${"A".repeat(2_000_100)}` }).success).toBe(false);
    expect(visionLocateRequestSchema.safeParse({ platform: "instagram", screenshot: validScreenshot }).success).toBe(false);
  });

  it("builds a locate-only prompt with normalized coordinates and the target hint", () => {
    const request = visionLocateRequestSchema.parse({
      platform: "linkedin",
      screenshot: validScreenshot,
      targetHint: "the comment asking about pricing"
    });
    const prompt = buildVisionLocatePrompt(request);
    expect(prompt).toContain("LinkedIn");
    expect(prompt).toContain("the comment asking about pricing");
    expect(prompt).toContain("element detection only");
    expect(prompt).toContain("0 to 1");
    expect(buildVisionLocatePrompt(visionLocateRequestSchema.parse({ platform: "x", screenshot: validScreenshot }))).toContain("X (Twitter)");
  });

  it("parses normalized points and tolerates nulls for missing controls", () => {
    expect(parseVisionLocateResult('```json\n{"replyInput":{"x":0.5,"y":0.25},"sendButton":null}\n```')).toEqual({
      replyInput: { x: 0.5, y: 0.25 },
      sendButton: null
    });
    expect(parseVisionLocateResult('{"replyInput":null,"sendButton":{"x":0.9,"y":0.6}}')).toEqual({
      replyInput: null,
      sendButton: { x: 0.9, y: 0.6 }
    });
  });

  it("refuses out-of-range coordinates and extra fields instead of clicking wild points", () => {
    expect(() => parseVisionLocateResult('{"replyInput":{"x":1.5,"y":0.5},"sendButton":null}')).toThrow("VISION_INVALID_RESPONSE");
    expect(() => parseVisionLocateResult('{"replyInput":{"x":0.5,"y":0.5},"sendButton":null,"clickAll":true}')).toThrow("VISION_INVALID_RESPONSE");
    expect(() => parseVisionLocateResult("not json at all")).toThrow();
  });
});
