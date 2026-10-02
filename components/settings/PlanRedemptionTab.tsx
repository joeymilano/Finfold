"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { useAuthUser } from "@/components/auth/AuthUserProvider";
import { ArrowRight, CheckCircle2, Gift, Loader2 } from "@/components/ui/icons";
import { useLocale } from "@/hooks/useLocale";

const planLabelZh: Record<string, string> = {
  free: "免费版", starter: "Starter", creator: "Creator",
  pro: "Pro", team: "Team", growth: "Growth", employee: "数字员工", trial: "试用",
  starter_v2: "入门版", creator_v2: "创作者", growth_v2: "增长引擎", digital_employee_v2: "数字员工",
};
const planLabelEn: Record<string, string> = {
  free: "Free", starter: "Starter", creator: "Creator",
  pro: "Pro", team: "Team", growth: "Growth", employee: "Digital Employee", trial: "Trial",
  starter_v2: "Starter", creator_v2: "Creator", growth_v2: "Growth Engine", digital_employee_v2: "Digital Employee",
};

/**
 * PlanRedemptionTab — current plan summary and activation / coupon code redemption.
 */
export function PlanRedemptionTab() {
  const router = useRouter();
  const locale = useLocale();
  const { user: authUser } = useAuthUser();

  // Activation / coupon code
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemStatus, setRedeemStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [redeemLoading, setRedeemLoading] = useState(false);

  async function redeem() {
    const code = redeemCode.trim().toUpperCase();
    if (!code) { setRedeemStatus({ ok: false, msg: locale === "en" ? "Enter an activation code." : "请输入激活码。" }); return; }
    setRedeemLoading(true);
    setRedeemStatus(null);
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        const reasons: Record<string, { en: string; zh: string }> = {
          invalid: { en: "This code is invalid.", zh: "激活码无效。" },
          already_used: { en: "This code has already been used.", zh: "该激活码已被使用。" },
          redemption_limit_reached: { en: "This code has reached its redemption limit.", zh: "该激活码的兑换名额已用完。" },
          expired: { en: "This code has expired.", zh: "该激活码已过期。" },
          already_subscribed: { en: "You already have an active plan — codes are for free accounts only.", zh: "你已有生效中的付费套餐，激活码仅限免费账户使用。" },
          unauthenticated: { en: "Please sign in first.", zh: "请先登录。" },
        };
        const r = reasons[data.error as string] ?? { en: "Redemption failed, please retry.", zh: "兑换失败，请重试。" };
        throw new Error(locale === "en" ? r.en : r.zh);
      }
      const planLabel = (locale === "en" ? planLabelEn : planLabelZh)[data.plan] ?? data.plan;
      setRedeemStatus({
        ok: true,
        msg: locale === "en"
          ? `Success! ${planLabel} unlocked for ${data.days} days. Reloading…`
          : `兑换成功！已解锁 ${planLabel}，有效期 ${data.days} 天。正在刷新…`,
      });
      setRedeemCode("");
      // Reload so the new plan/limits are reflected everywhere (entitlements
      // are fetched on mount across the app).
      setTimeout(() => router.refresh(), 1200);
    } catch (err) {
      setRedeemStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? "Redemption failed, please retry." : "兑换失败，请重试。") });
    } finally {
      setRedeemLoading(false);
    }
  }

  const plan = authUser?.plan ?? "";
  const planLabel = (locale === "en" ? planLabelEn : planLabelZh)[plan] ?? plan;

  return (
    <div className="grid max-w-3xl gap-6">
      {/* Current plan */}
      <section className="panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Gift className="h-4 w-4 text-brand" />
          {locale === "en" ? "Current Plan" : "当前套餐"}
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface/45 px-3 py-2.5">
          {authUser ? <p className="truncate text-sm text-fg-muted">{authUser.email}</p> : null}
          <p className="text-lg font-bold text-fg">{planLabel}</p>
        </div>
        <p className="text-xs text-fg-muted">
          {locale === "en"
            ? "Need more capacity? Compare plans and upgrade on the billing page."
            : "需要更大用量？可到账单页对比套餐并升级。"}
        </p>
        <button
          type="button"
          onClick={() => router.push("/billing")}
          className="focus-ring inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2.5 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] dark:text-action"
        >
          {locale === "en" ? "View billing" : "前往账单页"} <ArrowRight className="h-4 w-4" />
        </button>
      </section>

      {/* Redeem activation / coupon code */}
      <section className="panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Gift className="h-4 w-4 text-brand" />
          {locale === "en" ? "Redeem Code" : "兑换激活码"}
        </div>
        <p className="text-xs text-fg-muted">{locale === "en" ? "Have an activation or coupon code? Redeem it here to unlock a trial plan. Available for free accounts only." : "有激活码或优惠码？在此兑换即可解锁体验套餐。仅限免费账户使用。"}</p>
        <label className="grid gap-1.5 text-sm font-medium text-fg">
          {locale === "en" ? "Activation code" : "激活码"}
          <input type="text" value={redeemCode} onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && void redeem()}
            className="focus-ring panel-inset rounded-lg px-3 py-2.5 font-mono tracking-wider text-fg placeholder:text-fg-muted placeholder:font-sans placeholder:tracking-normal"
            placeholder={locale === "en" ? "e.g. FINFOLD-XXXX" : "例如 FINFOLD-XXXX"} autoComplete="off" spellCheck={false} />
        </label>
        {redeemStatus ? (
          <p className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${redeemStatus.ok ? "border border-positive/30 bg-positive/10 text-positive" : "border border-risk/30 bg-risk/10 text-risk"}`}>
            {redeemStatus.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
            {redeemStatus.msg}
          </p>
        ) : null}
        <button type="button" onClick={() => void redeem()} disabled={redeemLoading} className="btn-primary focus-ring disabled:opacity-60">
          {redeemLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {locale === "en" ? "Redeem" : "立即兑换"} <ArrowRight className="h-4 w-4" />
        </button>
      </section>
    </div>
  );
}
