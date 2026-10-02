import { describe, expect, it } from "vitest";
import {
  getMobileGenerationEstimate,
  getMobileSourceGuidance,
  isMobileSourceReady
} from "@/lib/mobile-workbench";

describe("mobile workbench flow", () => {
  it("requires the same 20-character source minimum as generation", () => {
    expect(isMobileSourceReady(" nineteen characters ")).toBe(false);
    expect(isMobileSourceReady("This source has enough context to continue.")).toBe(true);
    expect(isMobileSourceReady("", 1)).toBe(true);
  });

  it("explains exactly what is missing before the next step", () => {
    expect(getMobileSourceGuidance("已有十个字左右", "zh")).toBe("还需输入 13 个字才能继续。");
    expect(getMobileSourceGuidance("This source has enough context.", "en")).toBe("Source ready");
    expect(getMobileSourceGuidance("", "zh", 1)).toBe("源素材已就绪");
  });

  it("uses the existing two-platform generation batching estimate", () => {
    expect(getMobileGenerationEstimate(1)).toBe(30);
    expect(getMobileGenerationEstimate(3)).toBe(50);
    expect(getMobileGenerationEstimate(5)).toBe(75);
  });
});
