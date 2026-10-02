import { describe, expect, it } from "vitest";
import { mergeVisualPerformancePlatformMemory } from "@/lib/platform-memory-performance";

describe("performance-backed platform memory", () => {
  it("records qualifying X visual evidence as a high-confidence preference", () => {
    const memories = mergeVisualPerformancePlatformMemory([], {
      platform: "x",
      theme: "signal",
      sampleSize: 6,
      liftPercent: 42,
      updatedAt: "2026-08-06T10:00:00.000Z"
    });

    expect(memories).toEqual([
      expect.objectContaining({
        id: "performance-visual:x",
        platform: "x",
        kind: "preference",
        source: "performance",
        confidence: "high",
        value: "Prefer signal visual storytelling (+42% engagement across 6 comparable posts)."
      })
    ]);
  });

  it("replaces only the deterministic visual preference for that platform", () => {
    const initial = mergeVisualPerformancePlatformMemory([], {
      platform: "wechat",
      theme: "editorial",
      sampleSize: 4,
      liftPercent: 25,
      updatedAt: "2026-08-01T10:00:00.000Z"
    });
    const updated = mergeVisualPerformancePlatformMemory(initial, {
      platform: "wechat",
      theme: "field-notes",
      sampleSize: 8,
      liftPercent: 51,
      updatedAt: "2026-08-06T10:00:00.000Z"
    });

    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      id: "performance-visual:wechat",
      value: "Prefer field-notes visual storytelling (+51% engagement across 8 comparable posts)."
    });
  });

  it("leaves platforms outside typed platform memory unchanged", () => {
    expect(mergeVisualPerformancePlatformMemory([], {
      platform: "linkedin",
      theme: "signal",
      sampleSize: 5,
      liftPercent: 30,
      updatedAt: "2026-08-06T10:00:00.000Z"
    })).toEqual([]);
  });
});