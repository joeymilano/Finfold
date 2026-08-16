"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, CheckCircle2, Gift, Link2, Loader2, Lock, LogOut, Mail, PlugZap, RefreshCw, Shield, Unlink, UserRound } from "@/components/ui/icons";
import { useLocale } from "@/hooks/useLocale";
import { analyzePassword } from "@/lib/password-policy";

type UserInfo = { email: string; plan: string; avatarUrl: string | null; userId: string } | null;
type SocialConnectionAccount = {
  id: string;
  connectionId: string;
  externalAccountId: string;
  accountType: "profile" | "page" | "organization";
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isSelected: boolean;
  updatedAt: string;
};
type SocialConnection = {
  id: string;
  connectorId: string;
  status: string;
  accounts: SocialConnectionAccount[];
};

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
 * Manual X (Twitter) URL metrics via legacy bearer token — feature flag.
 *
 * Hidden by default: an app-only bearer token can only reach low-value
 * public engagement (likes/replies/reposts). The metrics that actually
 * matter (impressions/reach/clicks) require paid user-context OAuth,
 * which Finfold does not configure today. Flip to true to restore the card.
 */
const MANUAL_X_METRICS_ENABLED = false;

/**
 * SettingsPage — manage avatar, email, password, and session.
 *
 * All privileged Supabase operations (password update, email update,
 * avatar upload + user metadata update) are routed through backend API
 * routes so that the secret service-role key is never exposed to the
 * browser. The Supabase browser client (publishable key only) is used
 * solely for listening to auth state changes.
 */
export default function SettingsPage() {
  const router = useRouter();
  const locale = useLocale();
  const [user, setUser] = useState<UserInfo>(null);
  const [mounted, setMounted] = useState(false);

  // Avatar
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Email
  const [newEmail, setNewEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwStatus, setPwStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  // Activation / coupon code
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemStatus, setRedeemStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [redeemLoading, setRedeemLoading] = useState(false);

  // X (Twitter) API integration
  const [xConnected, setXConnected] = useState(false);
  const [xTokenTail, setXTokenTail] = useState<string | null>(null);
  const [xTokenInput, setXTokenInput] = useState("");
  const [xStatus, setXStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [xLoading, setXLoading] = useState(false);

  // X OAuth connection: an account identity connection that is deliberately
  // separate from the legacy bearer token used for manual-URL metrics.
  const [xSocialConnection, setXSocialConnection] = useState<SocialConnection | null>(null);
  const [xOAuthAvailable, setXOAuthAvailable] = useState(false);
  const [linkedinSocialConnection, setLinkedinSocialConnection] = useState<SocialConnection | null>(null);
  const [linkedinOAuthAvailable, setLinkedinOAuthAvailable] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialAction, setSocialAction] = useState<string | null>(null);
  const [socialStatus, setSocialStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    let cleanup: (() => void) | undefined;

    async function loadUser() {
      try {
        // Fetch user data from the backend API route
        const res = await fetch("/api/auth/user", { cache: "no-store" });
        const data = await res.json();
        if (!data.user) {
          router.replace("/login");
          return;
        }
        setUser({
          email: data.user.email ?? "",
          plan: data.user.plan ?? "free",
          avatarUrl: data.user.avatarUrl ?? null,
          userId: data.user.id,
        });
        setAvatarPreview(data.user.avatarUrl ?? null);
      } catch {
        router.replace("/login");
      }
    }

    void loadUser();

    // Use the Supabase browser client (publishable key only) to listen
    // for auth state changes and trigger a re-fetch from the backend.
    import("@/lib/supabase-client").then(({ createSupabaseBrowserClient }) => {
      const supabase = createSupabaseBrowserClient();

      const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
        void loadUser();
      });

      function onVisibilityChange() {
        if (document.visibilityState === "visible") {
          void loadUser();
        }
      }

      function onWindowFocus() {
        void loadUser();
      }

      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("focus", onWindowFocus);

      cleanup = () => {
        subscription.unsubscribe();
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("focus", onWindowFocus);
      };
    });

    return () => {
      cleanup?.();
    };
  }, [router]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    fetch("/api/settings/integrations", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { x?: { connected: boolean; tokenTail: string | null } } | null) => {
        if (data?.x) {
          setXConnected(data.x.connected);
          setXTokenTail(data.x.tokenTail);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    let active = true;
    setSocialLoading(true);

    fetch("/api/settings/social-connections", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json() as {
          connections?: SocialConnection[];
          oauthConnectors?: { x?: boolean; linkedin?: boolean };
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Could not load social connections.");
        if (!active) return;

        setXSocialConnection(data.connections?.find((connection) => connection.connectorId === "x") ?? null);
        setXOAuthAvailable(data.oauthConnectors?.x === true);
        setLinkedinSocialConnection(data.connections?.find((connection) => connection.connectorId === "linkedin") ?? null);
        setLinkedinOAuthAvailable(data.oauthConnectors?.linkedin === true);
        const query = new URLSearchParams(window.location.search);
        if (query.get("social_connection") === "x") {
          const status = query.get("social_status");
          const messages = locale === "en"
            ? {
                connected: { ok: true, msg: "X authorization completed. Your profile is ready to synchronize." },
                denied: { ok: false, msg: "X authorization was cancelled." },
                expired: { ok: false, msg: "The X authorization link expired. Start again." },
                failed: { ok: false, msg: "X authorization could not be completed." },
                unavailable: { ok: false, msg: "X authorization is not configured in this environment." }
              }
            : {
                connected: { ok: true, msg: "X 授权已完成，账号资料可以同步。" },
                denied: { ok: false, msg: "已取消 X 授权。" },
                expired: { ok: false, msg: "X 授权链接已过期，请重新开始。" },
                failed: { ok: false, msg: "无法完成 X 授权。" },
                unavailable: { ok: false, msg: "此环境尚未配置 X 授权。" }
              };
          if (status && status in messages) setSocialStatus(messages[status as keyof typeof messages]);
        }
      })
      .catch((error) => {
        if (active) {
          setSocialStatus({
            ok: false,
            msg: error instanceof Error ? error.message : (locale === "en" ? "Could not load social connections." : "无法加载社交账号。")
          });
        }
      })
      .finally(() => {
        if (active) setSocialLoading(false);
      });

    return () => { active = false; };
  }, [locale]);

  async function uploadAvatar(file: File) {
    if (!user) return;
    if (file.size > 2 * 1024 * 1024) {
      setAvatarStatus({ ok: false, msg: locale === "en" ? "Image must be under 2MB." : "图片不能超过 2MB。" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      setAvatarStatus({ ok: false, msg: locale === "en" ? "Please select an image file (JPG / PNG / WebP)." : "请选择图片文件（JPG / PNG / WebP）。" });
      return;
    }

    setAvatarLoading(true);
    setAvatarStatus(null);

    // Local preview immediately
    const localUrl = URL.createObjectURL(file);
    setAvatarPreview(localUrl);

    try {
      // Upload avatar via backend API route
      const formData = new FormData();
      formData.append("file", file);
      formData.append("userId", user.userId);

      const res = await fetch("/api/auth/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      const publicUrl = data.avatarUrl;
      setAvatarPreview(publicUrl);
      setUser((u) => u ? { ...u, avatarUrl: publicUrl } : u);
      setAvatarStatus({ ok: true, msg: locale === "en" ? "Avatar updated." : "头像已更新。" });

      // Notify sidebar to refresh
      window.dispatchEvent(new Event("finfold-avatar-change"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : (locale === "en" ? "Upload failed, please retry." : "上传失败，请重试。");
      const friendly = msg.includes("Bucket not found") || msg.includes("bucket")
        ? (locale === "en" ? "Please create a public 'avatars' bucket in Supabase → Storage first." : "请先在 Supabase → Storage 创建名为 avatars 的公开 Bucket，再上传头像。")
        : msg;
      setAvatarStatus({ ok: false, msg: friendly });
      setAvatarPreview(user.avatarUrl);
    } finally {
      setAvatarLoading(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadAvatar(file);
    // reset so same file can be re-selected
    e.target.value = "";
  }

  async function updateEmail() {
    if (!newEmail.trim()) { setEmailStatus({ ok: false, msg: locale === "en" ? "Please enter a new email address." : "请输入新邮箱地址。" }); return; }
    setEmailLoading(true);
    setEmailStatus(null);
    try {
      // Route through backend API to keep secret key server-side
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Update failed.");
      }
      setEmailStatus({ ok: true, msg: locale === "en" ? "Confirmation email sent. Click the link in your new inbox to confirm." : "确认邮件已发送，请在新邮箱中点击确认链接后生效。" });
      setNewEmail("");
    } catch (err) {
      setEmailStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? "Update failed, please retry." : "更新失败，请重试。") });
    } finally {
      setEmailLoading(false);
    }
  }

  async function updatePassword() {
    const pwdResult = analyzePassword(newPassword);
    if (!pwdResult.valid) { setPwStatus({ ok: false, msg: locale === "en" ? (pwdResult.messageEn || "Password does not meet requirements.") : `密码不满足要求：${pwdResult.messageZh}。` }); return; }
    if (newPassword !== confirmPassword) { setPwStatus({ ok: false, msg: locale === "en" ? "Passwords do not match." : "两次密码不一致。" }); return; }
    setPwLoading(true);
    setPwStatus(null);
    try {
      // Route through backend API to keep secret key server-side
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Update failed.");
      }
      setPwStatus({ ok: true, msg: locale === "en" ? "Password updated successfully." : "密码已更新成功。" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPwStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? "Update failed, please retry." : "更新失败，请重试。") });
    } finally {
      setPwLoading(false);
    }
  }

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

  async function connectX() {
    const token = xTokenInput.trim();
    if (!token) { setXStatus({ ok: false, msg: locale === "en" ? "Paste your X API bearer token first." : "请先粘贴你的 X API bearer token。" }); return; }
    setXLoading(true);
    setXStatus(null);
    try {
      const res = await fetch("/api/settings/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xBearerToken: token }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (locale === "en" ? "Could not connect." : "连接失败。"));
      }
      setXConnected(true);
      setXTokenTail(data.x?.tokenTail ?? null);
      setXTokenInput("");
      setXStatus({ ok: true, msg: locale === "en" ? "X account connected." : "已连接 X 账号。" });
    } catch (err) {
      setXStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? "Could not connect." : "连接失败。") });
    } finally {
      setXLoading(false);
    }
  }

  async function disconnectX() {
    setXLoading(true);
    setXStatus(null);
    try {
      const res = await fetch("/api/settings/integrations", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || (locale === "en" ? "Could not disconnect." : "断开失败。"));
      }
      setXConnected(false);
      setXTokenTail(null);
      setXStatus({ ok: true, msg: locale === "en" ? "X account disconnected." : "已断开 X 账号连接。" });
    } catch (err) {
      setXStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? "Could not disconnect." : "断开失败。") });
    } finally {
      setXLoading(false);
    }
  }

  async function connectXSocialAccount() {
    setSocialAction("connect");
    setSocialStatus(null);
    try {
      const res = await fetch("/api/settings/social-connections/x/authorize", { method: "POST" });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || (locale === "en" ? "Could not start X authorization." : "无法开始 X 授权。"));
      }
      window.location.assign(data.url);
    } catch (err) {
      setSocialStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? "Could not start X authorization." : "无法开始 X 授权。") });
      setSocialAction(null);
    }
  }

  async function connectLinkedInSocialAccount() {
    setSocialAction("li-connect");
    setSocialStatus(null);
    try {
      const res = await fetch("/api/settings/social-connections/linkedin/authorize", { method: "POST" });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || (locale === "en" ? "Could not start LinkedIn authorization." : "无法开始 LinkedIn 授权。"));
      }
      window.location.assign(data.url);
    } catch (err) {
      setSocialStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? "Could not start LinkedIn authorization." : "无法开始 LinkedIn 授权。") });
      setSocialAction(null);
    }
  }

  async function syncLinkedInSocialAccount() {
    setSocialAction("li-sync");
    setSocialStatus(null);
    try {
      const res = await fetch("/api/settings/social-connections/linkedin/accounts/refresh", { method: "POST" });
      const data = await res.json() as { accounts?: SocialConnectionAccount[]; error?: string };
      if (!res.ok || !data.accounts) {
        throw new Error(data.error || (locale === "en" ? "Could not synchronize the LinkedIn profile." : "无法同步 LinkedIn 账号资料。"));
      }
      setLinkedinSocialConnection((connection) => connection ? { ...connection, accounts: data.accounts ?? connection.accounts } : connection);
      setSocialStatus({ ok: true, msg: locale === "en" ? "LinkedIn profile synchronized." : "LinkedIn 账号资料已同步。" });
    } catch (err) {
      setSocialStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? "Could not synchronize the LinkedIn profile." : "无法同步 LinkedIn 账号资料。") });
    } finally {
      setSocialAction(null);
    }
  }

  async function disconnectLinkedInSocialAccount() {
    setSocialAction("li-disconnect");
    setSocialStatus(null);
    try {
      const res = await fetch("/api/settings/social-connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId: "linkedin" })
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || (locale === "en" ? "Could not disconnect the LinkedIn account." : "无法断开 LinkedIn 账号。"));
      }
      setLinkedinSocialConnection(null);
      setSocialStatus({ ok: true, msg: locale === "en" ? "LinkedIn account disconnected." : "已断开 LinkedIn 账号连接。" });
    } catch (err) {
      setSocialStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? "Could not disconnect the LinkedIn account." : "无法断开 LinkedIn 账号。") });
    } finally {
      setSocialAction(null);
    }
  }

  async function syncXSocialAccount() {
    setSocialAction("sync");
    setSocialStatus(null);
    try {
      const res = await fetch("/api/settings/social-connections/x/accounts/refresh", { method: "POST" });
      const data = await res.json() as { accounts?: SocialConnectionAccount[]; error?: string };
      if (!res.ok || !data.accounts) {
        throw new Error(data.error || (locale === "en" ? "Could not synchronize the X profile." : "无法同步 X 账号资料。"));
      }
      setXSocialConnection((connection) => connection ? { ...connection, accounts: data.accounts ?? connection.accounts } : connection);
      setSocialStatus({ ok: true, msg: locale === "en" ? "X profile synchronized." : "X 账号资料已同步。" });
    } catch (err) {
      setSocialStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? "Could not synchronize the X profile." : "无法同步 X 账号资料。") });
    } finally {
      setSocialAction(null);
    }
  }

  async function selectXSocialAccount(account: SocialConnectionAccount) {
    if (!xSocialConnection) return;
    setSocialAction(`select-${account.id}`);
    setSocialStatus(null);
    try {
      const res = await fetch(`/api/settings/social-connections/x/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: xSocialConnection.id })
      });
      const data = await res.json() as { account?: SocialConnectionAccount; error?: string };
      if (!res.ok || !data.account) {
        throw new Error(data.error || (locale === "en" ? "Could not select the X account." : "无法选择 X 账号。"));
      }
      setXSocialConnection((connection) => connection ? {
        ...connection,
        accounts: connection.accounts.map((current) => ({ ...current, isSelected: current.id === data.account?.id }))
      } : connection);
      setSocialStatus({ ok: true, msg: locale === "en" ? "X account selected." : "已选择 X 账号。" });
    } catch (err) {
      setSocialStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? "Could not select the X account." : "无法选择 X 账号。") });
    } finally {
      setSocialAction(null);
    }
  }

  async function disconnectXSocialAccount() {
    setSocialAction("disconnect");
    setSocialStatus(null);
    try {
      const res = await fetch("/api/settings/social-connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId: "x" })
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || (locale === "en" ? "Could not disconnect the X account." : "无法断开 X 账号。"));
      }
      setXSocialConnection(null);
      setSocialStatus({ ok: true, msg: locale === "en" ? "X account disconnected from Finfold." : "已从 Finfold 断开 X 账号。" });
    } catch (err) {
      setSocialStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? "Could not disconnect the X account." : "无法断开 X 账号。") });
    } finally {
      setSocialAction(null);
    }
  }

  async function logout() {
    setLogoutLoading(true);
    try {
      // Route through backend API to keep secret key server-side
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
    } finally {
      setLogoutLoading(false);
    }
  }

  if (!mounted || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-fg-muted" />
      </div>
    );
  }

  const initial = (user.email[0] ?? "?").toUpperCase();

  return (
    <div className="mx-auto max-w-2xl grid gap-6 pb-10">
      <div className="border-b border-hairline pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{locale === "en" ? "Account" : "账号"}</p>
        <h1 className="mt-1.5 text-3xl font-bold text-fg">{locale === "en" ? "Account Settings" : "账号设置"}</h1>
        <p className="mt-2 text-sm text-fg-muted">{locale === "en" ? "Manage your avatar, login email, password, and account security." : "管理你的头像、登录邮箱、密码和账号安全。"}</p>
      </div>

      {/* Avatar + account info */}
      <section className="panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Shield className="h-4 w-4 text-action-strong dark:text-action" />
          {locale === "en" ? "Account Info" : "账号信息"}
        </div>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          {/* Avatar with upload overlay */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarLoading}
              className="focus-ring group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-brand shadow-glow-brand"
              title={locale === "en" ? "Click to change avatar" : "点击更换头像"}
            >
              {avatarPreview ? (
                <Image
                  src={avatarPreview}
                  alt="Avatar"
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-2xl font-bold text-white">{initial}</span>
              )}
              {/* Hover overlay */}
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                {avatarLoading
                  ? <Loader2 className="h-5 w-5 animate-spin text-white" />
                  : <Camera className="h-5 w-5 text-white" />}
                {!avatarLoading && <span className="text-[10px] font-semibold text-white">{locale === "en" ? "Change" : "更换"}</span>}
              </span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={onFileChange}
            />
          </div>

          {/* Email + plan */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <p className="text-base font-semibold text-fg truncate">{user.email}</p>
            <p className="mt-0.5 text-sm text-fg-muted">
              {locale === "en" ? "Current plan:" : "当前套餐："}{(locale === "en" ? planLabelEn : planLabelZh)[user.plan] ?? user.plan}
            </p>
            <p className="mt-2 text-xs text-fg-muted">
              {locale === "en" ? "Click avatar to upload a new image. JPG / PNG / WebP, max 2MB." : "点击头像可上传新图片，支持 JPG / PNG / WebP，最大 2MB。"}
            </p>
          </div>
        </div>

        {avatarStatus ? (
          <p className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${avatarStatus.ok ? "border border-positive/30 bg-positive/10 text-positive" : "border border-risk/30 bg-risk/10 text-risk"}`}>
            {avatarStatus.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
            {avatarStatus.msg}
          </p>
        ) : null}
      </section>

      {/* Change email */}
      <section className="panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Mail className="h-4 w-4 text-action-strong dark:text-action" />
          {locale === "en" ? "Change Email" : "修改邮箱"}
        </div>
        <p className="text-xs text-fg-muted">{locale === "en" ? "Enter a new email address and we'll send a confirmation link to it." : "输入新邮箱后，我们会向新地址发送一封确认邮件，点击后生效。"}</p>
        <label className="grid gap-1.5 text-sm font-medium text-fg">
          {locale === "en" ? "New email address" : "新邮箱地址"}
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void updateEmail()}
            className="focus-ring panel-inset rounded-lg px-3 py-2.5 text-fg placeholder:text-fg-muted"
            placeholder="new@example.com"
          />
        </label>
        {emailStatus ? (
          <p className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${emailStatus.ok ? "border border-positive/30 bg-positive/10 text-positive" : "border border-risk/30 bg-risk/10 text-risk"}`}>
            {emailStatus.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
            {emailStatus.msg}
          </p>
        ) : null}
        <button type="button" onClick={() => void updateEmail()} disabled={emailLoading} className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2.5 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] disabled:opacity-60 dark:text-action">
          {emailLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {locale === "en" ? "Send confirmation email" : "发送确认邮件"} <ArrowRight className="h-4 w-4" />
        </button>
      </section>

      {/* Change password */}
      <section className="panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Lock className="h-4 w-4 text-action-strong dark:text-action" />
          {locale === "en" ? "Change Password" : "修改密码"}
        </div>
        <p className="text-xs text-fg-muted">{locale === "en" ? "At least 8 characters with letters and numbers. If you signed up via Google, you can set a password here to also enable email login." : "密码至少 8 位，需含字母和数字。如果你是通过 Google 登录注册的，可以在此设置一个密码以支持邮箱登录。"}</p>
        <label className="grid gap-1.5 text-sm font-medium text-fg">
          {locale === "en" ? "New password" : "新密码"}
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            className="focus-ring panel-inset rounded-lg px-3 py-2.5 text-fg placeholder:text-fg-muted"
            placeholder={locale === "en" ? "8+ chars, letters & numbers" : "至少 8 位，含字母和数字"} autoComplete="new-password" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-fg">
          {locale === "en" ? "Confirm new password" : "确认新密码"}
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void updatePassword()}
            className="focus-ring panel-inset rounded-lg px-3 py-2.5 text-fg placeholder:text-fg-muted"
            placeholder={locale === "en" ? "Enter again" : "再输入一次"} autoComplete="new-password" />
        </label>
        {pwStatus ? (
          <p className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${pwStatus.ok ? "border border-positive/30 bg-positive/10 text-positive" : "border border-risk/30 bg-risk/10 text-risk"}`}>
            {pwStatus.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
            {pwStatus.msg}
          </p>
        ) : null}
        <button type="button" onClick={() => void updatePassword()} disabled={pwLoading} className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2.5 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] disabled:opacity-60 dark:text-action">
          {pwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {locale === "en" ? "Update password" : "更新密码"} <ArrowRight className="h-4 w-4" />
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

      {/* Social account OAuth connection */}
      <section id="social-accounts" className="panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <PlugZap className="h-4 w-4 text-action-strong dark:text-action" />
          {locale === "en" ? "Social Accounts" : "社交账号"}
        </div>
        <p className="text-xs text-fg-muted">
          {locale === "en"
            ? "Connect an account to verify its identity and choose a destination. Automatic publishing, post discovery, and account metrics are not enabled."
            : "连接账号后可验证身份并选择目标账号。自动发布、已发布内容发现和账号指标目前均未启用。"}
        </p>

        {socialLoading ? (
          <div className="flex items-center gap-2 text-sm text-fg-muted" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            {locale === "en" ? "Loading social accounts..." : "正在加载社交账号..."}
          </div>
        ) : xSocialConnection ? (
          <div className="grid gap-3 rounded-lg border border-hairline p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-positive" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg">X / Twitter</p>
                  <p className="text-xs text-fg-muted">{locale === "en" ? "Read-only OAuth connection" : "只读 OAuth 连接"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void disconnectXSocialAccount()}
                disabled={socialAction !== null}
                className="focus-ring inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-risk/25 bg-risk/10 px-3 py-1.5 text-xs font-semibold text-risk disabled:opacity-60"
              >
                {socialAction === "disconnect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                {locale === "en" ? "Disconnect Finfold" : "从 Finfold 断开"}
              </button>
            </div>

            {xSocialConnection.accounts.length > 0 ? (
              <div className="grid gap-2" aria-label={locale === "en" ? "Connected X account" : "已连接的 X 账号"}>
                {xSocialConnection.accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    aria-pressed={account.isSelected}
                    onClick={() => void selectXSocialAccount(account)}
                    disabled={socialAction !== null || account.isSelected}
                    className={`focus-ring flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-left transition disabled:cursor-default ${account.isSelected ? "border-action/55 bg-action/[0.08]" : "border-hairline hover:bg-surface"}`}
                  >
                    <UserRound className={`h-4 w-4 shrink-0 ${account.isSelected ? "text-action-strong dark:text-action" : "text-fg-muted"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{account.displayName ?? account.handle ?? "X account"}</span>
                      {account.handle ? <span className="block truncate text-xs text-fg-muted">{account.handle}</span> : null}
                    </span>
                    {socialAction === `select-${account.id}` ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-fg-muted" /> : null}
                    {account.isSelected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" /> : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-hairline bg-surface px-3 py-2.5 text-xs text-fg-muted">
                {locale === "en" ? "No profile has been synchronized yet." : "尚未同步账号资料。"}
              </p>
            )}

            {xOAuthAvailable ? (
              <button
                type="button"
                onClick={() => void syncXSocialAccount()}
                disabled={socialAction !== null}
                className="focus-ring inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2.5 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] disabled:opacity-60 dark:text-action"
              >
                {socialAction === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {locale === "en" ? "Sync profile" : "同步账号资料"}
              </button>
            ) : null}
          </div>
        ) : xOAuthAvailable ? (
          <button
            type="button"
            onClick={() => void connectXSocialAccount()}
            disabled={socialAction !== null}
            className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2.5 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] disabled:opacity-60 dark:text-action"
          >
            {socialAction === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {locale === "en" ? "Connect X account" : "连接 X 账号"}
          </button>
        ) : (
          <p className="rounded-lg border border-hairline bg-surface px-3 py-2.5 text-xs text-fg-muted">
            {locale === "en"
              ? "X OAuth is not configured in this environment."
              : "此环境尚未配置 X OAuth。"}
          </p>
        )}

        {/* LinkedIn read-only identity + post-analytics pilot */}
        {linkedinOAuthAvailable ? (
          linkedinSocialConnection ? (
            <div className="grid gap-3 rounded-lg border border-hairline p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-positive" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-fg">LinkedIn</p>
                    <p className="text-xs text-fg-muted">{locale === "en" ? "Read-only identity + post analytics" : "只读身份 + 帖子表现"}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void disconnectLinkedInSocialAccount()}
                  disabled={socialAction !== null}
                  className="focus-ring inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-risk/25 bg-risk/10 px-3 py-1.5 text-xs font-semibold text-risk disabled:opacity-60"
                >
                  {socialAction === "li-disconnect" ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Unlink className="h-3.5 w-3.5 shrink-0" />}
                  {locale === "en" ? "Disconnect Finfold" : "从 Finfold 断开"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => void syncLinkedInSocialAccount()}
                disabled={socialAction !== null}
                className="focus-ring inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2.5 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] disabled:opacity-60 dark:text-action"
              >
                {socialAction === "li-sync" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <RefreshCw className="h-4 w-4 shrink-0" />}
                {locale === "en" ? "Sync profile" : "同步账号资料"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void connectLinkedInSocialAccount()}
              disabled={socialAction !== null}
              className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2.5 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] disabled:opacity-60 dark:text-action"
            >
              {socialAction === "li-connect" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Link2 className="h-4 w-4 shrink-0" />}
              {locale === "en" ? "Connect LinkedIn account" : "连接 LinkedIn 账号"}
            </button>
          )
        ) : null}

        {socialStatus ? (
          <p role="status" className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${socialStatus.ok ? "border border-positive/30 bg-positive/10 text-positive" : "border border-risk/30 bg-risk/10 text-risk"}`}>
            {socialStatus.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
            {socialStatus.msg}
          </p>
        ) : null}
      </section>

      {/* X (Twitter) API integration — hidden, see MANUAL_X_METRICS_ENABLED */}
      {MANUAL_X_METRICS_ENABLED && (
      <section className="panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Link2 className="h-4 w-4 text-action-strong dark:text-action" />
          {locale === "en" ? "X Post Metrics (Manual URLs)" : "X 推文指标（手动 URL）"}
        </div>
        <p className="text-xs text-fg-muted">
          {locale === "en"
            ? "This legacy bearer token is only used to poll engagement for an X post URL that you enter yourself. It is not an OAuth account connection and cannot publish posts."
            : "此旧版 Bearer Token 仅用于轮询你手动填写的 X 推文 URL 的互动数据。它不是 OAuth 账号连接，也不能发布内容。"}
        </p>
        {xConnected ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline px-3 py-2.5">
            <p className="text-sm font-semibold text-fg">
              {locale === "en" ? "Connected" : "已连接"}
              {xTokenTail ? <span className="ml-2 font-mono text-fg-muted">{xTokenTail}</span> : null}
            </p>
            <button type="button" onClick={() => void disconnectX()} disabled={xLoading} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-risk/25 bg-risk/10 px-3 py-1.5 text-xs font-semibold text-risk disabled:opacity-60">
              {xLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
              {locale === "en" ? "Disconnect" : "断开连接"}
            </button>
          </div>
        ) : (
          <>
            <label className="grid gap-1.5 text-sm font-medium text-fg">
              {locale === "en" ? "Bearer token" : "Bearer Token"}
              <input type="password" value={xTokenInput} onChange={(e) => setXTokenInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void connectX()}
                className="focus-ring panel-inset rounded-lg px-3 py-2.5 font-mono text-fg placeholder:text-fg-muted placeholder:font-sans"
                placeholder="AAAAAAAAAAAAAAAAAAAAA..." autoComplete="off" spellCheck={false} />
            </label>
            <button type="button" onClick={() => void connectX()} disabled={xLoading} className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2.5 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] disabled:opacity-60 dark:text-action">
              {xLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {locale === "en" ? "Connect" : "连接"}
            </button>
          </>
        )}
        {xStatus ? (
          <p className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${xStatus.ok ? "border border-positive/30 bg-positive/10 text-positive" : "border border-risk/30 bg-risk/10 text-risk"}`}>
            {xStatus.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
            {xStatus.msg}
          </p>
        ) : null}
      </section>
      )}

      <section className="panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <LogOut className="h-4 w-4 text-risk" />
          {locale === "en" ? "Session" : "登录会话"}
        </div>
        <p className="text-xs text-fg-muted">
          {locale === "en" ? "Sign out on this device and return to the login page." : "退出当前设备上的登录状态，并返回登录页。"}
        </p>
        <button
          type="button"
          onClick={() => void logout()}
          disabled={logoutLoading}
          className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg border border-risk/25 bg-risk/10 px-4 py-3 text-sm font-semibold text-risk transition-colors hover:border-risk/40 hover:bg-risk/15 disabled:opacity-60"
        >
          {logoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          {locale === "en" ? "Log out" : "退出登录"}
        </button>
      </section>
    </div>
  );
}
