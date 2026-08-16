type ReferralEmailParams = {
  to: string;
  locale: "zh" | "en";
  credits: number;
};

export async function sendReferralRewardEmail({
  to,
  locale,
  credits
}: ReferralEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = process.env.RESEND_FROM || "Joey <joey@finfold.app>";
  const subject =
    locale === "en" ? `Your ${credits} referral Credits have arrived` : `你的 ${credits} 邀请创作点数已到账`;
  const text =
    locale === "en"
      ? `A friend you invited just completed their first creation in Finfold.\n\n${credits} Credits are now in your account and are valid for 90 days. Thanks for helping another builder get their work seen.\n\nView your referral progress: https://www.finfold.app/invite\n\nJoey\nFounder, Finfold`
      : `你邀请的一位好友刚刚在 Finfold 完成了第一次创作。\n\n${credits} 创作点数已经到账，有效期 90 天。谢谢你帮助另一位创作者把好作品讲出去。\n\n查看邀请进度：https://www.finfold.app/invite\n\nJoey\nFinfold 创始人`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: "joey@finfold.app",
        subject,
        text
      }),
      signal: controller.signal
    });
    return response.ok;
  } catch (error) {
    console.error("[referral-email] send failed", error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
