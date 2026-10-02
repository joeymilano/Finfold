export const REFERRAL_COOKIE = "finfold-referral";
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const REFERRAL_REWARD_CREDITS = 100;
export const REFERRAL_REWARD_LIMIT = 10;
export const REFERRAL_REWARD_DAYS = 90;

export type ReferralStatus = "pending" | "completed" | "ineligible";

export type ReferralSummary = {
  code: string;
  inviteUrl: string;
  completedCount: number;
  pendingCount: number;
  earnedCredits: number;
  rewardLimit: number;
  rewardCredits: number;
  referrals: Array<{
    id: string;
    friendLabel: string;
    status: ReferralStatus;
    attributedAt: string;
    rewardedAt: string | null;
    referrerRewardCredits: number;
  }>;
};

export function maskReferralFriend(userId: string): string {
  const suffix = userId.replace(/-/g, "").slice(-4).toUpperCase();
  return `•••• ${suffix || "NEW"}`;
}

export function referralShareCopy(locale: "zh" | "en", inviteUrl: string): string {
  return locale === "en"
    ? `I'm using Finfold to turn one product update into platform-ready copy and visuals. You get 100 Credits, and we both earn the reward after your first creation: ${inviteUrl}`
    : `我在用 Finfold 把一次产品更新变成多平台文案和视觉。送你 100 创作点数，完成第一次创作后我们都会获得奖励：${inviteUrl}`;
}
