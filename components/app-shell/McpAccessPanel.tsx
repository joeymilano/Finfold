"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Copy, KeyRound, Loader2, PlugZap, Trash2 } from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { useLocale } from "@/hooks/useLocale";

type Token = { id: string; name: string; token_prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

export function McpAccessPanel() {
  const locale = useLocale();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);

  const copy = locale === "en" ? {
    eyebrow: "AGENT ACCESS",
    title: "Let Claude, GPT, and your own agents use Finfold.",
    desc: "Create a revocable MCP token once. Your agent can read your server-side Brand Memory and rules, then create saved, platform-native content kits without seeing your Finfold password.",
    create: "Create MCP token",
    createBusy: "Creating…",
    manage: "Manage access",
    hide: "Hide access settings",
    docs: "Setup guide",
    oneTime: "Copy this token now. It will not be shown again.",
    copied: "Copied",
    copy: "Copy",
    active: "Active tokens",
    never: "Not used yet",
    revoke: "Revoke",
    empty: "No agent access yet. Create a token when you are ready to connect an agent.",
    failed: "Could not manage MCP access. Please retry."
  } : {
    eyebrow: "AGENT 接入",
    title: "让 Claude、GPT 和自建 Agent 直接使用 Finfold。",
    desc: "创建一次可撤销的 MCP Token。你的 Agent 会在服务端读取品牌记忆和规则，生成并保存原生内容包；它不需要、更看不到你的 Finfold 密码。",
    create: "创建 MCP Token",
    createBusy: "创建中…",
    manage: "管理接入",
    hide: "收起接入设置",
    docs: "查看接入指南",
    oneTime: "请现在复制 Token：关闭后不会再次显示。",
    copied: "已复制",
    copy: "复制",
    active: "有效 Token",
    never: "尚未使用",
    revoke: "撤销",
    empty: "还没有给 Agent 的访问权限。需要连接时再创建 Token。",
    failed: "MCP 权限操作失败，请重试。"
  };

  async function loadTokens() {
    setLoading(true);
    try {
      const response = await fetch("/api/mcp/tokens", { cache: "no-store" });
      const data = (await response.json()) as { tokens?: Token[]; error?: string };
      if (!response.ok) throw new Error(data.error);
      setTokens((data.tokens ?? []).filter((token) => !token.revoked_at));
    } catch {
      setStatus(copy.failed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accessOpen) void loadTokens();
  }, [accessOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createToken() {
    setCreating(true);
    setStatus(null);
    try {
      const response = await fetch("/api/mcp/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "My agent" }) });
      const data = (await response.json()) as { token?: Token; secret?: string; error?: string };
      if (!response.ok || !data.secret) throw new Error(data.error);
      setSecret(data.secret);
      await loadTokens();
    } catch {
      setStatus(copy.failed);
    } finally {
      setCreating(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setStatus(copy.copied);
  }

  async function revokeToken(id: string) {
    setStatus(null);
    try {
      const response = await fetch(`/api/mcp/tokens/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setTokens((current) => current.filter((token) => token.id !== id));
    } catch {
      setStatus(copy.failed);
    }
  }

  return (
    <Panel className="mx-auto mb-4 max-w-[1360px] overflow-hidden p-0">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-action-strong dark:text-action"><PlugZap className="h-4 w-4" />{copy.eyebrow}</p>
          <p className="mt-1 text-sm text-fg-muted">{locale === "en" ? "Connect external agents only when you need to." : "仅在需要让外部 Agent 接入时展开配置。"}</p>
        </div>
        <button
          type="button"
          aria-expanded={accessOpen}
          onClick={() => setAccessOpen((open) => !open)}
          className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-hairline bg-surface-2/45 px-3 py-2 text-xs font-semibold text-fg transition hover:border-action/45 hover:text-action-strong dark:hover:text-action"
        >
          {accessOpen ? copy.hide : copy.manage}
          <ChevronDown className={`h-4 w-4 transition-transform ${accessOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {accessOpen ? (
        <div className="border-t border-hairline px-5 py-5 md:px-6 md:py-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-xl font-bold text-fg md:text-2xl">{copy.title}</h2>
              <p className="mt-2 text-sm leading-6 text-fg-muted">{copy.desc}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link href="/for-agents" className="btn-ghost focus-ring px-3 py-2 text-xs">{copy.docs}</Link>
              <button type="button" onClick={() => void createToken()} disabled={creating} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-3 py-2 text-xs font-semibold text-action-strong transition hover:bg-action/[0.14] disabled:opacity-60 dark:text-action">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}{creating ? copy.createBusy : copy.create}
              </button>
            </div>
          </div>

          {secret ? (
            <div className="mt-5 rounded-xl border border-action/35 bg-action/[0.08] p-4">
              <p className="text-sm font-semibold text-fg">{copy.oneTime}</p>
              <div className="mt-3 flex gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-black/25 px-3 py-2.5 text-xs text-fg">{secret}</code>
                <button type="button" onClick={() => void copySecret()} className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-action/45 px-3 text-xs font-semibold text-action-strong hover:bg-action/10 dark:text-action"><Copy className="h-3.5 w-3.5" />{copy.copy}</button>
              </div>
            </div>
          ) : null}

          <div className="mt-5 border-t border-hairline pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{copy.active}</p>
            {loading ? <Loader2 className="mt-3 h-4 w-4 animate-spin text-fg-muted" /> : tokens.length === 0 ? <p className="mt-3 text-sm text-fg-muted">{copy.empty}</p> : (
              <div className="mt-3 space-y-2">
                {tokens.map((token) => <div key={token.id} className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-2/45 px-3 py-2.5">
                  <KeyRound className="h-4 w-4 shrink-0 text-action-strong dark:text-action" />
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-fg">{token.name}</p><p className="mt-0.5 truncate font-mono text-[11px] text-fg-muted">{token.token_prefix}… · {token.last_used_at ? new Date(token.last_used_at).toLocaleDateString() : copy.never}</p></div>
                  <button type="button" onClick={() => void revokeToken(token.id)} className="focus-ring inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-fg-muted hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" />{copy.revoke}</button>
                </div>)}
              </div>
            )}
            {status ? <p className="mt-3 flex items-center gap-1.5 text-xs text-positive"><Check className="h-3.5 w-3.5" />{status}</p> : null}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
