import { describe, expect, it } from "vitest";
import { findUnsupportedNumericClaims } from "@/lib/claim-grounding";
import type { GenerateRequest, KitOutput } from "@/lib/content-schema";

const baseInput: GenerateRequest = {
  ideaText:
    "Finfold turns one product update into platform-ready drafts for a solo founder.",
  goal: "lead-gen",
  persona: "ai-saas",
  platforms: ["x"],
  mediaAssets: [],
  language: "en"
};

function output(patch: Partial<KitOutput> = {}): KitOutput {
  return {
    platform: "x",
    title: "One update, less repetitive drafting",
    body: "Start with the product change, then adapt the message for each audience.",
    cta: "Try it with your next release.",
    notes: "Use a short opening.",
    strategy: "Lead with the workflow.",
    locked: false,
    publishStatus: "draft",
    userEdited: false,
    ...patch
  };
}

describe("numeric claim grounding", () => {
  it("rejects invented percentages, durations, money, and audience counts", () => {
    const findings = findUnsupportedNumericClaims(
      baseInput,
      output({
        body: "Cut drafting time by 70% in 2 weeks, save $500, and reach 10k users."
      })
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        "70|percent",
        "2|time:week",
        "500|currency:usd",
        "10k|count:user"
      ])
    );
  });

  it("allows a value and unit explicitly present in trusted user evidence", () => {
    const input = {
      ...baseInput,
      ideaText:
        "Our measured workflow reduced drafting from 2 hours to 20 minutes for the launch team."
    };
    expect(
      findUnsupportedNumericClaims(
        input,
        output({ body: "We cut drafting from 2 hours to 20 minutes." })
      )
    ).toEqual([]);
  });

  it("does not confuse ordinary list numbering with a factual metric", () => {
    expect(
      findUnsupportedNumericClaims(
        baseInput,
        output({ body: "3 steps:\n1. Add the update\n2. Pick a channel\n3. Edit the draft" })
      )
    ).toEqual([]);
  });

  it("allows server-owned performance evidence with its matching unit", () => {
    const input: GenerateRequest = {
      ...baseInput,
      perfExamples: {
        x: [
          {
            title: "A measured launch",
            body: "A short post about the release.",
            likes: 42,
            comments: 3,
            views: 1200
          }
        ]
      }
    };
    expect(
      findUnsupportedNumericClaims(
        input,
        output({ body: "The earlier launch post recorded 1200 views and 42 likes." })
      )
    ).toEqual([]);
  });

  it("never treats a Growth Mission target as an achieved fact", () => {
    const input: GenerateRequest = {
      ...baseInput,
      experimentContext: {
        platform: "x",
        hypothesis: "A clearer hook should improve cover CTR.",
        primaryMetric: "Cover CTR",
        primaryMetricKey: "cover_click_rate",
        baselineValue: 2,
        targetValue: 10,
        variants: []
      }
    };

    expect(
      findUnsupportedNumericClaims(
        input,
        output({ body: "The measured baseline was 2%." })
      )
    ).toEqual([]);
    expect(
      findUnsupportedNumericClaims(
        input,
        output({ body: "We already achieved 10% cover CTR." })
      )
    ).toContain("10|percent");
  });

  it("preserves per-thousand mission metrics instead of authorizing absolute claims", () => {
    const followersInput: GenerateRequest = {
      ...baseInput,
      experimentContext: {
        platform: "x",
        hypothesis: "A stronger proof point should improve follows.",
        primaryMetric: "Followers per thousand impressions",
        primaryMetricKey: "followers_per_thousand",
        baselineValue: 8,
        targetValue: 12,
        variants: []
      }
    };
    const saveShareInput: GenerateRequest = {
      ...baseInput,
      experimentContext: {
        platform: "x",
        hypothesis: "A checklist should improve saves and shares.",
        primaryMetric: "Saves and shares per thousand impressions",
        primaryMetricKey: "save_share_per_thousand",
        baselineValue: 6,
        targetValue: 9,
        variants: []
      }
    };

    expect(
      findUnsupportedNumericClaims(
        followersInput,
        output({ body: "The baseline was 8 followers per thousand impressions." })
      )
    ).toEqual([]);
    expect(
      findUnsupportedNumericClaims(
        followersInput,
        output({ body: "The launch gained 8 followers." })
      )
    ).toContain("8|count:follower");
    expect(
      findUnsupportedNumericClaims(
        saveShareInput,
        output({ body: "The launch earned 6 saves." })
      )
    ).toContain("6|metric:save");
  });

  it("recognizes M suffixes, postfix plus counts, saves, and shares", () => {
    const findings = findUnsupportedNumericClaims(
      baseInput,
      output({
        body: "Used by 1M users and 10k+ customers, with 80 saves and 30 shares."
      })
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        "1m|count:user",
        "10k+|count:customer",
        "80|metric:save",
        "30|metric:share"
      ])
    );
  });
});
