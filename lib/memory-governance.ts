import type { BrandBrain } from "@/lib/brand-brain";

export type MemoryConflict = {
  id: string;
  title: string;
  detail: string;
  severity: "warning" | "high";
};

export type MemoryGovernanceReport = {
  status: "clear" | "needs_review";
  conflicts: MemoryConflict[];
  checked: {
    toneKeywords: number;
    bannedPhrases: number;
    approvedExamples: number;
    learnedRules: number;
    visualPreferences: number;
    platformMemory: number;
  };
};

/**
 * Reports only direct, deterministic contradictions. Semantic disagreement is
 * intentionally left for the user to decide instead of being guessed by a model.
 */
export function inspectMemoryConflicts(brain: BrandBrain): MemoryGovernanceReport {
  const conflicts: MemoryConflict[] = [];
  const banned = normalizedValues(brain.bannedPhrases);
  const tone = normalizedValues(brain.toneKeywords);
  const positiveRules = normalizedValues([...brain.learnedStyle, ...brain.performanceRules]);
  const visualStyles = normalizedValues(brain.visualIdentity.styleKeywords);
  const avoidedVisualStyles = normalizedValues(brain.visualIdentity.avoidStyles);

  for (const [key, value] of sharedEntries(tone, banned)) {
    conflicts.push({
      id: `tone-banned:${key}`,
      title: "Tone keyword is also banned",
      detail: `“${value.left}” is both a desired tone keyword and a banned phrase.`,
      severity: "high"
    });
  }

  for (const [key, value] of sharedEntries(positiveRules, banned)) {
    conflicts.push({
      id: `rule-banned:${key}`,
      title: "Positive rule is also banned",
      detail: `“${value.left}” appears in a learned or performance rule and in banned phrases.`,
      severity: "high"
    });
  }

  for (const [key, value] of sharedEntries(visualStyles, avoidedVisualStyles)) {
    conflicts.push({
      id: `visual-style:${key}`,
      title: "Visual style is both preferred and avoided",
      detail: `“${value.left}” appears in both visual style keywords and styles to avoid.`,
      severity: "warning"
    });
  }

  for (const example of brain.approvedExamples) {
    const normalizedExample = normalize(example);
    for (const [key, phrase] of banned) {
      if (!normalizedExample.includes(key)) continue;
      conflicts.push({
        id: `example-banned:${key}:${normalize(example).slice(0, 40)}`,
        title: "Approved example contains a banned phrase",
        detail: `An approved example contains “${phrase}”, which the memory also forbids.`,
        severity: "high"
      });
    }
  }

  const normalizedPositioning = normalize(brain.positioningStatement);
  for (const [key, phrase] of banned) {
    if (!normalizedPositioning.includes(key)) continue;
    conflicts.push({
      id: `positioning-banned:${key}`,
      title: "Positioning contains a banned phrase",
      detail: `The positioning statement contains “${phrase}”, which is currently banned.`,
      severity: "warning"
    });
  }

  const themesByPlatform = new Map<string, Set<string>>();
  for (const preference of brain.visualIdentity.learnedPreferences) {
    const platform = normalize(preference.platform);
    if (!platform) continue;
    const themes = themesByPlatform.get(platform) ?? new Set<string>();
    themes.add(preference.theme);
    themesByPlatform.set(platform, themes);
  }
  for (const [platform, themes] of themesByPlatform) {
    if (themes.size < 2) continue;
    conflicts.push({
      id: `visual-theme:${platform}`,
      title: "Platform has conflicting learned visual themes",
      detail: `“${platform}” has multiple learned themes: ${[...themes].join(", ")}.`,
      severity: "warning"
    });
  }

  for (const item of brain.platformMemory) {
    const value = normalize(item.value);
    const bannedPhrase = banned.get(value);
    if (bannedPhrase) {
      conflicts.push({
        id: `platform-memory-banned:${item.platform}:${value}`,
        title: "Platform memory is also banned",
        detail: `“${item.value}” is saved for ${item.platform} and is also a banned phrase.`,
        severity: "high"
      });
    }
    if (item.kind === "preference" && avoidedVisualStyles.has(value)) {
      conflicts.push({
        id: `platform-memory-visual:${item.platform}:${value}`,
        title: "Platform visual preference is avoided",
        detail: `“${item.value}” is preferred for ${item.platform} but also appears in visual styles to avoid.`,
        severity: "warning"
      });
    }
  }

  return {
    status: conflicts.length > 0 ? "needs_review" : "clear",
    conflicts,
    checked: {
      toneKeywords: brain.toneKeywords.length,
      bannedPhrases: brain.bannedPhrases.length,
      approvedExamples: brain.approvedExamples.length,
      learnedRules: brain.learnedStyle.length + brain.learnedNegative.length + brain.performanceRules.length,
      visualPreferences: brain.visualIdentity.learnedPreferences.length,
      platformMemory: brain.platformMemory.length
    }
  };
}

function normalizedValues(values: string[]): Map<string, string> {
  const entries = new Map<string, string>();
  for (const value of values) {
    const key = normalize(value);
    if (key && !entries.has(key)) entries.set(key, value.trim());
  }
  return entries;
}

function sharedEntries(
  left: Map<string, string>,
  right: Map<string, string>
): Array<[string, { left: string; right: string }]> {
  return [...left].flatMap(([key, leftValue]) => {
    const rightValue = right.get(key);
    return rightValue ? [[key, { left: leftValue, right: rightValue }]] : [];
  });
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}