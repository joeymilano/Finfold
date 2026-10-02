import { describe, expect, it } from "vitest";
import { platforms } from "@/lib/platforms";
import {
  getDefaultVisualStoryFormat,
  getRecommendedVisualStoryFormats,
  isRecommendedVisualStoryFormat,
  visualStoryFormatOrder,
  visualStoryFormats
} from "@/lib/visual-story-formats";

describe("visual story platform formats", () => {
  it("gives every supported publishing platform an ordered default and alternatives", () => {
    platforms.forEach((platform) => {
      const options = getRecommendedVisualStoryFormats(platform.id);
      const defaultFormat = getDefaultVisualStoryFormat(platform.id);
      expect(options).toHaveLength(visualStoryFormatOrder.length);
      expect(options[0].id).toBe(defaultFormat.id);
      expect(isRecommendedVisualStoryFormat(platform.id, defaultFormat.id)).toBe(true);
    });
  });

  it("uses the platform-native defaults for the highest-value visual channels", () => {
    expect(getDefaultVisualStoryFormat("xiaohongshu").id).toBe("portrait-3x4");
    expect(getDefaultVisualStoryFormat("zhihu").id).toBe("social-preview");
    expect(getDefaultVisualStoryFormat("instagram").id).toBe("portrait-3x4");
    expect(getDefaultVisualStoryFormat("linkedin").id).toBe("portrait-4x5");
    expect(getDefaultVisualStoryFormat("x").id).toBe("square-1x1");
    expect(getDefaultVisualStoryFormat("wechat").id).toBe("wechat-2.35x1");
    expect(getDefaultVisualStoryFormat("product-hunt").id).toBe("product-hunt-gallery");
    expect(getDefaultVisualStoryFormat("medium-substack").id).toBe("social-preview");
  });

  it("exports every preset at its declared pixel dimensions", () => {
    Object.values(visualStoryFormats).forEach((format) => {
      expect(format.cssWidth * format.scale).toBeCloseTo(format.width, 4);
      expect(format.cssHeight * format.scale).toBeCloseTo(format.height, 4);
    });
  });

  it("keeps a traceable specification source on every preset", () => {
    Object.values(visualStoryFormats).forEach((format) => {
      expect(format.source.label.length).toBeGreaterThan(3);
      expect(format.source.url).toMatch(/^https:\/\//);
    });
  });

  it("reserves the known full-screen UI exclusion zone", () => {
    expect(visualStoryFormats["story-9x16"].safeInsets).toEqual({
      top: 185,
      right: 120,
      bottom: 120,
      left: 120
    });
  });
});
