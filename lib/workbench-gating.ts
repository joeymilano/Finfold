import type { Locale } from "@/lib/i18n";

type GenerateGateInput = {
  ideaText: string;
  selectedPlatformCount: number;
  isLoading: boolean;
  authenticated: boolean;
  trialUsed: boolean;
  locale: Locale;
};

export function getGenerateDisabledReason({
  ideaText,
  selectedPlatformCount,
  isLoading,
  authenticated,
  trialUsed,
  locale
}: GenerateGateInput): string | null {
  const ideaLength = ideaText.trim().length;

  if (isLoading) {
    return locale === "en" ? "Generating your growth kit..." : "正在生成增长资产包...";
  }

  if (ideaLength < 20) {
    return locale === "en"
      ? `Add at least 20 characters of product context. You currently have ${ideaLength}.`
      : `请至少输入 20 个字的产品资产说明，当前 ${ideaLength} 个字。`;
  }

  if (selectedPlatformCount < 1) {
    return locale === "en" ? "Select at least 1 platform to generate for." : "请至少选择 1 个要生成的平台。";
  }

  if (!authenticated && trialUsed) {
    return locale === "en" ? "Your free trial has been used. Sign in to continue." : "试玩次数已用完，请先登录后继续生成。";
  }

  return null;
}
