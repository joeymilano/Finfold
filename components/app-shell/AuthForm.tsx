"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { brand } from "@/lib/brand";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";
import { useLocale } from "@/hooks/useLocale";

type AuthFormProps = {
  mode: "login" | "signup";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isLogin = mode === "login";
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  async function signInWithGoogle() {
    if (!supabaseConfigured) {
      setStatus(locale === "en" ? "Auth system not configured. You can still generate a free preview in the Workbench." : "登录系统暂未配置。你仍可以在工作台生成一次免费预览。");
      return;
    }

    setIsLoading(true);
    setStatus(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });
      if (error) throw error;
      // Browser redirects to Google; no further action needed here.
    } catch (error) {
      const msg = error instanceof Error ? error.message : (locale === "en" ? "Google sign-in failed, please retry." : "Google 登录失败，请重试。");
      setStatus(msg);
      setIsLoading(false);
    }
  }

  async function submit() {
    if (!email || !password) {
      setStatus(locale === "en" ? "Please fill in your email and password." : "请填写邮箱和密码。");
      return;
    }

    setIsLoading(true);
    setStatus(null);

    try {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        setStatus(locale === "en" ? "Auth system not configured. You can still generate a free preview in the Workbench." : "登录系统暂未配置。你仍可以在工作台生成一次免费预览。");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const result = isLogin
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

      if (result.error) {
        throw result.error;
      }

      if (!isLogin && !result.data.session) {
        setStatus(locale === "en" ? "Sign up successful! Check your inbox and click the confirmation link to log in." : "注册成功，请检查邮箱并点击确认链接后再登录。");
        return;
      }

      router.push("/dashboard");
    } catch (error) {
      const msg = error instanceof Error ? error.message : (locale === "en" ? "Action failed, please retry." : "操作失败，请重试。");
      const translated = locale === "en"
        ? (msg.includes("Invalid login credentials") ? "Incorrect email or password, please retry." :
           msg.includes("Email not confirmed") ? "Email not verified — check your inbox." :
           msg.includes("User already registered") ? "This email is already registered. Please log in instead." :
           msg.includes("Password should be at least") ? "Password must be at least 6 characters." :
           msg)
        : (msg.includes("Invalid login credentials") ? "邮箱或密码不正确，请重试。" :
           msg.includes("Email not confirmed") ? "邮箱尚未验证，请检查收件箱。" :
           msg.includes("User already registered") ? "该邮箱已注册，请直接登录。" :
           msg.includes("Password should be at least") ? "密码至少需要 6 位。" :
           msg);
      setStatus(translated);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-5 py-10">
      <section className="panel w-full max-w-md p-7 shadow-raised">
        <Link href="/dashboard" className="mb-8 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-brand shadow-glow-brand">
            <FishLogo variant="app-icon" className="h-11 w-11 object-cover" />
          </span>
          <span className="leading-none">
            <span className="block text-base font-semibold text-fg">{brand.name}</span>
            <span className="brand-cn mt-1 block text-[12px] text-fg-muted">{brand.chineseName}</span>
          </span>
        </Link>

        <h1 className="text-2xl font-semibold text-fg">
          {isLogin ? (locale === "en" ? "Sign in" : "登录账号") : (locale === "en" ? "Create account" : "创建账号")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-fg-muted">
          {isLogin
            ? (locale === "en" ? "Sign in to save content kits, view usage history, and upgrade as needed." : "登录后可保存历史内容包、查看使用记录并按需升级。")
            : (locale === "en" ? "Sign up to save content kits, access history across devices, and upgrade when growth starts paying off." : "注册后可保存内容包、跨设备访问历史，并在增长开始回报时升级。")}
        </p>

        <div className="mt-6 grid gap-4">
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            disabled={isLoading}
            className="focus-ring flex items-center justify-center gap-2.5 rounded-lg border border-hairline bg-surface px-3 py-2.5 text-sm font-semibold text-fg transition-colors hover:border-brand/50 disabled:opacity-60"
          >
            <GoogleIcon className="h-4 w-4" />
            {locale === "en" ? `${isLogin ? "Sign in" : "Sign up"} with Google` : `使用 Google ${isLogin ? "登录" : "注册"}`}
          </button>

          <div className="flex items-center gap-3 text-xs text-fg-muted">
            <span className="h-px flex-1 bg-hairline" />
            {locale === "en" ? "or use email" : "或使用邮箱"}
            <span className="h-px flex-1 bg-hairline" />
          </div>

          <label className="grid gap-1.5 text-sm font-medium text-fg">
            {locale === "en" ? "Email" : "邮箱"}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              className="focus-ring panel-inset rounded-lg px-3 py-2.5 text-fg placeholder:text-fg-muted"
              placeholder="your@email.com"
              autoComplete="email"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-fg">
            {locale === "en" ? "Password" : "密码"}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              className="focus-ring panel-inset rounded-lg px-3 py-2.5 text-fg placeholder:text-fg-muted"
              placeholder={locale === "en" ? "At least 6 characters" : "至少 6 位"}
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
          </label>

          {status ? (
            <p className="rounded-lg border border-risk/30 bg-risk/10 px-3 py-2.5 text-sm text-risk">
              {status}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={isLoading}
            className="btn-primary focus-ring disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isLogin ? (locale === "en" ? "Sign in" : "登录") : (locale === "en" ? "Sign up" : "注册")} <ArrowRight className="h-4 w-4" />
          </button>

          <Link href="/dashboard" className="text-center text-sm font-semibold text-brand hover:text-brand-strong">
            {locale === "en" ? "Try a free generation first" : "先体验一次免费生成"}
          </Link>
        </div>

        <p className="mt-6 text-center text-sm text-fg-muted">
          {isLogin ? (locale === "en" ? "Don't have an account?" : "还没有账号？") : (locale === "en" ? "Already have an account?" : "已有账号？")}{" "}
          <Link
            href={isLogin ? "/signup" : "/login"}
            className="font-semibold text-fg hover:text-brand"
          >
            {isLogin ? (locale === "en" ? "Sign up" : "立即注册") : (locale === "en" ? "Sign in" : "直接登录")}
          </Link>
        </p>
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
