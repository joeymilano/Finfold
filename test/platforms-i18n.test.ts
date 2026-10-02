import { describe, expect, it } from "vitest";
import { getLocalizedPlatformLabel, platforms } from "@/lib/platforms";

const hasChinese = (text: string) => /[一-鿿]/.test(text);

/**
 * Display copy must match the viewer's locale: the English card never leaks
 * Chinese and the Chinese card never leaks English. Base arrays feed the
 * agent prompts, so the locale-specific overrides must cover whichever
 * language the base data is not written in.
 */
describe("platform display copy stays locale-clean", () => {
  it("renders English patterns and avoid-lists without Chinese on every platform", () => {
    for (const platform of platforms) {
      const englishPatterns = platform.viralPatternsEn ?? platform.viralPatterns;
      const englishAvoid = platform.avoidListEn ?? platform.avoidList;
      for (const item of englishPatterns) {
        expect(hasChinese(item), `${platform.id} viral pattern leaks Chinese: ${item}`).toBe(false);
      }
      for (const item of englishAvoid) {
        expect(hasChinese(item), `${platform.id} avoid item leaks Chinese: ${item}`).toBe(false);
      }
    }
  });

  it("renders Chinese patterns and avoid-lists in Chinese on every platform", () => {
    for (const platform of platforms) {
      const chinesePatterns = platform.viralPatternsZh ?? platform.viralPatterns;
      const chineseAvoid = platform.avoidListZh ?? platform.avoidList;
      for (const item of chinesePatterns) {
        expect(hasChinese(item), `${platform.id} zh viral pattern is not Chinese: ${item}`).toBe(true);
      }
      for (const item of chineseAvoid) {
        expect(hasChinese(item), `${platform.id} zh avoid item is not Chinese: ${item}`).toBe(true);
      }
    }
  });

  it("keeps localized platform labels free of Chinese in English mode", () => {
    for (const platform of platforms) {
      const label = getLocalizedPlatformLabel(platform.id, "en");
      expect(hasChinese(label), `${platform.id} English label leaks Chinese: ${label}`).toBe(false);
    }
  });
});
