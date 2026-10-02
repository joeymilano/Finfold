import type { Locale } from "@/lib/i18n";

type GenerateGateInput = {
  ideaText: string;
  sourceAttachmentCount?: number;
  selectedPlatformCount: number;
  isLoading: boolean;
  authenticated: boolean;
  trialUsed: boolean;
  locale: Locale;
  /** Max platforms the current plan allows per kit. Omit to skip this check
   * (e.g. before the entitlements response has loaded). */
  platformLimit?: number;
  /** Operational cap shared by every plan to keep one generation bounded. */
  maxPlatformsPerGeneration?: number;
};

export function getGenerateDisabledReason({
  ideaText,
  sourceAttachmentCount = 0,
  selectedPlatformCount,
  isLoading,
  authenticated,
  trialUsed,
  locale,
  platformLimit,
  maxPlatformsPerGeneration
}: GenerateGateInput): string | null {
  const ideaLength = ideaText.trim().length;

  if (isLoading) {
    return locale === "en" ? "Generating your growth kit..." : "正在生成增长资产包...";
  }

  if (ideaLength < 20 && sourceAttachmentCount < 1) {
    return locale === "en"
      ? `Add at least 20 characters of product context or attach a source file. You currently have ${ideaLength}.`
      : `请至少输入 20 个字的产品资产说明，或上传一份源文件；当前 ${ideaLength} 个字。`;
  }

  if (selectedPlatformCount < 1) {
    return locale === "en" ? "Select at least 1 platform to generate for." : "请至少选择 1 个要生成的平台。";
  }

  if (
    typeof maxPlatformsPerGeneration === "number" &&
    selectedPlatformCount > maxPlatformsPerGeneration
  ) {
    return locale === "en"
      ? `Choose up to ${maxPlatformsPerGeneration} platforms per generation to keep it fast and reliable.`
      : `为保证生成速度和稳定性，单次最多选择 ${maxPlatformsPerGeneration} 个平台。`;
  }

  if (typeof platformLimit === "number" && selectedPlatformCount > platformLimit) {
    return locale === "en"
      ? `Your plan supports up to ${platformLimit} platforms per kit. Deselect some, or upgrade.`
      : `当前套餐每份内容包最多支持 ${platformLimit} 个平台，请取消选择或升级套餐。`;
  }

  if (!authenticated && trialUsed) {
    return locale === "en" ? "Your free trial has been used. Sign in to continue." : "试玩次数已用完，请先登录后继续生成。";
  }

  return null;
}
