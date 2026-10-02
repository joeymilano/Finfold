import { describe, expect, it } from "vitest";
import {
  buildTextFreeVisualPrompt,
  coverImageSizeForPlatform
} from "@/lib/image-gen";

// Mirrors /api/image/generate's allowedSizes — every platform spec must stay
// inside the provider-validated set so Workers AI / Wan / Agnes all accept it.
const PROVIDER_VALIDATED_SIZES = [
  "1024x1024",
  "768x1344",
  "864x1152",
  "1344x768",
  "1152x864",
  "1440x720",
  "720x1440"
];

const KNOWN_PLATFORMS = [
  "wechat",
  "xiaohongshu",
  "zhihu",
  "moments",
  "x",
  "linkedin",
  "instagram",
  "facebook",
  "reddit",
  "product-hunt",
  "threads",
  "hacker-news",
  "indie-hackers",
  "medium-substack"
];

describe("text-free visual plate prompt", () => {
  it("keeps the art direction while explicitly reserving all typography for Finfold", () => {
    const prompt = buildTextFreeVisualPrompt(
      "A cinematic founder workspace with bronze light and a clear focal point.",
      "xiaohongshu"
    );

    expect(prompt).toContain("cinematic founder workspace");
    expect(prompt).toContain("absolutely no text");
    expect(prompt).toContain("no text, letters, words, typography");
    expect(prompt).toContain("negative space");
    expect(prompt).toContain("Finfold will typeset every visible word");
  });

  it("normalizes model-authored whitespace before adding hard constraints", () => {
    const prompt = buildTextFreeVisualPrompt("  dark   editorial\n\nlighting  ", "linkedin");
    expect(prompt).toContain("dark editorial lighting");
    expect(prompt).not.toContain("\n");
  });

  it("injects explicit layout geometry instead of ambient-wallpaper guidance", () => {
    const prompt = buildTextFreeVisualPrompt("AI agent startup story", "xiaohongshu");

    expect(prompt).toContain("COMPOSITION:");
    expect(prompt).toContain("ART DIRECTION:");
    expect(prompt).toContain("COLOR:");
    expect(prompt).toContain("lower two-thirds");
    expect(prompt).toContain("top third");
    expect(prompt).toContain("not ambient wallpaper");
  });

  it("adapts the layout brief to each platform's native cover structure", () => {
    const wechat = buildTextFreeVisualPrompt("growth story", "wechat");
    const x = buildTextFreeVisualPrompt("growth story", "x");

    expect(wechat).toContain("left 60%");
    expect(wechat).toContain("right 40%");
    expect(x).toContain("negative space");
  });

  it("falls back to the generic landscape spec for unknown platforms", () => {
    const prompt = buildTextFreeVisualPrompt("topic", "social");

    expect(prompt).toContain("COMPOSITION:");
    expect(prompt).toContain("40% of the frame");
    expect(prompt).not.toContain("left 60%");
  });
});

describe("coverImageSizeForPlatform", () => {
  it("returns the native feed aspect per platform", () => {
    expect(coverImageSizeForPlatform("xiaohongshu")).toBe("768x1344");
    expect(coverImageSizeForPlatform("wechat")).toBe("1344x768");
    expect(coverImageSizeForPlatform("moments")).toBe("1024x1024");
    expect(coverImageSizeForPlatform("instagram")).toBe("864x1152");
  });

  it("falls back to landscape for unknown platforms", () => {
    expect(coverImageSizeForPlatform("social")).toBe("1344x768");
    expect(coverImageSizeForPlatform("")).toBe("1344x768");
  });

  it("keeps every known platform size inside the provider-validated set", () => {
    for (const platform of KNOWN_PLATFORMS) {
      const size = coverImageSizeForPlatform(platform);
      expect(PROVIDER_VALIDATED_SIZES).toContain(size);
    }
  });
});
