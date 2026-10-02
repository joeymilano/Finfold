"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, DatabaseZap, KeyRound, Loader2, RefreshCw, Unlink } from "@/components/ui/icons";
import { useLocale } from "@/hooks/useLocale";

type Endpoint = {
  id: string;
  url: string;
  status: "active" | "disabled";
  secretPrefix: string | null;
  createdAt: string;
  rotatedAt: string | null;
  lastReceivedAt: string | null;
};

type Delivery = {
  id: string;
  status: "processing" | "succeeded" | "failed";
  eventType: "lead" | "signup" | "revenue";
  source: string;
  missionId: string | null;
  attemptCount: number;
  errorCode: string | null;
  receivedAt: string;
  processedAt: string | null;
};

type SettingsResponse = {
  eligible: boolean;
  plan: string;
  requiredPlan: "growth_v2";
  endpoint: Endpoint | null;
  deliveries: Delivery[];
  error?: string;
};

export function OutcomeWebhookPanel() {
  const locale = useLocale();
  const en = locale === "en";
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const example = useMemo(() => JSON.stringify({
    eventId: "lead_20260824_0001",
    type: "lead",
    trackingCode: "COPY_FROM_MISSION_CONTROL",
    source: "website-form",
    count: 1,
    occurredAt: new Date().toISOString()
  }, null, 2), []);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/settings/outcome-webhook", { cache: "no-store" });
      const data = await response.json() as SettingsResponse;
      if (!response.ok) throw new Error(data.error);
      setSettings(data);
    } catch (error) {
      setStatus({
        ok: false,
        message: error instanceof Error && error.message
          ? error.message
          : en ? "Could not load the business result connection." : "无法加载业务结果连接。"
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createOrRotate() {
    const rotating = settings?.endpoint?.status === "active";
    if (rotating && !window.confirm(en
      ? "Rotate the signing secret? The current secret will stop working immediately."
      : "确认轮换签名密钥？当前密钥会立即失效，已有接入需要同步更新。")) return;

    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/settings/outcome-webhook", { method: "POST" });
      const data = await response.json() as { endpoint?: Endpoint; secret?: string; error?: string };
      if (!response.ok || !data.endpoint || !data.secret) throw new Error(data.error);
      setSecret(data.secret);
      setSettings((current) => current ? { ...current, endpoint: data.endpoint ?? null } : current);
      setStatus({
        ok: true,
        message: rotating
          ? en ? "Secret rotated. Update the sender before the next event." : "密钥已轮换，请在下一次回传前更新发送端。"
          : en ? "Connection created. Copy the signing secret now." : "连接已创建，请现在复制签名密钥。"
      });
      await load();
    } catch (error) {
      setStatus({
        ok: false,
        message: error instanceof Error && error.message
          ? error.message
          : en ? "Could not create the connection." : "无法创建连接。"
      });
    } finally {
      setSaving(false);
    }
  }

  async function disable() {
    if (!window.confirm(en
      ? "Disable automatic outcome delivery? Manual outcome recording will remain available."
      : "确认停用自动结果回传？手工记录业务结果仍然可用。")) return;
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/settings/outcome-webhook", { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error);
      setSecret(null);
      await load();
      setStatus({ ok: true, message: en ? "Automatic outcome delivery disabled." : "自动结果回传已停用。" });
    } catch (error) {
      setStatus({
        ok: false,
        message: error instanceof Error && error.message
          ? error.message
          : en ? "Could not disable the connection." : "无法停用连接。"
      });
    } finally {
      setSaving(false);
    }
  }

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus({ ok: true, message: en ? `${label} copied.` : `已复制${label}。` });
    } catch {
      setStatus({ ok: false, message: en ? "Copy failed. Select the text and copy it manually." : "复制失败，请选中文本后手动复制。" });
    }
  }

  const endpoint = settings?.endpoint ?? null;
  const active = endpoint?.status === "active";

  return (
    <section id="business-result-connection" className="panel space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-action/10 p-2 text-action-strong dark:text-action">
          <DatabaseZap className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">{en ? "Automatic Business Results" : "业务结果自动回传"}</h2>
          <p className="mt-1 text-xs leading-5 text-fg-muted">
            {en
              ? "Let your form or payment backend send verified leads, signups, and revenue to the right Growth Mission. Finfold stores no name, email, or phone number."
              : "让表单或支付后端把已确认的线索、注册和收入回传到对应增长任务。Finfold 不保存姓名、邮箱或手机号。"}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-fg-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          {en ? "Checking connection…" : "正在检查连接…"}
        </p>
      ) : settings && !settings.eligible ? (
        <div className="rounded-xl border border-brand/25 bg-brand/[0.06] p-4">
          <p className="text-sm font-semibold text-fg">{en ? "Included with Growth Engine" : "增长引擎及以上套餐可用"}</p>
          <p className="mt-1 text-xs leading-5 text-fg-muted">
            {en
              ? "Starter and Creator keep manual outcome recording. Upgrade when automatic form or payment backflow saves enough recurring work."
              : "入门版和创作者版继续支持手工记录结果；当表单或支付回传能持续节省运营时间时，再升级启用。"}
          </p>
          <Link href="/billing?plan=growth" className="btn-primary focus-ring mt-3 inline-flex text-xs">
            {en ? "View Growth Engine" : "查看增长引擎"}
          </Link>
        </div>
      ) : !active ? (
        <div className="rounded-xl border border-hairline bg-surface-2/45 p-4">
          <p className="text-sm font-semibold text-fg">{endpoint ? (en ? "Connection disabled" : "连接已停用") : (en ? "No result connection yet" : "尚未连接业务结果")}</p>
          <p className="mt-1 text-xs leading-5 text-fg-muted">
            {en
              ? "Create one tenant-specific endpoint. The signing secret is shown once and can be rotated later."
              : "创建一个租户专属接收地址。签名密钥只显示一次，之后可以主动轮换。"}
          </p>
          <button type="button" onClick={() => void createOrRotate()} disabled={saving} className="focus-ring mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2.5 text-sm font-semibold text-action-strong disabled:opacity-60 dark:text-action">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {endpoint ? (en ? "Enable with new secret" : "使用新密钥启用") : (en ? "Create result connection" : "创建结果连接")}
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-positive/25 bg-positive/[0.06] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-fg"><CheckCircle2 className="h-4 w-4 text-positive" />{en ? "Receiving endpoint active" : "结果接收已启用"}</p>
              <span className="text-[11px] text-fg-muted">{endpoint.lastReceivedAt ? (en ? `Last result ${formatTime(endpoint.lastReceivedAt, locale)}` : `最近回传 ${formatTime(endpoint.lastReceivedAt, locale)}`) : (en ? "Waiting for first result" : "等待首次回传")}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-black/20 px-3 py-2.5 text-[11px] text-fg">{endpoint.url}</code>
              <button type="button" aria-label={en ? "Copy endpoint" : "复制接收地址"} onClick={() => void copyValue(endpoint.url, en ? "Endpoint" : "接收地址")} className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline px-3 text-xs font-semibold text-fg"><Copy className="h-3.5 w-3.5" />{en ? "Copy" : "复制"}</button>
            </div>
            <p className="mt-2 text-[11px] text-fg-muted">{en ? `Secret: ${endpoint.secretPrefix ?? "hidden"}… · never returned again` : `密钥：${endpoint.secretPrefix ?? "已隐藏"}… · 不会再次返回`}</p>
          </div>

          {secret ? (
            <div className="rounded-xl border border-action/35 bg-action/[0.08] p-4">
              <p className="text-sm font-semibold text-fg">{en ? "Copy this signing secret now" : "请现在复制签名密钥"}</p>
              <p className="mt-1 text-xs text-fg-muted">{en ? "It will disappear when you leave or reload this page." : "离开或刷新本页后，密钥将不再显示。"}</p>
              <div className="mt-3 flex gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-black/25 px-3 py-2.5 text-[11px] text-fg">{secret}</code>
                <button type="button" onClick={() => void copyValue(secret, en ? "Secret" : "密钥")} className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-action/45 px-3 text-xs font-semibold text-action-strong dark:text-action"><Copy className="h-3.5 w-3.5" />{en ? "Copy" : "复制"}</button>
              </div>
            </div>
          ) : null}

          <details className="rounded-xl border border-hairline bg-surface-2/35 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-fg">{en ? "Developer setup" : "开发者接入说明"}</summary>
            <div className="mt-3 space-y-3 text-xs leading-5 text-fg-muted">
              <p>{en ? "Send raw JSON with X-Finfold-Timestamp (Unix seconds) and X-Finfold-Signature. The signature is v1=HMAC_SHA256(secret, timestamp + '.' + raw JSON). Requests older than five minutes are rejected." : "发送原始 JSON，并携带 X-Finfold-Timestamp（Unix 秒）和 X-Finfold-Signature。签名为 v1=HMAC_SHA256(密钥, 时间戳 + '.' + 原始 JSON)。超过五分钟的请求会被拒绝。"}</p>
              <p>{en ? "Use missionId or copy the tracking code from Mission Control. eventId must remain stable across retries; reusing it with changed content is rejected." : "使用 missionId，或从 Mission Control 复制追踪码。重试时 eventId 必须保持不变；同一 eventId 对应不同内容会被拒绝。"}</p>
              <div className="relative">
                <pre className="overflow-x-auto rounded-lg bg-black/25 p-3 text-[11px] leading-5 text-fg"><code>{example}</code></pre>
                <button type="button" onClick={() => void copyValue(example, en ? "Example" : "示例")} className="focus-ring absolute right-2 top-2 rounded-md border border-white/10 bg-black/30 p-1.5 text-fg-muted hover:text-fg" aria-label={en ? "Copy JSON example" : "复制 JSON 示例"}><Copy className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </details>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void createOrRotate()} disabled={saving} className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-lg border border-hairline px-3 py-2 text-xs font-semibold text-fg disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{en ? "Rotate secret" : "轮换密钥"}
            </button>
            <button type="button" onClick={() => void disable()} disabled={saving} className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-lg border border-risk/25 bg-risk/10 px-3 py-2 text-xs font-semibold text-risk disabled:opacity-60">
              <Unlink className="h-3.5 w-3.5" />{en ? "Disable connection" : "停用连接"}
            </button>
          </div>
        </>
      )}

      {settings?.deliveries.length ? (
        <div className="border-t border-hairline pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{en ? "Recent deliveries" : "最近回传"}</p>
          <div className="mt-3 space-y-2">
            {settings.deliveries.slice(0, 5).map((delivery) => (
              <div key={delivery.id} className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-2/35 px-3 py-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${delivery.status === "succeeded" ? "bg-positive" : delivery.status === "failed" ? "bg-risk" : "bg-warning"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-fg">{deliveryLabel(delivery, locale)}</p>
                  <p className="mt-0.5 truncate text-[11px] text-fg-muted">{delivery.source} · {formatTime(delivery.receivedAt, locale)}{delivery.errorCode ? ` · ${delivery.errorCode}` : ""}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {status ? (
        <p role="status" className={`rounded-lg border px-3 py-2.5 text-xs ${status.ok ? "border-positive/30 bg-positive/10 text-positive" : "border-risk/30 bg-risk/10 text-risk"}`}>{status.message}</p>
      ) : null}
    </section>
  );
}

function deliveryLabel(delivery: Delivery, locale: "zh" | "en"): string {
  const type = locale === "en"
    ? { lead: "Lead", signup: "Signup", revenue: "Revenue" }[delivery.eventType]
    : { lead: "线索", signup: "注册", revenue: "收入" }[delivery.eventType];
  const state = locale === "en"
    ? { processing: "processing", succeeded: "accepted", failed: "needs attention" }[delivery.status]
    : { processing: "处理中", succeeded: "已接收", failed: "需要处理" }[delivery.status];
  return `${type} · ${state}`;
}

function formatTime(value: string, locale: "zh" | "en"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en" : "zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
