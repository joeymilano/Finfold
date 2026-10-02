"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, PlugZap, Trash2 } from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { useLocale } from "@/hooks/useLocale";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";

type LocalDevice = {
  id: string;
  device_name: string;
  version: string | null;
  capabilities: Record<string, unknown> | null;
  last_seen: string | null;
  created_at: string;
};

/**
 * LocalDevicesTab — manage Finfold Local (the on-device collector companion).
 * A device key is created once and shown once; the user pastes it into the
 * Finfold Local console. Deleting a device revokes its key immediately.
 */
export function LocalDevicesTab() {
  const locale = useLocale();
  const [devices, setDevices] = useState<LocalDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const copy = locale === "en" ? {
    eyebrow: "LOCAL DEVICE",
    title: "Let your own Mac collect for Finfold",
    desc: "Add this Mac once. Finfold Local reads platforms with your own login kept on that machine, then returns only the collected content — your account credentials never leave the device.",
    namePlaceholder: "Device name, e.g. Joey's Mac",
    create: "Add device",
    createBusy: "Adding…",
    oneTime: "Copy this device key now. It will not be shown again.",
    copied: "Copied",
    copy: "Copy",
    active: "Linked devices",
    online: "Online",
    offline: "Offline",
    remove: "Remove",
    empty: "No local device linked yet. Add one when Finfold Local is installed.",
    failed: "Could not manage local devices. Please retry.",
    nextStep: "Next: open Finfold Local on this Mac → SaaS bridge → paste the key"
  } : {
    eyebrow: "本地设备",
    title: "让你自己的 Mac 替 Finfold 采集",
    desc: "添加一次这台 Mac。Finfold Local 用留在本机的登录态读取各平台，只把采集到的内容传回来，账号凭据不离开你的电脑",
    namePlaceholder: "设备名称，如 Joey 的 Mac",
    create: "添加设备",
    createBusy: "添加中…",
    oneTime: "请现在复制设备密钥：关闭后不会再次显示",
    copied: "已复制",
    copy: "复制",
    active: "已连接的设备",
    online: "在线",
    offline: "离线",
    remove: "移除",
    empty: "还没有连接本地设备。装好 Finfold Local 后再来添加",
    failed: "本地设备操作失败，请重试",
    nextStep: "下一步：在这台 Mac 打开 Finfold Local → SaaS 云桥 → 粘贴密钥"
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("local_devices")
        .select("id, device_name, version, capabilities, last_seen, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      setDevices(data ?? []);
    } catch {
      setStatus(copy.failed);
    } finally {
      setLoading(false);
    }
  }, [copy.failed]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addDevice() {
    if (creating) return;
    setCreating(true);
    setCopied(false);
    setStatus(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("create_local_device", {
        p_name: name.trim() || null,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      setNewKey(row?.device_key ?? null);
      setName("");
      await load();
    } catch {
      setStatus(copy.failed);
    } finally {
      setCreating(false);
    }
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
  }

  async function removeDevice(id: string) {
    setStatus(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("local_devices").delete().eq("id", id);
      if (error) throw new Error(error.message);
      setDevices((current) => current.filter((device) => device.id !== id));
    } catch {
      setStatus(copy.failed);
    }
  }

  function isOnline(lastSeen: string | null) {
    if (!lastSeen) return false;
    return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
  }

  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-hairline p-6">
        <div className="flex items-center gap-2 text-fg-muted">
          <PlugZap className="h-4 w-4" />
          <p className="text-xs font-semibold uppercase tracking-wider">{copy.eyebrow}</p>
        </div>
        <h2 className="mt-2 text-xl font-bold text-fg">{copy.title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">{copy.desc}</p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={copy.namePlaceholder}
            maxLength={40}
            className="focus-ring min-h-10 flex-1 rounded-lg border border-hairline bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
          />
          <button
            type="button"
            onClick={() => void addDevice()}
            disabled={creating}
            className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] disabled:opacity-60 dark:text-action"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {creating ? copy.createBusy : copy.create}
          </button>
        </div>

        {newKey ? (
          <div className="mt-4 rounded-lg border border-action/45 bg-action/[0.06] p-4">
            <p className="text-sm font-semibold text-fg">{copy.oneTime}</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md border border-hairline bg-surface px-3 py-2 text-xs text-fg">{newKey}</code>
              <button
                type="button"
                onClick={() => void copyKey()}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-2 text-xs font-semibold text-fg hover:bg-surface"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? copy.copied : copy.copy}
              </button>
            </div>
            <p className="mt-2 text-xs text-fg-muted">{copy.nextStep}</p>
          </div>
        ) : null}

        {status ? <p className="mt-3 text-sm text-danger">{status}</p> : null}
      </div>

      <div className="p-6">
        <p className="text-sm font-semibold text-fg">{copy.active}</p>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-fg-muted" /></div>
        ) : devices.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">{copy.empty}</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {devices.map((device) => (
              <li key={device.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{device.device_name}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {new Date(device.created_at).toLocaleDateString()}
                    {device.version ? ` · v${device.version}` : ""}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    isOnline(device.last_seen)
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "border-hairline bg-surface text-fg-muted"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${isOnline(device.last_seen) ? "bg-emerald-500" : "bg-fg-muted"}`} />
                  {isOnline(device.last_seen) ? copy.online : copy.offline}
                </span>
                <button
                  type="button"
                  onClick={() => void removeDevice(device.id)}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-semibold text-fg-muted transition hover:border-danger/40 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {copy.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
