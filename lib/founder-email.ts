/**
 * lib/founder-email.ts
 * ----------------------------------------------------------------------------
 * 创始人欢迎邮件（Finfold）
 *
 * 设计意图：复刻 Resend 式 onboarding——新用户确认邮箱 / 首次登录后，
 * 收到一封来自创始人 Joey 的「看起来像手写」的纯文本邮件。
 *   - 发件人用真人地址 joey@finfold.app，reply_to 同地址
 *     （点"回复"直达创始人收件箱，每一封都由真人处理）
 *   - 纯文本、无品牌横幅、无 HTML，越像真人手写越好
 *   - 按 locale 发对应语言版本（zh / en）
 *
 * 发送走 Resend REST API：纯 fetch，edge runtime 兼容，
 * 不依赖 resend SDK 或任何 Node 内置模块（项目部署在 Cloudflare Workers）。
 * ----------------------------------------------------------------------------
 */

import { PRICING_PLANS } from "@/lib/pricing";

export type FounderLocale = "zh" | "en";

/** 发件人地址：真人，绝不用 noreply。可在 .env 用 RESEND_FROM 覆盖。 */
const DEFAULT_FROM = "Joey <joey@finfold.app>";
/** 回复地址：直达创始人收件箱。 */
const REPLY_TO = "joey@finfold.app";

const SUBJECT_ZH = "欢迎来到 Finfold";
const SUBJECT_EN = "Welcome to Finfold";
const FREE_CREDITS = PRICING_PLANS.free.internalCredits.toLocaleString("en-US");

const BODY_ZH = `Hey，

我是 Joey Zhao，Finfold 的创始人。这封邮件是我写的，不是自动客服——你点"回复"，会直接进我的收件箱，每一封我都看，也都会回。

做 Finfold，是因为我自己先掉进过这个坑：东西做出来了，却没力气在每个平台把它讲出去。同一条更新，小红书要一种写法，X 要另一种，写到第三个平台就已经不想发了。酒香也怕巷子深——这句话我是真的信，所以才有了 Finfold。

三步，花 10 分钟看看它对你值不值：

1. 把你最近的一条产品更新粘进工作台，选择 3 个核心平台生成草稿
2. 花 3 分钟填一下品牌记忆：你的语气、不能说的词、喜欢的范文。填得越多，它写得越像你
3. 草稿里哪句不像你说话，直接改掉。你的改法它会记住，下一篇就不会再犯

免费版每月送你 ${FREE_CREDITS} 创作点数，够你跑通一次完整的创作、发布与复盘流程。

P.S. 想请你帮个小忙：你在做什么产品？现在最难做起来的平台是哪个？回复告诉我，一句话就行。Finfold 还很早，你的每一条回复都在实际决定它接下来往哪做。

Joey
Finfold 创始人`;

const BODY_EN = `Hey,

I'm Joey Zhao, founder of Finfold. I wrote this email myself — it's not an automated support bot. If you hit "Reply," it lands straight in my inbox. I read and answer every single one.

I built Finfold because I fell into this hole first: I'd ship something I was proud of, then have no energy left to tell every platform about it. The same update needs one voice on X, another on LinkedIn, a third on RED. By platform number three, I'd just give up and not post at all. Good work still needs to be seen — that's the whole reason Finfold exists.

Three steps, ten minutes, to see if it's worth your time:

1. Paste your latest product update into the Workbench and generate drafts for 3 core platforms
2. Spend 3 minutes on Brand Memory: your tone, banned words, a few posts you like. The more you feed it, the more it sounds like you
3. If a line doesn't sound like you, just edit it. Finfold remembers your edits and won't make the same mistake twice

The free plan includes ${FREE_CREDITS} AI Credits every month — enough to complete one creation, publishing, and review cycle.

P.S. One small favor: what are you building, and which platform is hardest for you to grow on right now? Hit "Reply" and tell me — one sentence is plenty. Finfold is still early, and your replies are literally deciding what we build next.

Joey
Founder, Finfold`;

interface SendFounderEmailParams {
  to: string;
  locale: FounderLocale;
}

export function getFounderWelcomeBody(locale: FounderLocale): string {
  return locale === "en" ? BODY_EN : BODY_ZH;
}

interface ResendErrorBody {
  message?: string;
  name?: string;
}

/**
 * 发送创始人欢迎邮件。纯 fetch 调用 Resend REST API。
 *
 * - 未配置 RESEND_API_KEY 时静默跳过（保证注册流程在任何环境都不被邮件能力卡住）
 * - 自带 8 秒超时，避免拖慢 /auth/callback 的确认跳转
 * - 成功返回 true，失败返回 false（调用方据此决定是否写入「已发送」标记）
 */
export async function sendFounderWelcome({
  to,
  locale,
}: SendFounderEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // 未配置 → 静默跳过。注册流程不依赖邮件能力。
    return false;
  }

  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  const subject = locale === "en" ? SUBJECT_EN : SUBJECT_ZH;
  const text = getFounderWelcomeBody(locale);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: REPLY_TO,
        subject,
        text,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as ResendErrorBody;
      console.error("[founder-email] Resend error", res.status, err?.message);
      return false;
    }
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[founder-email] send timed out (>8s)");
    } else {
      console.error("[founder-email] send failed", error);
    }
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
