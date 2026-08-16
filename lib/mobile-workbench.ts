export const MOBILE_SOURCE_MIN_LENGTH = 20;

export type MobileWorkbenchStep = 1 | 2 | 3;

export function isMobileSourceReady(ideaText: string): boolean {
  return ideaText.trim().length >= MOBILE_SOURCE_MIN_LENGTH;
}

export function getMobileGenerationEstimate(platformCount: number): number {
  return Math.max(30, Math.ceil(Math.max(1, platformCount) / 2) * 25);
}

export function getMobileSourceGuidance(ideaText: string, locale: "zh" | "en"): string {
  const currentLength = ideaText.trim().length;
  if (currentLength >= MOBILE_SOURCE_MIN_LENGTH) {
    return locale === "en" ? "Source ready" : "源素材已就绪";
  }

  const remaining = MOBILE_SOURCE_MIN_LENGTH - currentLength;
  return locale === "en"
    ? `Add ${remaining} more ${remaining === 1 ? "character" : "characters"} to continue.`
    : `还需输入 ${remaining} 个字才能继续。`;
}
