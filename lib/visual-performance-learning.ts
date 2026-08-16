import type { PlatformId } from "@/lib/platforms";
import type { VisualStoryTheme } from "@/lib/visual-story";
import type { VisualIdentity } from "@/lib/brand-brain";

export type VisualPerformanceSample = {
  platform: PlatformId;
  theme: VisualStoryTheme;
  score: number;
};

export type LearnedVisualPreference = VisualIdentity["learnedPreferences"][number];

const MIN_TOTAL_SAMPLES = 4;
const MIN_THEME_SAMPLES = 2;
const MIN_LIFT = 0.25;

export function learnVisualPreference(samples: VisualPerformanceSample[], now = new Date().toISOString()): LearnedVisualPreference | null {
  if (samples.length < MIN_TOTAL_SAMPLES) return null;
  const platform = samples[0].platform;
  if (samples.some((sample) => sample.platform !== platform)) return null;

  const byTheme = new Map<VisualStoryTheme, number[]>();
  for (const sample of samples) {
    const scores = byTheme.get(sample.theme) ?? [];
    scores.push(Math.max(0, sample.score));
    byTheme.set(sample.theme, scores);
  }

  const candidates = [...byTheme.entries()]
    .filter(([, scores]) => scores.length >= MIN_THEME_SAMPLES)
    .map(([theme, scores]) => ({ theme, scores, average: average(scores) }))
    .sort((a, b) => b.average - a.average);
  if (candidates.length < 2) return null;

  const best = candidates[0];
  const comparisonScores = candidates.slice(1).flatMap((candidate) => candidate.scores);
  const comparison = average(comparisonScores);
  const lift = (best.average + 1) / (comparison + 1) - 1;
  if (lift < MIN_LIFT) return null;

  return {
    platform,
    theme: best.theme,
    sampleSize: samples.length,
    liftPercent: Math.round(lift * 100),
    updatedAt: now
  };
}

export function mergeVisualPreference(existing: LearnedVisualPreference[], preference: LearnedVisualPreference): LearnedVisualPreference[] {
  return [...existing.filter((item) => item.platform !== preference.platform), preference].slice(-14);
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
