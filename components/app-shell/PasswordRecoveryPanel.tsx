"use client";

/**
 * PasswordRecoveryPanel — 找回密码双阶段组件（Finfold）
 * ----------------------------------------------------------------------------
 * mode="request"  /forgot-password  输入邮箱 → /api/auth/forgot-password
 *                  发送 Supabase 恢复邮件（防枚举：无论邮箱是否注册都返回成功态）。
 * mode="reset"    /reset-password   从恢复邮件进入（回调已建立会话），
 *                  设置新密码 → 复用 /api/auth/password（登录态改密同一端点）。
 *
 * 安全约定与登录/注册一致：所有 Supabase 鉴权走后端 API 路由，
 * 浏览器不接触 service-role key；密码强度前后端共享 password-policy。
 * ----------------------------------------------------------------------------
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuthUser } from "@/components/auth/AuthUserProvider";
import { ArrowRight, AtSign, Check, Loader2, Lock, Mail } from "@/components/ui/icons";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { BorderBeam } from "@/components/ui/BorderBeam";
import { LocaleToggle } from "@/components/theme/LocaleToggle";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { brand } from "@/lib/brand";
import { useLocale } from "@/hooks/useLocale";
import { captureEvent } from "@/lib/posthog";
import { analyzePassword, strengthLabelZh, strengthLabelEn } from "@/lib/password-policy";

type PasswordRecoveryPanelProps = {
  mode: "request" | "reset";
  initialError?: "expired";
};

const RESEND_COOLDOWN_SECONDS = 60;

export function PasswordRecoveryPanel({ mode, initialError }: PasswordRecoveryPanelProps) {
  const router = useRouter();
  const { refresh: refreshAuthUser } = useAuthUser();
  const locale = useLocale();
  const zh = locale === "zh";

  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(
    initialError === "expired"
      ? {
          ok: false,
          msg: zh
            ? "重置链接已失效或已被使用，请重新发送一封。"
            : "The reset link expired or was already used. Send a new one."
        }
      : null
  );
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // 重置态密码强度分析（复用注册/改密同一策略）
  const pwdResult = useMemo(() => analyzePassword(newPassword), [newPassword]);
  const strengthBarColor =
    pwdResult.score === 1 ? "bg-risk"
    : pwdResult.score === 2 ? "bg-warn"
    : pwdResult.score === 3 ? "bg-accent"
    : pwdResult.score === 4 ? "bg-positive"
    : "bg-hairline";
  const strengthTextColor =
    pwdResult.score === 1 ? "text-risk"
    : pwdResult.score === 2 ? "text-warn"
    : pwdResult.score === 3 ? "text-accent"
    : pwdResult.score === 4 ? "text-positive"
    : "text-fg-muted";

  async function requestReset() {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      setStatus({ ok: false, msg: zh ? "请输入注册时使用的邮箱地址。" : "Enter the email address you signed up with." });
      return;
    }
    if (cooldown > 0) {
      setStatus({ ok: false, msg: zh ? `请等待 ${cooldown} 秒后再次发送。` : `Please wait ${cooldown}s before resending.` });
      return;
    }
    setIsLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          const retrySeconds = Math.min(3600, Math.max(1, Number(data.retryAfter) || 60));
          setCooldown(retrySeconds);
        }
        throw new Error(data.error || (zh ? "发送失败，请稍后重试。" : "Request failed, please retry."));
      }
      captureEvent("password_reset_requested", { locale: zh ? "zh" : "en" });
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      setStatus({
        ok: false,
        msg: error instanceof Error ? error.message : zh ? "发送失败，请稍后重试。" : "Request failed, please retry."
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function submitNewPassword() {
    if (!pwdResult.valid) {
      setStatus({
        ok: false,
        msg: zh ? `密码不满足要求：${pwdResult.messageZh}。` : pwdResult.messageEn || "Password does not meet requirements."
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ ok: false, msg: zh ? "两次输入的密码不一致。" : "Passwords do not match." });
      return;
    }
    setIsLoading(true);
    setStatus(null);
    try {
      // 复用登录态改密端点：恢复邮件回调已建立会话，与设置页改密同一安全路径
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setStatus({
            ok: false,
            msg: zh
              ? "重置会话已失效，请重新发送重置邮件。"
              : "Your reset session expired. Please request a new reset email."
          });
          return;
        }
        throw new Error(data.error || (zh ? "重置失败，请重试。" : "Reset failed, please retry."));
      }
      captureEvent("password_reset_completed", { locale: zh ? "zh" : "en" });
      setStatus({ ok: true, msg: zh ? "密码已重置成功，正在进入工作台…" : "Password reset. Opening your workspace…" });
      await refreshAuthUser();
      router.replace("/dashboard");
    } catch (error) {
      setStatus({
        ok: false,
        msg: error instanceof Error ? error.message : zh ? "重置失败，请重试。" : "Reset failed, please retry."
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-[100svh] items-center justify-center overflow-x-hidden bg-bg px-5 py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[url('/brand/finfold-login-hero-v2.webp')] bg-cover bg-[62%_center]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-black/25 via-black/20 to-bg" />

      <div className="absolute inset-x-5 top-5 z-20 flex items-center justify-between sm:inset-x-8">
        <Link href={zh ? "/" : "/en"} className="flex items-center gap-2.5 rounded-xl p-1.5 text-white">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg ring-1 ring-white/20">
            <FishLogo variant="app-icon" className="h-9 w-9 object-cover" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-[-0.01em]">{brand.name}</span>
            <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-[0.16em] text-white/50">
              {zh ? brand.chineseName : "AI Marketing Employee"}
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-1.5">
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </div>

      <section
        data-password-recovery-panel=""
        className="relative z-10 w-full max-w-[440px] overflow-hidden rounded-[22px] border border-hairline bg-surface/82 p-5 shadow-[0_28px_90px_-48px_rgb(0_0_0/0.92),inset_0_1px_0_rgb(255_255_255/0.055)] backdrop-blur-2xl sm:p-8 dark:border-white/[0.09] dark:bg-[rgb(8_10_12/0.62)]"
      >
        <BorderBeam
          size={124}
          duration={10.5}
          initialOffset={12}
          borderWidth={1.15}
          beamOpacity={0.72}
          colorFrom="#2dd4bf"
          colorTo="#d9b766"
        />

        {mode === "request" ? (
          <>
            <h1 className="text-[1.9rem] font-semibold leading-tight tracking-[-0.045em] text-fg">
              {zh ? "找回密码" : "Reset your password"}
            </h1>
            <p className="mt-3 text-pretty text-sm font-normal leading-6 text-fg-muted">
              {zh
                ? "输入注册邮箱，我们会发送一封重置邮件。链接 1 小时内有效，且只能使用一次。"
                : "Enter your account email and we'll send a reset link. It stays valid for 1 hour and can only be used once."}
            </p>

            {sent ? (
              <div className="mt-6 grid gap-4" data-testid="forgot-password-sent">
                <div className="flex items-start gap-3 rounded-xl border border-positive/30 bg-positive/[0.08] p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-positive/15 text-positive">
                    <Mail className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-fg">
                      {zh ? "重置邮件已发送" : "Reset email sent"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-fg-muted">
                      {zh
                        ? `我们已向 ${email.trim()} 发送重置链接。请检查收件箱和垃圾邮件文件夹；如果几分钟内没有收到，可以重新发送。`
                        : `We sent a reset link to ${email.trim()}. Check your inbox and spam folder; resend if it doesn't arrive within a few minutes.`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void requestReset()}
                  disabled={isLoading || cooldown > 0}
                  className="focus-ring group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-action/60 bg-action px-4 py-2.5 text-sm font-bold text-on-action shadow-[0_14px_34px_-16px_rgb(var(--action)/0.8)] transition-all hover:-translate-y-0.5 hover:bg-action-strong disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {cooldown > 0
                    ? zh ? `重新发送（${cooldown}s）` : `Resend in ${cooldown}s`
                    : zh ? "重新发送重置邮件" : "Resend reset email"}
                </button>
                <Link href="/login" className="focus-ring rounded-sm text-center text-sm font-semibold text-fg-muted transition-colors hover:text-action-strong dark:hover:text-action">
                  {zh ? "返回登录" : "Back to sign in"}
                </Link>
              </div>
            ) : (
              <div className="mt-6 grid gap-4">
                <label className="grid gap-1.5 text-sm font-semibold text-fg">
                  <span>{zh ? "注册邮箱" : "Account email"}</span>
                  <span className="group flex min-h-11 items-center gap-2.5 rounded-lg border border-hairline bg-bg/45 px-3 transition focus-within:border-action/55 focus-within:bg-surface focus-within:shadow-[0_0_0_3px_rgb(var(--action)/0.1)]">
                    <AtSign className="h-4 w-4 shrink-0 text-fg-muted transition-colors group-focus-within:text-action-strong dark:group-focus-within:text-action" />
                    <input
                      type="email"
                      data-testid="forgot-password-email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void requestReset()}
                      className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm font-normal text-fg outline-none placeholder:text-fg-muted"
                      placeholder="your@email.com"
                      autoComplete="email"
                    />
                  </span>
                </label>

                {status ? (
                  <p className={`rounded-lg border px-3 py-2.5 text-sm ${status.ok ? "border-positive/30 bg-positive/10 text-positive" : "border-risk/30 bg-risk/10 text-risk"}`}>
                    {status.msg}
                  </p>
                ) : null}

                <button
                  type="button"
                  data-testid="forgot-password-submit"
                  onClick={() => void requestReset()}
                  disabled={isLoading || cooldown > 0}
                  className="focus-ring group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-action/60 bg-action px-4 py-2.5 text-sm font-bold text-on-action shadow-[0_14px_34px_-16px_rgb(var(--action)/0.8)] transition-all hover:-translate-y-0.5 hover:bg-action-strong hover:shadow-[0_18px_40px_-14px_rgb(var(--action)/0.72)] active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {cooldown > 0
                    ? zh ? `重新发送（${cooldown}s）` : `Resend in ${cooldown}s`
                    : zh ? "发送重置邮件" : "Send reset email"}{" "}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>

                <Link href="/login" className="focus-ring rounded-sm text-center text-sm font-semibold text-fg-muted transition-colors hover:text-action-strong dark:hover:text-action">
                  {zh ? "返回登录" : "Back to sign in"}
                </Link>
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className="text-[1.9rem] font-semibold leading-tight tracking-[-0.045em] text-fg">
              {zh ? "设置新密码" : "Set a new password"}
            </h1>
            <p className="mt-3 text-pretty text-sm font-normal leading-6 text-fg-muted">
              {zh
                ? "你的身份已通过重置邮件验证，请设置新的登录密码。"
                : "Your identity was verified via the reset email. Set a new sign-in password below."}
            </p>

            <div className="mt-6 grid gap-4">
              <label className="grid gap-1.5 text-sm font-semibold text-fg">
                <span>{zh ? "新密码" : "New password"}</span>
                <span className="group flex min-h-11 items-center gap-2.5 rounded-lg border border-hairline bg-bg/45 px-3 transition focus-within:border-action/55 focus-within:bg-surface focus-within:shadow-[0_0_0_3px_rgb(var(--action)/0.1)]">
                  <Lock className="h-4 w-4 shrink-0 text-fg-muted transition-colors group-focus-within:text-action-strong dark:group-focus-within:text-action" />
                  <input
                    type="password"
                    data-testid="reset-password-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm font-normal text-fg outline-none placeholder:text-fg-muted"
                    placeholder={zh ? "至少 8 位，含字母和数字" : "8+ chars, letters & numbers"}
                    autoComplete="new-password"
                  />
                </span>
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-fg">
                <span>{zh ? "确认新密码" : "Confirm new password"}</span>
                <span className="group flex min-h-11 items-center gap-2.5 rounded-lg border border-hairline bg-bg/45 px-3 transition focus-within:border-action/55 focus-within:bg-surface focus-within:shadow-[0_0_0_3px_rgb(var(--action)/0.1)]">
                  <Lock className="h-4 w-4 shrink-0 text-fg-muted transition-colors group-focus-within:text-action-strong dark:group-focus-within:text-action" />
                  <input
                    type="password"
                    data-testid="reset-password-confirm"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void submitNewPassword()}
                    className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm font-normal text-fg outline-none placeholder:text-fg-muted"
                    placeholder={zh ? "再输入一次" : "Enter it again"}
                    autoComplete="new-password"
                  />
                </span>
              </label>

              {newPassword.length > 0 ? (
                <div className="-mt-1 grid gap-2 rounded-lg border border-hairline bg-surface-2/60 p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-1.5 flex-1 gap-1" aria-hidden>
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={`h-full flex-1 rounded-full transition-colors ${i < pwdResult.score ? strengthBarColor : "bg-hairline"}`}
                        />
                      ))}
                    </div>
                    <span className={`w-10 text-right text-xs font-semibold ${strengthTextColor}`}>
                      {zh ? strengthLabelZh(pwdResult.level) : strengthLabelEn(pwdResult.level)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {pwdResult.checks.map((c) => (
                      <span
                        key={c.id}
                        className={`inline-flex items-center gap-1 text-[11px] ${c.ok ? "text-positive" : "text-fg-muted"}`}
                      >
                        {c.ok ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <span className="inline-block h-2.5 w-2.5 rounded-full border border-current opacity-50" />
                        )}
                        {zh ? c.zh : c.en}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {status ? (
                <p className={`rounded-lg border px-3 py-2.5 text-sm ${status.ok ? "border-positive/30 bg-positive/10 text-positive" : "border-risk/30 bg-risk/10 text-risk"}`}>
                  {status.msg}
                </p>
              ) : null}

              <button
                type="button"
                data-testid="reset-password-submit"
                onClick={() => void submitNewPassword()}
                disabled={isLoading || !pwdResult.valid || newPassword !== confirmPassword}
                className="focus-ring group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-action/60 bg-action px-4 py-2.5 text-sm font-bold text-on-action shadow-[0_14px_34px_-16px_rgb(var(--action)/0.8)] transition-all hover:-translate-y-0.5 hover:bg-action-strong hover:shadow-[0_18px_40px_-14px_rgb(var(--action)/0.72)] active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {zh ? "重置密码" : "Reset password"}{" "}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>

              <Link href="/forgot-password" className="focus-ring rounded-sm text-center text-sm font-semibold text-fg-muted transition-colors hover:text-action-strong dark:hover:text-action">
                {zh ? "使用另一封重置邮件" : "Use a different reset email"}
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
