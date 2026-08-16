import type { PlatformMemory } from "@/lib/brand-brain";
import type { LearnedVisualPreference } from "@/lib/visual-performance-learning";

const PLATFORM_MEMORY_PLATFORMS = new Set<PlatformMemory["platform"]>([
  "xiaohongshu",
  "wechat",
  "x"
]);

/**
 * Converts deterministic visual performance evidence into one replaceable,
 * high-confidence platform preference. The underlying learner already requires
 * comparative evidence; this function makes neither model calls nor guesses.
 */
export function mergeVisualPerformancePlatformMemory(
  existing: PlatformMemory[],
  preference: LearnedVisualPreference
): PlatformMemory[] {
  if (!PLATFORM_MEMORY_PLATFORMS.has(preference.platform as PlatformMemory["platform"])) {
    return existing;
  }

  const platform = preference.platform as PlatformMemory["platform"];
  const id = `performance-visual:${platform}`;
  const value = `Prefer ${preference.theme} visual storytelling (+${preference.liftPercent}% engagement across ${preference.sampleSize} comparable posts).`;
  const memory: PlatformMemory = {
    id,
    platform,
    kind: "preference",
    value,
    source: "performance",
    confidence: "high",
    createdAt: preference.updatedAt
  };
  return [...existing.filter((item) => item.id !== id), memory].slice(-12);
}