"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Loader2, Lock, ShieldCheck } from "@/components/ui/icons";
import { LocaleToggle } from "@/components/theme/LocaleToggle";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useLocale } from "@/hooks/useLocale";
import { captureEvent } from "@/lib/posthog";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";

type AuthorizationDetails = {
  authorization_id: string;
  redirect_uri: string;
  client: { id: string; name: string; uri: string; logo_uri: string };
  user: { id: string; email: string };
  scope: string;
};

function normalizeClientName(value: string | undefined, fallback: string): string {
  const normalized = value
    ?.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 80) : fallback;
}

function getRedirectHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.hostname : null;
  } catch {
    return null;
  }
}

function getOAuthEventSource(redirectUri: string | undefined): "chatgpt_plugin" | "oauth_client" {
  const host = getRedirectHost(redirectUri)?.toLowerCase();
  return host === "chatgpt.com" || host?.endsWith(".chatgpt.com")
    ? "chatgpt_plugin"
    : "oauth_client";
}

function isExpiredAuthorizationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
  return candidate.code === "oauth_authorization_not_found"
    || (candidate.status === 404 && typeof candidate.message === "string" && /authorization not found/i.test(candidate.message));
}

function scopeCopy(scope: string, zh: boolean): { title: string; body: string } {
  switch (scope) {
    case "openid":
      return zh
        ? { title: "确认你的 Finfold 身份", body: "用于将本次授权与你已登录的 Finfold 账号关联。" }
        : { title: "Confirm your Finfold identity", body: "Links this authorization to the Finfold account you signed in with." };
    case "email":
      return zh
        ? { title: "共享你的 Finfold 邮箱", body: "允许发起连接的应用读取邮箱及其验证状态。" }
        : { title: "Share your Finfold email", body: "Lets the requesting app read your email and whether it is verified." };
    case "profile":
      return zh
        ? { title: "共享基本资料", body: "允许发起连接的应用读取名称和头像等基本资料。" }
        : { title: "Share basic profile details", body: "Lets the requesting app read basic profile details such as name and picture." };
    case "phone":
      return zh
        ? { title: "共享手机号", body: "允许发起连接的应用读取手机号及其验证状态。" }
        : { title: "Share your phone number", body: "Lets the requesting app read your phone number and whether it is verified." };
    default:
      return zh
        ? { title: `权限：${scope}`, body: "只在你批准本次连接后授予。" }
        : { title: `Permission: ${scope}`, body: "Granted only if you approve this connection." };
  }
}

export function OAuthConsentClient({ authorizationId }: { authorizationId: string }) {
  const locale = useLocale();
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const zh = locale !== "en";
  const clientName = normalizeClientName(details?.client.name, zh ? "该应用" : "This app");
  const redirectHost = getRedirectHost(details?.redirect_uri);
  const requestedScopes = [...new Set(details?.scope.split(/\s+/).filter(Boolean) ?? [])];

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        if (active) setError(zh ? "Finfold 登录服务暂时不可用。" : "Finfold sign-in is temporarily unavailable.");
        if (active) setLoading(false);
        return;
      }
      const { data, error: authError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (authError || !data) {
        setError(zh ? "授权请求已失效，请返回发起连接的应用重试。" : "This authorization request expired. Return to the requesting app and try again.");
        setLoading(false);
        return;
      }
      if ("redirect_url" in data) {
        window.location.assign(data.redirect_url);
        return;
      }
      setDetails(data);
      setLoading(false);
      captureEvent("plugin_oauth_started", {
        source: getOAuthEventSource(data.redirect_uri),
        locale: zh ? "zh" : "en",
        requested_scope_count: data.scope.split(/\s+/).filter(Boolean).length
      });
    }
    void load();
    return () => { active = false; };
  }, [authorizationId, zh]);

  async function decide(action: "approve" | "deny") {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !details) return;
    setDecision(action);
    setError(null);
    const response = action === "approve"
      ? await supabase.auth.oauth.approveAuthorization(details.authorization_id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(details.authorization_id, { skipBrowserRedirect: true });
    if (response.error || !response.data?.redirect_url) {
      if (isExpiredAuthorizationError(response.error)) {
        setDetails(null);
        setError(zh
          ? "此授权请求已过期。请返回 ChatGPT 重新连接 Finfold。"
          : "This authorization request expired. Return to ChatGPT and connect Finfold again.");
        setDecision(null);
        return;
      }
      setError(zh ? "暂时无法完成授权，请重试。" : "Finfold could not complete authorization. Please try again.");
      setDecision(null);
      return;
    }
    if (action === "approve") {
      captureEvent("plugin_oauth_completed", {
        source: getOAuthEventSource(details.redirect_uri),
        locale: zh ? "zh" : "en",
        success: true
      });
    }
    window.location.assign(response.data.redirect_url);
  }

  return (
    <main data-product-shell className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-bg px-4 py-5 text-fg sm:px-6 sm:py-7">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_16%,rgb(var(--action)/0.09),transparent_30%),radial-gradient(circle_at_82%_78%,rgb(var(--brand)/0.06),transparent_28%)]"
      />

      <header className="mx-auto flex w-full max-w-lg items-center justify-between">
        <Link href="/" aria-label="Finfold home" className="focus-ring flex items-center gap-3 rounded-xl p-1">
          <span className="flex h-10 w-10 overflow-hidden rounded-[13px] ring-1 ring-hairline shadow-[0_10px_26px_-16px_rgb(0_0_0/0.85)]">
            <Image
              src="/brand/favicon-tab-v2-96.png"
              width="40"
              height="40"
              alt="Finfold"
              className="h-10 w-10 object-cover"
              fetchPriority="high"
              draggable={false}
              unoptimized
            />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-[-0.02em]">Finfold</span>
            <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.15em] text-fg-muted">
              {zh ? "安全连接" : "Secure connection"}
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-2"><LocaleToggle /><ThemeToggle /></div>
      </header>

      <div className="relative mx-auto flex w-full max-w-lg flex-1 items-center py-8 sm:py-12">
        <section className="w-full overflow-hidden rounded-[24px] border border-hairline bg-surface/90 shadow-[0_28px_90px_-48px_rgb(0_0_0/0.88),inset_0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-2xl dark:border-white/[0.09] dark:bg-[rgb(16_15_12/0.86)]">
          <div className="px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-7">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-action-strong dark:text-action">
              <ShieldCheck className="h-4 w-4" />{zh ? "由 Finfold 安全授权" : "Secured by Finfold"}
            </p>
            <h1 className="mt-3 text-[1.75rem] font-semibold leading-[1.12] tracking-[-0.04em] sm:text-[2rem]">
              {details
                ? zh ? `将 ${clientName} 连接到 Finfold？` : `Connect ${clientName} to Finfold?`
                : error
                  ? zh ? "此连接链接已失效" : "This connection link has expired"
                  : zh ? "正在核对连接请求" : "Checking your connection request"}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-fg-muted">
              {details
                ? zh ? `${clientName} 请求使用账号 ${details.user.email}。` : `${clientName} is requesting access to ${details.user.email}.`
                : error
                  ? zh ? "返回发起连接的应用并重新开始，即可获得新的授权链接。" : "Return to the requesting app and start again to get a fresh authorization link."
                  : zh ? "这通常只需要几秒钟。" : "This usually takes just a few seconds."}
            </p>
          </div>

          <div className="border-t border-hairline px-5 py-5 sm:px-7 sm:py-6">
            {loading ? (
              <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-fg-muted" role="status">
                <Loader2 className="h-4 w-4 animate-spin" />{zh ? "正在核对授权请求…" : "Checking the authorization request…"}
              </div>
            ) : error && !details ? (
              <div>
                <div role="alert" className="flex gap-3 rounded-2xl border border-risk/25 bg-risk/[0.07] p-4">
                  <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-risk" />
                  <div>
                    <p className="text-sm font-semibold text-fg">{zh ? "需要新的连接请求" : "A new connection request is needed"}</p>
                    <p className="mt-1 text-sm leading-6 text-fg-muted">{error}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => window.history.back()}
                  className="btn-primary focus-ring mt-4 w-full py-3"
                >
                  <ArrowLeft className="h-4 w-4" />{zh ? "返回并重试" : "Go back and try again"}
                </button>
              </div>
            ) : details ? (
              <>
                {redirectHost ? (
                  <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-2/55 px-3.5 py-3">
                    <div>
                      <p className="text-xs font-semibold text-fg">{zh ? "完成后返回" : "Returns to"}</p>
                      <p data-testid="oauth-redirect-host" className="mt-0.5 break-all text-xs leading-5 text-fg-muted">
                        {redirectHost}
                      </p>
                    </div>
                    <span className="tag tag-action shrink-0">{zh ? "已验证 HTTPS" : "HTTPS verified"}</span>
                  </div>
                ) : null}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fg-muted">{zh ? "允许的操作" : "What you are allowing"}</p>
                  <div className="mt-3 flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-positive/[0.12] text-positive">
                      <Check className="h-3 w-3" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{zh ? "创建和读取你的 Finfold 内容包" : "Create and read your Finfold content kits"}</p>
                      <p className="mt-1 text-xs leading-5 text-fg-muted">
                        {zh ? `${clientName} 可以调用 Finfold 生成草稿并保存到你的工作区，生成会使用账号现有的 AI Credits。不会自动发布，也不会连接或修改社交账号。` : `${clientName} can ask Finfold to generate drafts and save them to your workspace using the account's existing AI Credits. It cannot publish them or change connected social accounts.`}
                      </p>
                    </div>
                  </div>
                  {requestedScopes.map((scope) => {
                    const copy = scopeCopy(scope, zh);
                    return (
                      <div key={scope} className="mt-3 flex gap-3" data-testid={`oauth-scope-${scope}`}>
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-positive/[0.12] text-positive">
                          <Check className="h-3 w-3" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{copy.title}</p>
                          <p className="mt-1 text-xs leading-5 text-fg-muted">{copy.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-5 flex items-start gap-2 border-t border-hairline pt-4 text-xs leading-5 text-fg-muted">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {zh ? "你可以随时在 Finfold 设置中撤销访问。Finfold 不会把你的密码交给发起连接的应用。" : "You can revoke access any time in Finfold Settings. Your Finfold password is never shared with the requesting app."}
                </p>
                {error ? <p role="alert" className="mt-4 rounded-xl border border-risk/25 bg-risk/[0.07] px-3.5 py-3 text-sm text-risk">{error}</p> : null}
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" disabled={decision !== null} onClick={() => void decide("deny")} className="btn-ghost focus-ring disabled:opacity-60 sm:min-w-24">
                    {decision === "deny" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{zh ? "取消" : "Cancel"}
                  </button>
                  <button type="button" disabled={decision !== null} onClick={() => void decide("approve")} className="btn-primary focus-ring disabled:opacity-60 sm:min-w-44">
                    {decision === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{zh ? "允许并继续" : "Allow and continue"}<ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </section>
      </div>

      <footer className="mx-auto flex w-full max-w-lg items-center justify-center gap-2 pb-1 text-xs text-fg-muted">
        <span>© {new Date().getFullYear()} Finfold</span>
        <span aria-hidden>·</span>
        <Link href="/privacy" className="focus-ring rounded hover:text-fg hover:underline">{zh ? "隐私政策" : "Privacy"}</Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="focus-ring rounded hover:text-fg hover:underline">{zh ? "服务条款" : "Terms"}</Link>
      </footer>
    </main>
  );
}
