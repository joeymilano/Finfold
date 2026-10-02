import { describe, expect, it } from "vitest";
import { mapBrandMemoryVersion, parseBrandMemoryVersionSnapshot, summarizeBrandMemoryVersion } from "@/lib/brand-memory-versions";

describe("Brand Memory versions", () => {
  const snapshot = {
    identity_type: "hybrid",
    brand_name: "Finfold",
    product_description: "A content operating system",
    target_audience: "independent founders",
    tone_keywords: ["specific"],
    banned_phrases: ["game-changing"],
    approved_examples: [],
    competitors: [],
    positioning_statement: "Turn verified product facts into native content.",
    source_url: null,
    social_profiles: [],
    visual_identity: {},
    auto_extracted: false,
    enriched_at: null,
    learned_style: ["Use short paragraphs."],
    learned_negative: [],
    performance_rules: []
  };

  it("maps database row snapshots through the existing Brand Memory contract", () => {
    const version = mapBrandMemoryVersion({
      id: "5d70c557-40e5-4f5f-951d-2e1b51734a85",
      snapshot,
      created_at: "2026-08-06T10:00:00.000Z"
    });

    expect(version.brain).toMatchObject({
      identityType: "hybrid",
      brandName: "Finfold",
      learnedStyle: ["Use short paragraphs."]
    });
    expect(summarizeBrandMemoryVersion(version.brain)).toContain("Finfold");
  });

  it("rejects malformed version rows and safely parses complete snapshots", () => {
    expect(() => mapBrandMemoryVersion({ id: "not-a-uuid", snapshot, created_at: "nope" })).toThrow();
    expect(parseBrandMemoryVersionSnapshot(snapshot).positioningStatement).toBe("Turn verified product facts into native content.");
  });
});