import { describe, expect, it } from "vitest";
import { platforms, requiredPlatformIds } from "@/lib/platforms";

describe("platform configuration", () => {
  it("includes every required launch platform", () => {
    const ids = new Set(platforms.map((platform) => platform.id));

    requiredPlatformIds.forEach((platformId) => {
      expect(ids.has(platformId)).toBe(true);
    });
  });

  it("includes high-intent recommended acquisition channels", () => {
    const ids = new Set(platforms.map((platform) => platform.id));

    expect(ids.has("threads")).toBe(true);
    expect(ids.has("hacker-news")).toBe(true);
    expect(ids.has("indie-hackers")).toBe(true);
    expect(ids.has("medium-substack")).toBe(true);
  });

  it("ships Zhihu with a native voice and disclosure-aware rules", () => {
    const zhihu = platforms.find((platform) => platform.id === "zhihu");

    expect(zhihu?.label).toBe("知乎");
    expect(zhihu?.voice).toContain("来龙去脉");
    expect(zhihu?.constraints.join(" ")).toContain("包含 AI 辅助创作");
    expect(zhihu?.avoidList.join(" ")).toContain("批量发布");
  });

  it("treats off-platform QR codes as a Xiaohongshu pre-publish risk", () => {
    const xiaohongshu = platforms.find((platform) => platform.id === "xiaohongshu");

    expect(xiaohongshu?.constraints.join(" ")).toContain("二维码");
    expect(xiaohongshu?.avoidList.join(" ")).toContain("站外导流");
  });
});
