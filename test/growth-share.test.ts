import { describe, expect, it } from "vitest";
import {
  GROWTH_SHARE_CHANNELS,
  buildGrowthShareCaption,
  buildGrowthShareIntent
} from "@/lib/growth-share";

describe("growth portfolio sharing", () => {
  it("keeps overseas channels ahead of China channels", () => {
    expect(GROWTH_SHARE_CHANNELS.map((channel) => channel.id)).toEqual([
      "x", "linkedin", "threads", "facebook", "wechat", "xiaohongshu"
    ]);
  });

  it("builds a useful caption without disclosing hidden numbers", () => {
    const visible = buildGrowthShareCaption({
      locale: "zh",
      totalFollowers: 112_000,
      monthlyGrowth: 4_890,
      goalProgress: 0.74,
      hidden: false
    });
    const hidden = buildGrowthShareCaption({
      locale: "zh",
      totalFollowers: 112_000,
      monthlyGrowth: 4_890,
      goalProgress: 0.74,
      hidden: true
    });

    expect(visible).toContain("74%");
    expect(visible).toContain("Finfold");
    expect(hidden).not.toContain("112");
    expect(hidden).not.toContain("4,890");
  });

  it("uses publish intents where a browser composer exists and native sharing otherwise", () => {
    expect(buildGrowthShareIntent("x", "A growth update")).toContain("intent/tweet");
    expect(buildGrowthShareIntent("linkedin", "A growth update")).toContain("share-offsite");
    expect(buildGrowthShareIntent("wechat", "A growth update")).toBeNull();
    expect(buildGrowthShareIntent("xiaohongshu", "A growth update")).toBeNull();
  });
});
