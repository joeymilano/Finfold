"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, CheckCircle2, Loader2, Lock, LogOut, Mail, Shield } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";

type UserInfo = { email: string; plan: string; avatarUrl: string | null; userId: string } | null;

const planLabelZh: Record<string, string> = {
  free: "免费版", starter: "Starter", creator: "Creator",
  pro: "Pro", team: "Team", trial: "试用",
};
const planLabelEn: Record<string, string> = {
  free: "Free", starter: "Starter", creator: "Creator",
  pro: "Pro", team: "Team", trial: "Trial",
};

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
    if (newPassword.length < 6) { setPwStatus({ ok: false, msg: locale === "en" ? "Password must be at least 6 characters." : "密码至少需要 6 位。" }); return; }
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
          <Shield className="h-4 w-4 text-brand" />
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
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
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
          <p className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${avatarStatus.ok ? "border border-brand/30 bg-brand/10 text-brand-strong dark:text-brand" : "border border-risk/30 bg-risk/10 text-risk"}`}>
            {avatarStatus.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
            {avatarStatus.msg}
          </p>
        ) : null}
      </section>

      {/* Change email */}
      <section className="panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Mail className="h-4 w-4 text-brand" />
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
          <p className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${emailStatus.ok ? "border border-brand/30 bg-brand/10 text-brand-strong dark:text-brand" : "border border-risk/30 bg-risk/10 text-risk"}`}>
            {emailStatus.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
            {emailStatus.msg}
          </p>
        ) : null}
        <button type="button" onClick={() => void updateEmail()} disabled={emailLoading} className="btn-primary focus-ring disabled:opacity-60">
          {emailLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {locale === "en" ? "Send confirmation email" : "发送确认邮件"} <ArrowRight className="h-4 w-4" />
        </button>
      </section>

      {/* Change password */}
      <section className="panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Lock className="h-4 w-4 text-brand" />
          {locale === "en" ? "Change Password" : "修改密码"}
        </div>
        <p className="text-xs text-fg-muted">{locale === "en" ? "Minimum 6 characters. If you signed up via Google, you can set a password here to also enable email login." : "密码至少 6 位。如果你是通过 Google 登录注册的，可以在此设置一个密码以支持邮箱登录。"}</p>
        <label className="grid gap-1.5 text-sm font-medium text-fg">
          {locale === "en" ? "New password" : "新密码"}
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            className="focus-ring panel-inset rounded-lg px-3 py-2.5 text-fg placeholder:text-fg-muted"
            placeholder={locale === "en" ? "At least 6 characters" : "至少 6 位"} autoComplete="new-password" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-fg">
          {locale === "en" ? "Confirm new password" : "确认新密码"}
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void updatePassword()}
            className="focus-ring panel-inset rounded-lg px-3 py-2.5 text-fg placeholder:text-fg-muted"
            placeholder={locale === "en" ? "Enter again" : "再输入一次"} autoComplete="new-password" />
        </label>
        {pwStatus ? (
          <p className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${pwStatus.ok ? "border border-brand/30 bg-brand/10 text-brand-strong dark:text-brand" : "border border-risk/30 bg-risk/10 text-risk"}`}>
            {pwStatus.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
            {pwStatus.msg}
          </p>
        ) : null}
        <button type="button" onClick={() => void updatePassword()} disabled={pwLoading} className="btn-primary focus-ring disabled:opacity-60">
          {pwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {locale === "en" ? "Update password" : "更新密码"} <ArrowRight className="h-4 w-4" />
        </button>
      </section>

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
