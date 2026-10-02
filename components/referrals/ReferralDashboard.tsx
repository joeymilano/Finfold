"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Check,
  Clock3,
  Copy,
  Gift,
  Link2,
  Loader2,
  Send,
  Sparkles,
  UserPlus,
  Users
} from "@/components/ui/icons";
import { useLocale } from "@/hooks/useLocale";
import { captureEvent } from "@/lib/posthog";
import { referralShareCopy, type ReferralSummary } from "@/lib/referral-shared";

export function ReferralDashboard() {
  const locale = useLocale();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    captureEvent("referral_entry_viewed", { surface: "invite_page" });
    fetch("/api/referrals/me", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as ReferralSummary & { error?: string };
        if (!response.ok) {
          setLoginRequired(response.status === 401);
          setError(data.error ?? (locale === "en" ? "Could not load referral progress." : "暂时无法加载邀请进度。"));
          return;
        }
        setSummary(data);
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : (locale === "en" ? "Could not load referral progress." : "暂时无法加载邀请进度。"))
      );
  }, [locale]);

  const progress = summary
    ? Math.min(100, Math.round((summary.completedCount / summary.rewardLimit) * 100))
    : 0;
  const shareText = useMemo(
    () => (summary ? referralShareCopy(locale, summary.inviteUrl) : ""),
    [locale, summary]
  );

  async function copyLink() {
    if (!summary) return;
    await navigator.clipboard.writeText(summary.inviteUrl);
    setCopied(true);
    captureEvent("referral_link_copied", { surface: "invite_page" });
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareInvite() {
    if (!summary) return;
    setSharing(true);
    try {
      if (navigator.share) {
        await navigator.share({
          title: locale === "en" ? "100 Finfold Credits for you" : "送你 100 Finfold 创作点数",
          text: shareText,
          url: summary.inviteUrl
        });
        captureEvent("referral_share_opened", { surface: "invite_page", method: "native" });
      } else {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        captureEvent("referral_share_opened", { surface: "invite_page", method: "clipboard" });
      }
    } catch (caught) {
      if (!(caught instanceof Error && caught.name === "AbortError")) {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
      }
    } finally {
      setSharing(false);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-risk/30 bg-risk/10 p-8 text-center">
        <p className="font-bold text-risk">
          {locale === "en" ? "Referral progress is temporarily unavailable." : "邀请进度暂时无法加载。"}
        </p>
        <p className="mt-2 text-sm text-fg-muted">{error}</p>
        {loginRequired ? (
          <Link href="/login" className="btn-primary focus-ring mt-5 inline-flex">
            {locale === "en" ? "Sign in to invite" : "登录后邀请好友"}
          </Link>
        ) : null}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto grid max-w-[1180px] gap-5 pb-12"
    >
      <section className="panel-command relative isolate overflow-hidden rounded-3xl p-6 shadow-glow-brand sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -right-12 -top-16 -z-10 h-64 w-64 rounded-full bg-brand/30 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 -z-10 h-36 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-bold text-brand">
              <Sparkles className="h-3.5 w-3.5" />
              {locale === "en" ? "Finfold referral rewards" : "Finfold 邀请奖励"}
            </span>
            <h1 className="mt-5 max-w-3xl text-balance text-4xl font-black leading-[0.98] text-white sm:text-5xl lg:text-6xl">
              {locale === "en" ? "Bring a builder. Both earn 100 Credits." : "带一位创作者来，双方各得 100 创作点数。"}
            </h1>
            <p className="mt-5 max-w-2xl text-sm font-medium leading-7 text-white/65 sm:text-base">
              {locale === "en"
                ? "Your friend joins through your link and completes their first creation. The reward lands automatically—no code to redeem, no form to submit."
                : "好友通过你的链接加入，并完成第一次创作。奖励会自动到账，无需兑换码，也不用提交申请。"}
            </p>
          </div>

          <div className="rounded-2xl border border-white/15 bg-black/20 p-4 backdrop-blur-xl">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wider text-white/50">
                {locale === "en" ? "Credits earned" : "已赚取创作点数"}
              </p>
              <p className="text-3xl font-black tabular-nums text-brand">{summary.earnedCredits}</p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs font-semibold text-white/55">
              {locale === "en"
                ? `${summary.completedCount} of ${summary.rewardLimit} rewarded friends`
                : `已奖励 ${summary.completedCount} / ${summary.rewardLimit} 位好友`}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-panel sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand">
              <Link2 className="h-5 w-5" />
            </span>
            <div>
              <p className="font-black text-fg">{locale === "en" ? "Your personal invite link" : "你的专属邀请链接"}</p>
              <p className="text-xs text-fg-muted">{locale === "en" ? "The last valid link used before signup gets attribution." : "注册前最后使用的有效链接获得归因。"}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1 truncate rounded-xl border border-hairline bg-surface-2 px-4 py-3 font-mono text-sm font-semibold text-fg">
              {summary.inviteUrl}
            </div>
            <button type="button" onClick={() => void copyLink()} className="btn-ghost focus-ring justify-center sm:w-auto">
              {copied ? <Check className="h-4 w-4 text-positive" /> : <Copy className="h-4 w-4" />}
              {copied ? (locale === "en" ? "Copied" : "已复制") : locale === "en" ? "Copy link" : "复制链接"}
            </button>
            <button type="button" onClick={() => void shareInvite()} disabled={sharing} className="btn-primary focus-ring justify-center">
              {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {locale === "en" ? "Share invite" : "分享邀请"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-brand/25 bg-brand/5 p-5 sm:p-6">
          <p className="eyebrow">{locale === "en" ? "How it works" : "如何生效"}</p>
          <div className="mt-4 grid gap-4">
            <ReferralStep icon={UserPlus} number="1" text={locale === "en" ? "A new friend signs up through your link" : "新好友通过你的链接注册"} />
            <ReferralStep icon={Sparkles} number="2" text={locale === "en" ? "They save their first content kit" : "好友成功保存第一个内容包"} />
            <ReferralStep icon={Gift} number="3" text={locale === "en" ? "100 Credits land in both accounts" : "双方账户各到账 100 创作点数"} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-panel sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">{locale === "en" ? "Referral progress" : "邀请进度"}</p>
            <h2 className="mt-2 text-2xl font-black text-fg">
              {locale === "en" ? "From joining to first value" : "从加入，到完成首次价值"}
            </h2>
          </div>
          <p className="text-xs font-medium text-fg-muted">
            {locale === "en" ? "Friend identifiers are masked for privacy." : "好友身份已脱敏，仅用于区分进度。"}
          </p>
        </div>

        {summary.referrals.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-hairline bg-surface-2/50 px-5 py-10 text-center">
            <Users className="mx-auto h-7 w-7 text-brand" />
            <p className="mt-3 font-bold text-fg">{locale === "en" ? "Your first invite starts here." : "从第一位好友开始。"}</p>
            <p className="mt-1 text-sm text-fg-muted">
              {locale === "en" ? "Copy the link above and send it to one builder who ships but rarely has time to post." : "把链接发给一位认真做产品、却总没时间发内容的朋友。"}
            </p>
          </div>
        ) : (
          <div className="mt-5 divide-y divide-hairline">
            {summary.referrals.map((referral) => (
              <div key={referral.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_180px_120px] sm:items-center">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
                    <Users className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-mono text-sm font-bold text-fg">{referral.friendLabel}</p>
                    <p className="text-xs text-fg-muted">{new Date(referral.attributedAt).toLocaleDateString(locale === "en" ? "en-US" : "zh-CN")}</p>
                  </div>
                </div>
                <StatusPill status={referral.status} locale={locale} />
                <p className="text-left text-sm font-black tabular-nums text-brand sm:text-right">
                  {referral.status === "completed" && referral.referrerRewardCredits > 0
                    ? `+${referral.referrerRewardCredits} ${locale === "en" ? "Credits" : "创作点数"}`
                    : referral.status === "pending"
                      ? locale === "en" ? "Pending unlock" : "待解锁"
                      : "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="px-2 text-xs leading-6 text-fg-muted">
        {locale === "en"
          ? "Rewards are for new accounts only, expire after 90 days, have no cash value, and cannot be transferred. You can earn referrer rewards for your first 10 activated friends; invited friends still receive their reward after that limit."
          : "仅新账号可参与；奖励有效期 90 天，无现金价值且不可转让。邀请人的前 10 位有效好友可获得奖励；达到上限后，受邀好友仍可获得其 100 创作点数。"}
      </p>
    </motion.div>
  );
}

function ReferralStep({ icon: Icon, number, text }: { icon: typeof Gift; number: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
        <Icon className="h-4 w-4" />
        <i className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-fg text-[9px] font-black not-italic text-bg">{number}</i>
      </span>
      <p className="text-sm font-semibold leading-5 text-fg">{text}</p>
    </div>
  );
}

function StatusPill({ status, locale }: { status: "pending" | "completed" | "ineligible"; locale: "zh" | "en" }) {
  const completed = status === "completed";
  const invalid = status === "ineligible";
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
      completed
        ? "border-positive/30 bg-positive/10 text-positive"
        : invalid
          ? "border-risk/30 bg-risk/10 text-risk"
          : "border-accent/30 bg-accent/10 text-accent"
    }`}>
      {completed ? <Check className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
      {completed
        ? locale === "en" ? "Rewarded" : "已奖励"
        : invalid
          ? locale === "en" ? "Ineligible" : "不符合资格"
          : locale === "en" ? "Waiting for first creation" : "等待首次创作"}
    </span>
  );
}
