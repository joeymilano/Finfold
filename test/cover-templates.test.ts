import { describe, expect, it } from "vitest";
import {
  coverTemplateCategories,
  coverTemplates,
  getTemplatesByCategory
} from "@/lib/cover/templates";
import { coverAssetAttribution, stockSearchPresets, type CoverAsset } from "@/lib/cover/stock-assets";

describe("cover template library", () => {
  it("ships four templates for each of the six first-release content jobs", () => {
    expect(coverTemplates).toHaveLength(24);
    expect(coverTemplateCategories).toHaveLength(6);
    coverTemplateCategories.forEach((category) => {
      expect(getTemplatesByCategory(category)).toHaveLength(4);
    });
  });

  it("keeps every template id unique and includes all deterministic renderers", () => {
    expect(new Set(coverTemplates.map((template) => template.id)).size).toBe(coverTemplates.length);
    expect(new Set(coverTemplates.map((template) => template.style))).toEqual(
      new Set(["photo", "editorial", "swiss"])
    );
  });

  it("offers enough stock presets to browse more than one hundred results", () => {
    expect(stockSearchPresets.length).toBeGreaterThanOrEqual(6);
    expect(stockSearchPresets.length * 18).toBeGreaterThanOrEqual(100);
  });

  it("surfaces photographer attribution for Pexels assets", () => {
    const asset: CoverAsset = {
      id: "pexels-1",
      url: "https://images.pexels.com/photo.jpg",
      previewUrl: "https://images.pexels.com/preview.jpg",
      width: 1000,
      height: 1400,
      alt: "Desk",
      provider: "pexels",
      photographer: "Jo Example",
      licenseName: "Pexels License",
      attributionRequired: false
    };

    expect(coverAssetAttribution(asset, "en")).toBe("Photo by Jo Example on Pexels");
    expect(coverAssetAttribution(asset, "zh")).toBe("摄影：Jo Example · Pexels");
  });
});
