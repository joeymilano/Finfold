"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Link2, Loader2, PlugZap, RefreshCw, Unlink, UserRound } from "@/components/ui/icons";
import { useLocale } from "@/hooks/useLocale";

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
  grantedScopes: string[];
  accounts: SocialConnectionAccount[];
};
type SocialSyncEvidence = {
  posts: Array<{
    externalPostId: string;
    url: string | null;
    publishedAt: string | null;
    impressions: number | null;
    views: number | null;
    reach: number | null;
    reactions: number | null;
    comments: number | null;
    measuredAt: string;
  }>;
  account: {
    followerCount: number | null;
    views: number | null;
    reach: number | null;
    profileViews: number | null;
    measuredAt: string;
  } | null;
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
 * SocialAccountsTab — official-account OAuth connections for X, LinkedIn,
 * Instagram, and WeChat Official Accounts. Publishes nothing on its own:
 * connections only authorize Finfold to act after an explicit approval.
 */
export function SocialAccountsTab() {
  const locale = useLocale();

  // X (Twitter) API integration
  const [xConnected, setXConnected] = useState(false);
  const [xTokenTail, setXTokenTail] = useState<string | null>(null);
  const [xTokenInput, setXTokenInput] = useState("");
  const [xStatus, setXStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [xLoading, setXLoading] = useState(false);

  // X OAuth connection: an account identity connection that is deliberately
  // separate from the legacy bearer token used for manual-URL metrics.
  const [socialConnections, setSocialConnections] = useState<SocialConnection[]>([]);
  const [oauthAvailable, setOAuthAvailable] = useState({
    x: false,
    linkedin: false,
    instagram: false,
    wechat: false
  });
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialAction, setSocialAction] = useState<string | null>(null);
  const [socialStatus, setSocialStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [socialEvidence, setSocialEvidence] = useState<Record<string, SocialSyncEvidence>>({});

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
          oauthConnectors?: { x?: boolean; linkedin?: boolean; instagram?: boolean; wechat?: boolean };
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Could not load social connections.");
        if (!active) return;

        setSocialConnections((data.connections ?? []).filter((connection) => connection.status === "connected"));
        setOAuthAvailable({
          x: data.oauthConnectors?.x === true,
          linkedin: data.oauthConnectors?.linkedin === true,
          instagram: data.oauthConnectors?.instagram === true,
          wechat: data.oauthConnectors?.wechat === true
        });
        const query = new URLSearchParams(window.location.search);
        const callbackConnector = query.get("social_connection");
        if (["x", "linkedin", "instagram", "wechat"].includes(callbackConnector ?? "")) {
          const status = query.get("social_status");
          const labels = locale === "en"
            ? { x: "X", linkedin: "LinkedIn", instagram: "Instagram", wechat: "WeChat" }
            : { x: "X", linkedin: "LinkedIn", instagram: "Instagram", wechat: "微信公众号" };
          const label = labels[callbackConnector as keyof typeof labels];
          const messages = locale === "en"
            ? {
                connected: { ok: true, msg: `${label} authorization completed.` },
                denied: { ok: false, msg: `${label} authorization was cancelled.` },
                expired: { ok: false, msg: `The ${label} authorization link expired. Start again.` },
                failed: { ok: false, msg: `${label} authorization could not be completed.` },
                unavailable: { ok: false, msg: `${label} authorization is not configured in this environment.` }
              }
            : {
                connected: { ok: true, msg: `${label} 授权已完成。` },
                denied: { ok: false, msg: `已取消 ${label} 授权。` },
                expired: { ok: false, msg: `${label} 授权链接已过期，请重新开始。` },
                failed: { ok: false, msg: `无法完成 ${label} 授权。` },
                unavailable: { ok: false, msg: `此环境尚未配置 ${label} 授权。` }
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

  type AuthorizedConnector = "x" | "linkedin" | "instagram" | "wechat";

  function connectorLabel(connectorId: AuthorizedConnector) {
    if (connectorId === "x") return "X";
    if (connectorId === "linkedin") return "LinkedIn";
    if (connectorId === "instagram") return "Instagram";
    return locale === "en" ? "WeChat Official Account" : "微信公众号";
  }

  async function connectSocialAccount(connectorId: AuthorizedConnector) {
    setSocialAction(`connect-${connectorId}`);
    setSocialStatus(null);
    const label = connectorLabel(connectorId);
    try {
      const res = await fetch(`/api/settings/social-connections/${connectorId}/authorize`, { method: "POST" });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || (locale === "en" ? `Could not start ${label} authorization.` : `无法开始 ${label} 授权。`));
      }
      window.location.assign(data.url);
    } catch (err) {
      setSocialStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? `Could not start ${label} authorization.` : `无法开始 ${label} 授权。`) });
      setSocialAction(null);
    }
  }

  async function syncSocialAccount(connectorId: AuthorizedConnector, connection: SocialConnection) {
    const action = `sync-${connection.id}`;
    const label = connectorLabel(connectorId);
    setSocialAction(action);
    setSocialStatus(null);
    try {
      if (connectorId === "wechat") {
        const res = await fetch("/api/performance/sync-social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectorId, connectionId: connection.id })
        });
        const data = await res.json() as {
          newUsers?: number;
          cancelledUsers?: number;
          followerCount?: number | null;
          endDate?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || (locale === "en" ? "Could not synchronize WeChat user analytics." : "无法同步微信公众号用户数据。"));
        const followerText = data.followerCount === null || data.followerCount === undefined
          ? ""
          : locale === "en" ? ` Total followers: ${data.followerCount}.` : ` 当前累计关注 ${data.followerCount}。`;
        setSocialStatus({
          ok: true,
          msg: locale === "en"
            ? `WeChat data through ${data.endDate ?? "the latest day"}: +${data.newUsers ?? 0}, -${data.cancelledUsers ?? 0}.${followerText}`
            : `已同步截至 ${data.endDate ?? "最近一天"} 的微信公众号数据：新增 ${data.newUsers ?? 0}，取关 ${data.cancelledUsers ?? 0}。${followerText}`
        });
        return;
      }

      const profileResponse = await fetch(`/api/settings/social-connections/${connectorId}/accounts/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id })
      });
      const profile = await profileResponse.json() as { accounts?: SocialConnectionAccount[]; error?: string };
      if (!profileResponse.ok || !profile.accounts) {
        throw new Error(profile.error || (locale === "en" ? `Could not synchronize the ${label} account.` : `无法同步 ${label} 账号资料。`));
      }
      setSocialConnections((connections) => connections.map((current) =>
        current.id === connection.id ? { ...current, accounts: profile.accounts ?? current.accounts } : current
      ));

      if (connectorId === "linkedin" || connectorId === "instagram") {
        const performanceResponse = await fetch("/api/performance/sync-social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectorId,
            connectionId: connection.id,
            accountIds: connection.accounts.map((account) => account.id)
          })
        });
        const performance = await performanceResponse.json() as {
          imported?: number;
          syncedAccounts?: number;
          evidence?: SocialSyncEvidence["posts"];
          accountEvidence?: SocialSyncEvidence["account"];
          error?: string;
        };
        if (!performanceResponse.ok) throw new Error(performance.error || `Could not import ${label} performance.`);
        setSocialEvidence((current) => ({
          ...current,
          [connection.id]: {
            posts: performance.evidence ?? [],
            account: performance.accountEvidence ?? null
          }
        }));
        const accountCount = performance.syncedAccounts ?? 1;
        setSocialStatus({
          ok: true,
          msg: locale === "en"
            ? `${accountCount} ${label} ${accountCount > 1 ? "accounts" : "account"} and ${performance.imported ?? 0} post metrics synchronized.`
            : `已同步 ${accountCount} 个 ${label} 账号、${performance.imported ?? 0} 条帖子表现。`
        });
      } else {
        setSocialStatus({ ok: true, msg: locale === "en" ? `${label} profile synchronized.` : `${label} 账号资料已同步。` });
      }
    } catch (err) {
      setSocialStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? `Could not synchronize ${label}.` : `无法同步 ${label}。`) });
    } finally {
      setSocialAction(null);
    }
  }

  async function selectSocialAccountTarget(
    connectorId: AuthorizedConnector,
    connection: SocialConnection,
    account: SocialConnectionAccount
  ) {
    setSocialAction(`select-${account.id}`);
    setSocialStatus(null);
    try {
      const res = await fetch(`/api/settings/social-connections/${connectorId}/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id })
      });
      const data = await res.json() as { account?: SocialConnectionAccount; error?: string };
      if (!res.ok || !data.account) throw new Error(data.error || "Could not select the account.");
      setSocialConnections((connections) => connections.map((current) => current.id === connection.id ? {
        ...current,
        accounts: current.accounts.map((item) => ({ ...item, isSelected: item.id === data.account?.id }))
      } : current));
      setSocialStatus({ ok: true, msg: locale === "en" ? "Account target selected." : "已选择账号目标。" });
    } catch (err) {
      setSocialStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? "Could not select the account." : "无法选择账号。") });
    } finally {
      setSocialAction(null);
    }
  }

  async function disconnectSocialAccount(connectorId: AuthorizedConnector, connection: SocialConnection) {
    const action = `disconnect-${connection.id}`;
    const label = connectorLabel(connectorId);
    setSocialAction(action);
    setSocialStatus(null);
    try {
      const res = await fetch("/api/settings/social-connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId, connectionId: connection.id })
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || (locale === "en" ? `Could not disconnect ${label}.` : `无法断开 ${label}。`));
      setSocialConnections((connections) => connections.filter((current) => current.id !== connection.id));
      setSocialStatus({ ok: true, msg: locale === "en" ? `${label} connection disconnected.` : `已断开 ${label} 连接。` });
    } catch (err) {
      setSocialStatus({ ok: false, msg: err instanceof Error ? err.message : (locale === "en" ? `Could not disconnect ${label}.` : `无法断开 ${label}。`) });
    } finally {
      setSocialAction(null);
    }
  }

  const renderSocialConnector = (
    connectorId: AuthorizedConnector,
    options: {
      label: string;
      detail: string;
      connectLabel: string;
      syncLabel: string;
      unavailable: string;
    }
  ) => {
    const connections = socialConnections.filter((connection) => connection.connectorId === connectorId);
    const available = oauthAvailable[connectorId];
    return (
      <div className="grid gap-3 rounded-lg border border-hairline p-3" data-connector={connectorId}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${connections.length > 0 ? "bg-positive" : "bg-fg-muted/35"}`} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{options.label}</p>
              <p className="text-xs text-fg-muted">{options.detail}</p>
            </div>
          </div>
          {available ? (
            <button
              type="button"
              onClick={() => void connectSocialAccount(connectorId)}
              disabled={socialAction !== null}
              className="focus-ring inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-action/35 bg-action/[0.06] px-3 py-1.5 text-xs font-semibold text-action-strong disabled:opacity-60 dark:text-action"
            >
              {socialAction === `connect-${connectorId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              {connections.length > 0
                ? (locale === "en" ? "Connect another" : "再连接一个")
                : options.connectLabel}
            </button>
          ) : null}
        </div>

        {connections.map((connection, index) => {
          const wechatAnalyticsGranted = connection.grantedScopes?.includes("wechat_func_2");
          const connectionEvidence = socialEvidence[connection.id];
          const latestPostEvidence = connectionEvidence?.posts[0];
          return (
            <div key={connection.id} className="grid gap-2 rounded-lg border border-hairline bg-surface/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-fg-muted">
                  {locale === "en" ? `Authorization ${index + 1}` : `第 ${index + 1} 套授权`}
                </p>
                <button
                  type="button"
                  onClick={() => void disconnectSocialAccount(connectorId, connection)}
                  disabled={socialAction !== null}
                  className="focus-ring inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-risk/25 bg-risk/10 px-3 py-1.5 text-xs font-semibold text-risk disabled:opacity-60"
                >
                  {socialAction === `disconnect-${connection.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                  {locale === "en" ? "Disconnect Finfold" : "从 Finfold 断开"}
                </button>
              </div>

              {connection.accounts.length > 0 ? (
                <div className="grid gap-2" aria-label={locale === "en" ? `Accounts in ${options.label} authorization ${index + 1}` : `${options.label} 第 ${index + 1} 套授权账号`}>
                  {connection.accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      aria-pressed={account.isSelected}
                      onClick={() => void selectSocialAccountTarget(connectorId, connection, account)}
                      disabled={socialAction !== null || account.isSelected}
                      className={`focus-ring flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-left transition disabled:cursor-default ${account.isSelected ? "border-action/55 bg-action/[0.08]" : "border-hairline hover:bg-surface"}`}
                    >
                      <UserRound className={`h-4 w-4 shrink-0 ${account.isSelected ? "text-action-strong dark:text-action" : "text-fg-muted"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-fg">{account.displayName ?? account.handle ?? options.label}</span>
                        {account.handle ? <span className="block truncate text-xs text-fg-muted">{account.handle}</span> : null}
                      </span>
                      {socialAction === `select-${account.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin text-fg-muted" /> : null}
                      {account.isSelected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" /> : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-hairline bg-surface px-3 py-2.5 text-xs text-fg-muted">
                  {locale === "en" ? "Authorized, but no account profile has synchronized yet." : "授权已完成，但尚未同步账号资料。"}
                </p>
              )}

              {connectionEvidence ? (
                <div className="grid gap-1 rounded-lg border border-positive/20 bg-positive/[0.05] px-3 py-2.5 text-xs text-fg-muted">
                  <p className="font-semibold text-fg">
                    {locale === "en" ? "Latest provider readback" : "最近一次平台回读"}
                  </p>
                  <p>
                    {locale === "en"
                      ? `${connectionEvidence.posts.length} posts returned with observed metrics.`
                      : `已回读 ${connectionEvidence.posts.length} 条含真实指标的帖子。`}
                  </p>
                  {connectionEvidence.account?.followerCount !== null && connectionEvidence.account?.followerCount !== undefined ? (
                    <p>{locale === "en" ? "Followers" : "关注者"}: {connectionEvidence.account.followerCount.toLocaleString()}</p>
                  ) : null}
                  {latestPostEvidence ? (
                    <p>
                      {[...[
                        latestPostEvidence.views === null ? null : `${locale === "en" ? "views" : "播放/浏览"} ${latestPostEvidence.views.toLocaleString()}`,
                        latestPostEvidence.impressions === null ? null : `${locale === "en" ? "impressions" : "展示"} ${latestPostEvidence.impressions.toLocaleString()}`,
                        latestPostEvidence.reach === null ? null : `${locale === "en" ? "reach" : "触达"} ${latestPostEvidence.reach.toLocaleString()}`,
                        latestPostEvidence.reactions === null ? null : `${locale === "en" ? "reactions" : "互动"} ${latestPostEvidence.reactions.toLocaleString()}`,
                        latestPostEvidence.comments === null ? null : `${locale === "en" ? "comments" : "评论"} ${latestPostEvidence.comments.toLocaleString()}`
                      ].filter(Boolean)].join(" · ")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {connectorId === "wechat" && !wechatAnalyticsGranted ? (
                <p className="rounded-lg border border-risk/25 bg-risk/[0.06] px-3 py-2.5 text-xs text-risk">
                  {locale === "en" ? "This authorization did not grant aggregate user analytics." : "这套授权未包含汇总用户分析权限。"}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => void syncSocialAccount(connectorId, connection)}
                  disabled={socialAction !== null}
                  className="focus-ring inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2.5 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] disabled:opacity-60 dark:text-action"
                >
                  {socialAction === `sync-${connection.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {options.syncLabel}
                </button>
              )}
            </div>
          );
        })}

        {!available && connections.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-surface px-3 py-2.5 text-xs text-fg-muted">{options.unavailable}</p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="grid gap-6">
      {/* Social account OAuth connection */}
      <section id="social-accounts" className="panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <PlugZap className="h-4 w-4 text-action-strong dark:text-action" />
          {locale === "en" ? "Social Accounts" : "社交账号"}
        </div>
        <p className="text-xs text-fg-muted">
          {locale === "en"
            ? "Connect official accounts so Finfold can publish on supported platforms after one approval and bring content and account performance into the next growth cycle. Available capabilities depend on each platform and account type."
            : "连接官方账号后，Finfold 可在支持的平台上，经你一次确认后自动完成发布，并把内容与账号表现带回下一轮增长。具体能力取决于平台开放权限和账号类型。"}
        </p>

        {socialLoading ? (
          <div className="flex items-center gap-2 text-sm text-fg-muted" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            {locale === "en" ? "Loading social accounts..." : "正在加载社交账号..."}
          </div>
        ) : (
          <div className="grid gap-3">
            {renderSocialConnector("x", {
              label: "X / Twitter",
              detail: locale === "en" ? "Read-only identity and owned posts" : "只读身份与本人帖子",
              connectLabel: locale === "en" ? "Connect X account" : "连接 X 账号",
              syncLabel: locale === "en" ? "Sync profile" : "同步账号资料",
              unavailable: locale === "en" ? "X OAuth is not configured in this environment." : "此环境尚未配置 X OAuth。"
            })}
            {renderSocialConnector("linkedin", {
              label: "LinkedIn",
              detail: locale === "en" ? "Company Pages you manage; read-only posts and organic performance" : "你管理的公司主页；只读帖子与自然表现",
              connectLabel: locale === "en" ? "Connect LinkedIn Pages" : "连接 LinkedIn 公司主页",
              syncLabel: locale === "en" ? "Sync Pages and performance" : "同步主页与表现",
              unavailable: locale === "en" ? "LinkedIn OAuth is not configured in this environment." : "此环境尚未配置 LinkedIn OAuth。"
            })}
            {renderSocialConnector("instagram", {
              label: "Instagram",
              detail: locale === "en" ? "Professional accounts only; read-only media and Insights" : "仅专业账号；只读媒体与 Insights",
              connectLabel: locale === "en" ? "Connect Instagram account" : "连接 Instagram 账号",
              syncLabel: locale === "en" ? "Sync media and Insights" : "同步媒体与 Insights",
              unavailable: locale === "en" ? "Instagram OAuth is not configured in this environment." : "此环境尚未配置 Instagram OAuth。"
            })}
            {renderSocialConnector("wechat", {
              label: locale === "en" ? "WeChat Official Account" : "微信公众号",
              detail: locale === "en" ? "Publishing, scheduling, and aggregate follower analytics" : "内容发布、定时发布与汇总关注数据",
              connectLabel: locale === "en" ? "Connect WeChat Official Account" : "连接微信公众号",
              syncLabel: locale === "en" ? "Sync month-to-date user data" : "同步本月用户数据",
              unavailable: locale === "en" ? "WeChat Open Platform authorization is not configured in this environment." : "此环境尚未配置微信开放平台授权。"
            })}
          </div>
        )}


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
    </div>
  );
}
