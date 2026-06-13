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
});
