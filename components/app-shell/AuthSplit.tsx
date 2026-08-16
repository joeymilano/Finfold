"use client";

/**
 * AuthSplit — 分屏式登录 / 注册组件（Finfold）
 * ----------------------------------------------------------------------------
 * 设计意图：把原有单卡片 AuthForm 升级为「左品牌叙事 + 右功能表单」分屏布局，
 * 适合作为 /login、/signup 的独立全屏入口；移动端 (<lg) 自动折叠为单列表单。
 *
 * 支持的登录方式（右侧表单）：
 *   1. Google OAuth（既有）
 *   2. GitHub OAuth（与 Google 共用 /api/auth/oauth）
 *   3. 邮箱 + 密码（既有，含注册态密码强度策略）
 *   4. 手机号 + 短信验证码（已用 PHONE_AUTH_ENABLED 隐藏，代码保留）
 *
 * 集成方式（与现有 AuthForm 完全等价，仅替换渲染外壳）：
 *   app/(auth)/login/page.tsx  →  <AuthSplit mode="login" />
 *   app/(auth)/signup/page.tsx →  <AuthSplit mode="signup" />
 *
 * 所有 Supabase 鉴权仍走后端 API 路由（/api/auth/login、/signup、/oauth），
 * 不在浏览器暴露 service-role key —— 与项目既有安全架构一致。
 * ----------------------------------------------------------------------------
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  AtSign,
  Check,
  Gift,
  Loader2,
  Lock,
} from "@/components/ui/icons";
import { motion } from "motion/react";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { BorderBeam } from "@/components/ui/BorderBeam";
import { LocaleToggle } from "@/components/theme/LocaleToggle";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { brand } from "@/lib/brand";
import { useLocale } from "@/hooks/useLocale";
import { captureEvent, identifyAnalyticsUser } from "@/lib/posthog";
import { analyzePassword, strengthLabelZh, strengthLabelEn } from "@/lib/password-policy";
import { localizeSignupError } from "@/lib/signup-error";
import {
  buildAuthHref,
  getPlanIntentFromReturnTo,
  sanitizeInternalReturnTo
} from "@/lib/auth-return";
import {
  PRICING_PLANS,
  formatPlanPrice,
  getLocalizedPlanCopy,
  marketForLocale
} from "@/lib/pricing";

type AuthSplitProps = {
  mode: "login" | "signup";
  referralOffer?: "valid" | "invalid" | null;
  returnTo?: string;
};

type AuthMethod = "email" | "phone";

/**
 * 手机号登录总开关。
 * 当前关闭：Supabase 内置短信商对 +86 大陆号送达率不稳定，国内三网通道又需企业资质，
 * 故先隐藏前端入口。后端 /api/auth/phone/* 与本组件手机号分支均保留，置 true 即恢复。
 */
const PHONE_AUTH_ENABLED = false;

// 常用国家/地区区号（默认 +86，覆盖大陆主场景）
const COUNTRY_CODES = [
  { code: "+86", zh: "中国大陆", en: "China" },
  { code: "+852", zh: "中国香港", en: "Hong Kong" },
  { code: "+886", zh: "中国台湾", en: "Taiwan" },
  { code: "+1", zh: "美国/加拿大", en: "US/CA" },
  { code: "+65", zh: "新加坡", en: "Singapore" },
  { code: "+60", zh: "马来西亚", en: "Malaysia" },
  { code: "+61", zh: "澳大利亚", en: "Australia" },
  { code: "+44", zh: "英国", en: "UK" },
  { code: "+81", zh: "日本", en: "Japan" },
] as const;

/** 去除非数字并去前导 0，拼成 E.164（如 +86 + 13800138000 → +8613800138000） */
function toE164(cc: string, raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  return `${cc}${digits}`;
}

/** 大陆号校验：1[3-9]xxxxxxxxx */
function isCnMobile(raw: string): boolean {
  return /^1[3-9]\d{9}$/.test(raw.replace(/\D/g, ""));
}

/** 通用号码校验：按区号分派；非 +86 放宽为 6~14 位数字 */
function isLikelyValidPhone(cc: string, raw: string): boolean {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (cc === "+86") return isCnMobile(digits);
  return digits.length >= 6 && digits.length <= 14;
}

export function AuthSplit({ mode, referralOffer = null, returnTo = "/dashboard" }: AuthSplitProps) {
  const router = useRouter();
  const locale = useLocale();
  const [authMethod, setAuthMethod] = useState<AuthMethod>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [countryCode, setCountryCode] = useState<string>("+86");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isLogin = mode === "login";
  const busy = isLoading || otpLoading;
  const safeReturnTo = useMemo(() => sanitizeInternalReturnTo(returnTo), [returnTo]);
  const selectedPlan = useMemo(() => getPlanIntentFromReturnTo(safeReturnTo), [safeReturnTo]);

  // 注册态密码强度分析（驱动强度条 / 规则清单 / 提交校验）
  const pwdResult = useMemo(() => analyzePassword(password), [password]);
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
  const zh = locale === "zh";

  // Persist the detected locale into a cookie so server-side routes (notably
  // /auth/callback, which sends the founder welcome email) can read it right
  // after email confirmation / OAuth — before the profile row is updated.
  useEffect(() => {
    if (typeof document !== "undefined" && (locale === "zh" || locale === "en")) {
      document.cookie = `finfold-locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    }
  }, [locale]);

  useEffect(() => {
    if (!selectedPlan) return;
    captureEvent("auth_plan_intent_viewed", {
      plan_key: selectedPlan,
      auth_mode: mode,
      return_to: safeReturnTo
    });
  }, [mode, safeReturnTo, selectedPlan]);

  // 60 秒倒计时（获取验证码冷却）
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // 切换登录方式时清空提示，避免旧报错残留
  function switchMethod(method: AuthMethod) {
    if (method === authMethod) return;
    setAuthMethod(method);
    setStatus(null);
  }

  /** OAuth 登录（Google / GitHub），统一走 /api/auth/oauth */
  async function signInWithOAuth(provider: "google" | "github") {
    setIsLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/auth/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, next: safeReturnTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "OAuth sign-in failed.");
      if (data.url) window.location.href = data.url;
    } catch (error) {
      const name = provider === "google" ? "Google" : "GitHub";
      const msg = error instanceof Error
        ? error.message
        : zh
          ? `${name} 登录失败，请重试。`
          : `${name} sign-in failed, please retry.`;
      setStatus(msg);
      setIsLoading(false);
    }
  }

  async function submit() {
    if (!email || !password) {
      setStatus(zh ? "请填写邮箱和密码。" : "Please fill in your email and password.");
      return;
    }
    // 注册态：前端先做密码强度校验（后端会再兜底）
    if (!isLogin && !pwdResult.valid) {
      setStatus(
        zh
          ? `密码不满足要求：${pwdResult.messageZh}。`
          : pwdResult.messageEn || "Password does not meet requirements.",
      );
      return;
    }
    setIsLoading(true);
    setStatus(null);
    try {
      const endpoint = isLogin ? "/api/auth/login" : "/api/auth/signup";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, next: safeReturnTo }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          isLogin
            ? data.error || "Action failed."
            : localizeSignupError(data.code, zh ? "zh" : "en", data.error || "Action failed."),
        );
      }

      if (data.user?.id) {
        identifyAnalyticsUser({ id: data.user.id, locale: zh ? "zh" : "en" });
      }

      if (!isLogin && data.needsConfirmation) {
        captureEvent("signup");
        setStatus(
          zh
            ? "注册成功，请检查邮箱并点击确认链接后再登录。"
            : "Sign up successful! Check your inbox and click the confirmation link to log in.",
        );
        return;
      }
      if (!isLogin) captureEvent("signup");
      captureEvent("auth_return_resumed", {
        plan_key: selectedPlan ?? "none",
        return_to: safeReturnTo
      });
      router.push(safeReturnTo);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : zh ? "操作失败，请重试。" : "Action failed, please retry.";
      setStatus(msg);
    } finally {
      setIsLoading(false);
    }
  }

  /** 发送短信验证码 */
  async function sendPhoneOtp() {
    if (!isLikelyValidPhone(countryCode, phone)) {
      setStatus(zh ? "请输入正确的手机号。" : "Please enter a valid phone number.");
      return;
    }
    setOtpLoading(true);
    setStatus(null);
    try {
      const e164 = toE164(countryCode, phone);
      const res = await fetch("/api/auth/phone/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: e164 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code.");
      setCountdown(60);
      setOtpSent(true);
      setStatus(zh ? "验证码已发送，请注意查收（可能落入短信拦截，请留意）。" : "Code sent. Check your messages (including spam folders).");
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : zh ? "发送失败，请稍后重试。" : "Failed to send code.";
      setStatus(msg);
    } finally {
      setOtpLoading(false);
    }
  }

  /** 校验验证码并登录（手机号不存在则自动注册） */
  async function submitPhone() {
    if (!phone || !phoneCode) {
      setStatus(zh ? "请输入手机号和验证码。" : "Please enter your phone number and code.");
      return;
    }
    setIsLoading(true);
    setStatus(null);
    try {
      const e164 = toE164(countryCode, phone);
      const res = await fetch("/api/auth/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: e164, token: phoneCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed.");
      captureEvent("phone_auth");
      router.push(safeReturnTo);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : zh ? "验证失败，请重试。" : "Verification failed, please retry.";
      setStatus(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main
      data-product-shell
      className="relative isolate min-h-[100svh] overflow-x-hidden bg-bg font-sans text-fg lg:grid lg:h-screen lg:min-h-0 lg:grid-cols-[minmax(0,1.16fr)_minmax(480px,0.84fr)] lg:overflow-hidden"
    >
      {/* ===================== 左侧 · 品牌叙事 ===================== */}
      <aside className="relative hidden min-h-0 overflow-hidden border-r border-white/10 bg-black lg:block">
        <motion.div
          aria-hidden
          className="absolute -inset-3 bg-[url('/brand/finfold-login-hero-v2.webp')] bg-cover bg-[58%_center]"
          animate={{ scale: [1.01, 1.045, 1.01], x: [0, -6, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,4,0.58)_0%,rgba(5,5,4,0.03)_36%,rgba(5,5,4,0.2)_58%,rgba(5,5,4,0.88)_100%)]" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,4,0.4),transparent_52%)]" />
        <div aria-hidden className="grain-local opacity-[0.08]" />

        <motion.div
          className="absolute left-10 top-8 z-10 xl:left-14 xl:top-10 2xl:left-16"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Link href={zh ? "/" : "/en"} className="group flex items-center gap-3 rounded-xl p-1.5 text-white transition-colors hover:bg-white/[0.06]">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl ring-1 ring-white/20">
              <FishLogo variant="app-icon" className="h-10 w-10 object-cover" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-[-0.01em]">{brand.name}</span>
              <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">AI Marketing Employee</span>
            </span>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.12 }}
          className="absolute bottom-10 left-10 z-10 max-w-xl text-white xl:bottom-12 xl:left-14 2xl:bottom-16 2xl:left-16"
        >
          <div className="mb-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
            <span className="h-px w-8 bg-brand" />
            {zh ? "发现机会 推动增长" : "Find opportunities. Move growth forward."}
          </div>
          <h2 className="whitespace-nowrap text-[clamp(2.25rem,3.25vw,3.75rem)] font-semibold leading-[1.03] tracking-[-0.05em]">
            {zh ? "让增长任务自己向前走" : "Put your next growth move in motion"}
          </h2>
          <p className="mt-4 whitespace-nowrap text-sm font-normal leading-6 text-white/62 xl:text-[15px] xl:leading-7">
            {zh
              ? "发现机会 准备执行 追踪结果 你只需确认关键动作"
              : "Find the opportunity, prepare the work, and track what happens next"}
          </p>
        </motion.div>
      </aside>

      {/* ===================== 右侧 · 功能表单 ===================== */}
      <section className="relative flex min-h-[100svh] w-full items-center justify-center bg-bg px-5 pb-10 pt-28 sm:px-8 lg:min-h-0 lg:overflow-y-auto lg:px-12 lg:py-20 xl:px-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(circle_at_50%_48%,rgb(var(--action)/0.065),transparent_34%),radial-gradient(circle_at_48%_82%,rgb(var(--brand)/0.035),transparent_30%)] lg:block"
        />
        <motion.div
          aria-hidden
          className="absolute inset-x-0 top-0 h-64 bg-[url('/brand/finfold-login-hero-v2.webp')] bg-cover bg-[62%_center] lg:hidden"
          animate={{ scale: [1.01, 1.04, 1.01] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-black/25 via-black/20 to-bg lg:hidden" />

        <div className="absolute inset-x-5 top-5 z-20 flex items-center justify-between sm:inset-x-8 lg:left-auto lg:right-8 lg:top-7">
          <Link href={zh ? "/" : "/en"} className="flex items-center gap-2.5 rounded-xl p-1.5 text-white lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg ring-1 ring-white/20">
              <FishLogo variant="app-icon" className="h-9 w-9 object-cover" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-[-0.01em]">{brand.name}</span>
              <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-[0.16em] text-white/50">AI Marketing Employee</span>
            </span>
          </Link>
          <div className="flex items-center gap-1.5">
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </div>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.62, delay: 0.1 }}
          data-login-panel=""
          className="relative z-10 w-full max-w-[440px] overflow-hidden rounded-[22px] border border-hairline bg-surface/82 p-5 shadow-[0_28px_90px_-48px_rgb(0_0_0/0.92),inset_0_1px_0_rgb(255_255_255/0.055)] backdrop-blur-2xl sm:p-8 dark:border-white/[0.09] dark:bg-[rgb(8_10_12/0.62)] lg:p-8 xl:p-9"
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
          <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.045em] text-fg sm:text-[2.35rem]">
            {isLogin ? (zh ? "欢迎回来" : "Welcome back") : (zh ? "创建你的工作台" : "Create your workspace")}
          </h1>
          <p className="mt-3 text-pretty text-sm font-normal leading-6 text-fg-muted sm:whitespace-nowrap">
            {isLogin
              ? zh
                ? "继续你的增长任务 查看 Finfold 已经准备好的下一步"
                : "Continue your growth missions and review the next prepared action"
              : zh
                ? "免费开始 让 Finfold 先为你的业务找一个增长机会"
                : "Start free and let Finfold find the first growth opportunity"}
          </p>

          {selectedPlan ? (
            <div className="mt-5 rounded-xl border border-brand/30 bg-brand/[0.08] p-4" data-testid="auth-plan-intent">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand">
                {zh ? "已保留你的选择" : "Your selection is saved"}
              </p>
              <div className="mt-2 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-fg">{getLocalizedPlanCopy(selectedPlan, locale).name}</p>
                  <p className="mt-1 text-xs leading-5 text-fg-muted">
                    {selectedPlan === "starter"
                      ? zh
                        ? "登录后回到结账，不需要重新选择套餐。"
                        : "After sign-in, you’ll return to checkout without choosing again."
                      : zh
                        ? "登录后继续完成开通。"
                        : "After sign-in, you’ll continue activation."}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-black text-brand">
                  {formatPlanPrice(PRICING_PLANS[selectedPlan], marketForLocale(locale))}
                  <span className="font-medium text-fg-muted">/{zh ? "月" : "mo"}</span>
                </span>
              </div>
            </div>
          ) : null}

          {!isLogin && referralOffer ? (
            <div className={`mt-5 flex items-start gap-3 rounded-xl border p-3.5 ${
              referralOffer === "valid"
                ? "border-brand/30 bg-brand/10"
                : "border-warn/30 bg-warn/10"
            }`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                referralOffer === "valid" ? "bg-brand/15 text-brand" : "bg-warn/15 text-warn"
              }`}>
                <Gift className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-fg">
                  {referralOffer === "valid"
                    ? zh ? "好友送你 100 创作点数" : "A friend sent you 100 Credits"
                    : zh ? "这个邀请链接已失效" : "This invite link is no longer valid"}
                </p>
                <p className="mt-1 text-xs leading-5 text-fg-muted">
                  {referralOffer === "valid"
                    ? zh ? "注册并完成第一次创作后自动到账，有效期 90 天。" : "They unlock automatically after your first creation and stay valid for 90 days."
                    : zh ? "你仍然可以正常注册并获得免费版创作点数。" : "You can still sign up normally and receive the free plan Credits."}
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void signInWithOAuth("google")}
                disabled={busy}
                aria-label={zh ? `使用 Google ${isLogin ? "登录" : "注册"}` : `${isLogin ? "Sign in" : "Sign up"} with Google`}
                className="focus-ring flex min-h-11 items-center justify-center gap-2.5 rounded-lg border border-hairline bg-bg/35 px-3 py-2.5 text-sm font-semibold text-fg transition-all hover:-translate-y-0.5 hover:border-action/45 hover:bg-action/[0.04] disabled:translate-y-0 disabled:opacity-60"
              >
                <GoogleIcon className="h-4 w-4" />
                Google
              </button>
              <button
                type="button"
                onClick={() => void signInWithOAuth("github")}
                disabled={busy}
                aria-label={zh ? `使用 GitHub ${isLogin ? "登录" : "注册"}` : `${isLogin ? "Sign in" : "Sign up"} with GitHub`}
                className="focus-ring flex min-h-11 items-center justify-center gap-2.5 rounded-lg border border-hairline bg-bg/35 px-3 py-2.5 text-sm font-semibold text-fg transition-all hover:-translate-y-0.5 hover:border-action/45 hover:bg-action/[0.04] disabled:translate-y-0 disabled:opacity-60"
              >
                <GitHubIcon className="h-4 w-4" />
                GitHub
              </button>
            </div>

            {/* 方式切换：邮箱 / 手机号（手机号入口由 PHONE_AUTH_ENABLED 控制） */}
            {PHONE_AUTH_ENABLED ? (
              <div role="tablist" className="grid grid-cols-2 gap-1 rounded-lg border border-hairline bg-surface p-1 text-sm font-semibold">
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMethod === "email"}
                  onClick={() => switchMethod("email")}
                  className={`focus-ring rounded-md px-3 py-1.5 transition-colors ${
                    authMethod === "email" ? "bg-action/[0.12] text-action-strong dark:text-action" : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {zh ? "邮箱" : "Email"}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMethod === "phone"}
                  onClick={() => switchMethod("phone")}
                  className={`focus-ring rounded-md px-3 py-1.5 transition-colors ${
                    authMethod === "phone" ? "bg-action/[0.12] text-action-strong dark:text-action" : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {zh ? "手机号" : "Phone"}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-hairline" />
                {zh ? "邮箱登录" : "Continue with email"}
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-hairline" />
              </div>
            )}

            {authMethod === "email" ? (
              <>
                <label className="grid gap-1.5 text-sm font-semibold text-fg">
                  <span>{zh ? "邮箱" : "Email"}</span>
                  <span className="group flex min-h-11 items-center gap-2.5 rounded-lg border border-hairline bg-bg/45 px-3 transition focus-within:border-action/55 focus-within:bg-surface focus-within:shadow-[0_0_0_3px_rgb(var(--action)/0.1)]">
                    <AtSign className="h-4 w-4 shrink-0 text-fg-muted transition-colors group-focus-within:text-action-strong dark:group-focus-within:text-action" />
                    <input
                      type="email"
                      data-testid="auth-email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void submit()}
                      className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm font-normal text-fg outline-none placeholder:text-fg-muted"
                      placeholder="your@email.com"
                      autoComplete="email"
                    />
                  </span>
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-fg">
                  <span>{zh ? "密码" : "Password"}</span>
                  <span className="group flex min-h-11 items-center gap-2.5 rounded-lg border border-hairline bg-bg/45 px-3 transition focus-within:border-action/55 focus-within:bg-surface focus-within:shadow-[0_0_0_3px_rgb(var(--action)/0.1)]">
                    <Lock className="h-4 w-4 shrink-0 text-fg-muted transition-colors group-focus-within:text-action-strong dark:group-focus-within:text-action" />
                    <input
                      type="password"
                      data-testid="auth-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void submit()}
                      className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm font-normal text-fg outline-none placeholder:text-fg-muted"
                      placeholder={
                        isLogin
                          ? zh ? "输入密码" : "Enter your password"
                          : zh ? "至少 8 位，含字母和数字" : "8+ chars, letters & numbers"
                      }
                      autoComplete={isLogin ? "current-password" : "new-password"}
                    />
                  </span>
                </label>

                {/* 注册态：密码强度指示器 + 规则清单 */}
                {!isLogin && password.length > 0 ? (
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
              </>
            ) : (
              <>
                {/* 手机号：区号 + 号码 */}
                <div className="grid gap-1.5 text-sm font-medium text-fg">
                  <span>{zh ? "手机号" : "Phone number"}</span>
                  <div className="flex gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      aria-label={zh ? "国家区号" : "Country code"}
                      className="focus-ring panel-inset rounded-lg px-2.5 py-2.5 text-sm text-fg"
                    >
                      {COUNTRY_CODES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {zh ? c.zh : c.en} {c.code}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="focus-ring panel-inset min-w-0 flex-1 rounded-lg px-3 py-2.5 text-fg placeholder:text-fg-muted"
                      placeholder={zh ? "请输入手机号" : "Enter phone number"}
                      autoComplete="tel-national"
                    />
                  </div>
                </div>

                {/* 验证码 + 获取按钮 */}
                <div className="grid gap-1.5 text-sm font-medium text-fg">
                  <span>{zh ? "短信验证码" : "SMS code"}</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={phoneCode}
                      onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => e.key === "Enter" && void submitPhone()}
                      className="focus-ring panel-inset min-w-0 flex-1 rounded-lg px-3 py-2.5 text-fg tracking-[0.3em] placeholder:tracking-normal placeholder:text-fg-muted"
                      placeholder={zh ? "6 位验证码" : "6-digit code"}
                      autoComplete="one-time-code"
                    />
                    <button
                      type="button"
                      onClick={() => void sendPhoneOtp()}
                      disabled={countdown > 0 || otpLoading || !phone}
                      className="focus-ring shrink-0 rounded-lg border border-action/40 bg-action/[0.1] px-3 py-2.5 text-sm font-semibold text-action-strong transition-colors hover:bg-action/[0.16] disabled:cursor-not-allowed disabled:opacity-50 dark:text-action"
                    >
                      {otpLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : countdown > 0 ? (
                        `${countdown}s`
                      ) : otpSent ? (
                        zh ? "重新获取" : "Resend"
                      ) : (
                        zh ? "获取验证码" : "Send code"
                      )}
                    </button>
                  </div>
                  {zh ? (
                    <span className="text-xs text-fg-muted">未注册的手机号将自动创建账号。</span>
                  ) : (
                    <span className="text-xs text-fg-muted">New phone numbers create an account automatically.</span>
                  )}
                </div>
              </>
            )}

            {status ? (
              <p
                className={`rounded-lg border px-3 py-2.5 text-sm ${
                  status.includes("成功") || status.includes("successful")
                    ? "border-positive/30 bg-positive/10 text-positive"
                    : "border-risk/30 bg-risk/10 text-risk"
                }`}
              >
                {status}
              </p>
            ) : null}

            <button
              type="button"
              data-testid="auth-submit"
              onClick={() => void (authMethod === "phone" ? submitPhone() : submit())}
              disabled={authMethod === "phone" ? busy : (isLoading || (!isLogin && !pwdResult.valid))}
              className="focus-ring group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-action/60 bg-action px-4 py-2.5 text-sm font-bold text-on-action shadow-[0_14px_34px_-16px_rgb(var(--action)/0.8)] transition-all hover:-translate-y-0.5 hover:bg-action-strong hover:shadow-[0_18px_40px_-14px_rgb(var(--action)/0.72)] active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {isLoading || otpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {authMethod === "phone"
                ? zh ? "登录 / 注册" : "Continue"
                : isLogin ? (zh ? "登录" : "Sign in") : (zh ? "注册" : "Sign up")}{" "}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>

            <Link href="/workbench" className="focus-ring group flex items-center justify-center gap-2 rounded-lg py-1 text-center text-sm font-semibold text-fg-muted transition-colors hover:text-action-strong dark:hover:text-action">
              {zh ? "先查看创作台（高级模式）" : "Preview Studio (advanced)"}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <p className="mt-5 border-t border-hairline pt-5 text-center text-sm text-fg-muted">
            {isLogin ? (zh ? "还没有账号？" : "Don't have an account?") : zh ? "已有账号？" : "Already have an account?"}{" "}
            <Link href={buildAuthHref(isLogin ? "/signup" : "/login", safeReturnTo)} className="focus-ring rounded-sm font-bold text-fg transition-colors hover:text-action-strong dark:hover:text-action">
              {isLogin ? (zh ? "立即注册" : "Sign up") : zh ? "直接登录" : "Sign in"}
            </Link>
          </p>
        </motion.section>
      </section>
    </main>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.3-5.6l-6.6-5.6C29.6 34.6 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.6 5.6C41.4 36.3 44 30.6 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.02 11.02 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
    </svg>
  );
}
