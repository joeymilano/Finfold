import { describe, expect, it } from "vitest";
import { parseStatusUrl } from "@/lib/x-pipeline/replies";
import { xDailyWindowStart } from "@/lib/x-pipeline/settings";

describe("X pipeline helpers", () => {
  it("parses tweet permalinks and rejects everything else", () => {
    expect(parseStatusUrl("https://x.com/naval/status/1747000000000000000")).toEqual({
      handle: "naval",
      tweetId: "1747000000000000000"
    });
    expect(parseStatusUrl("https://twitter.com/OpenAI/status/1747111111111111111?s=20")).toEqual({
      handle: "openai",
      tweetId: "1747111111111111111"
    });
    // Profile pages, photos routes, and off-platform URLs carry no status id.
    expect(parseStatusUrl("https://x.com/naval")).toBeNull();
    expect(parseStatusUrl("https://x.com/i/status/1")).toBeNull();
    expect(parseStatusUrl("https://news.ycombinator.com/item?id=1")).toBeNull();
    expect(parseStatusUrl("https://x.com/naval/status/abc")).toBeNull();
    expect(parseStatusUrl("not a url")).toBeNull();
  });

  it("anchors daily quotas at Beijing midnight (UTC+8, no DST)", () => {
    // 2026-09-18 10:00 UTC is 18:00 Beijing — the window opened at
    // 2026-09-18 00:00 Beijing, i.e. 2026-09-17 16:00 UTC.
    expect(xDailyWindowStart(new Date("2026-09-18T10:00:00.000Z"))).toBe("2026-09-17T16:00:00.000Z");
    // 2026-09-18 17:00 UTC is 2026-09-19 01:00 Beijing — new day.
    expect(xDailyWindowStart(new Date("2026-09-18T17:00:00.000Z"))).toBe("2026-09-18T16:00:00.000Z");
  });
});
