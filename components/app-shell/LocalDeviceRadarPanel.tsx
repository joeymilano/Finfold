"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Radar, Send } from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { useLocale } from "@/hooks/useLocale";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";

type LocalDevice = { id: string; device_name: string; last_seen: string | null };
type RadarItem = { platform: string; title: string; url?: string; score?: number; why?: string };
type TaskRow = {
  status: "pending" | "claimed" | "done" | "failed";
  result: { items?: RadarItem[]; per_platform?: Record<string, number>; content_gaps?: string[]; error?: string } | null;
};

const CHANNEL_OPTIONS = [
  { key: "bilibili_search", labelZh: "B站", labelEn: "Bilibili" },
  { key: "v2ex_hot", labelZh: "V2EX", labelEn: "V2EX" },
  { key: "github_search", labelZh: "GitHub", labelEn: "GitHub" },
  { key: "rss_read", labelZh: "RSS", labelEn: "RSS" },
];

/**
 * LocalDeviceRadarPanel — dispatch a radar run to the user's linked
 * Finfold Local device and show the returned candidates inline.
 * The task travels through local_tasks; polling stops on terminal states.
 */
export function LocalDeviceRadarPanel() {
  const locale = useLocale();
  const [devices, setDevices] = useState<LocalDevice[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [topic, setTopic] = useState("");
  const [channels, setChannels] = useState<string[]>(CHANNEL_OPTIONS.map((c) => c.key));
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const copy = locale === "en" ? {
    eyebrow: "LOCAL COLLECTION",
    title: "Scan with your own device",
    desc: "Run the same topic through Finfold Local on your Mac — it reads platforms with the login kept on that machine and returns only the content",
    device: "Device",
    topicPlaceholder: "Topic, e.g. AI video generation",
    run: "Scan on device",
    runBusy: "Dispatching…",
    queued: "Queued on the device",
    running: "Collecting on your Mac",
    done: "Candidates returned",
    failed: "Run failed",
    gaps: "Low-competition signals",
    setup: "No device linked yet — add one in Settings, then scan here",
    settingsLink: "Go to Settings",
    failedShort: "Failed"
  } : {
    eyebrow: "本地采集",
    title: "用自己的设备扫一遍",
    desc: "同一个主题交给这台 Mac 上的 Finfold Local 扫——它用留在本机的登录态读取平台，只回传内容",
    device: "设备",
    topicPlaceholder: "主题，如 AI 视频生成",
    run: "在设备上扫描",
    runBusy: "下发中…",
    queued: "已排队，等待设备认领",
    running: "Mac 正在采集",
    done: "候选已回传",
    failed: "运行失败",
    gaps: "低竞争信号",
    setup: "还没有连接本地设备——先到设置里添加，再回来扫描",
    settingsLink: "去设置",
    failedShort: "失败"
  };

  const loadDevices = useCallback(async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from("local_devices")
        .select("id, device_name, last_seen")
        .order("created_at", { ascending: false });
      setDevices(data ?? []);
      setDeviceId((current) => current || (data && data.length > 0 ? data[0].id : ""));
    } catch {
      /* device list is best-effort; the empty state guides setup */
    }
  }, []);

  useEffect(() => {
    void loadDevices();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadDevices]);

  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from("local_tasks")
        .select("status, result")
        .eq("id", id)
        .single();
      if (data) {
        setTask(data as TaskRow);
        if ((data as TaskRow).status === "done" || (data as TaskRow).status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }
    }, 3000);
  }

  async function dispatch() {
    if (busy || !deviceId || topic.trim().length < 2) return;
    setBusy(true);
    setError(null);
    setTask(null);
    setTaskId(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: rpcError } = await supabase.rpc("create_local_task", {
        p_device_id: deviceId,
        p_type: "radar",
        p_payload: { topic: topic.trim(), actions: channels },
      });
      if (rpcError) throw new Error(rpcError.message);
      setTask({ status: "pending", result: null });
      setTaskId(data as string);
      startPolling(data as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
    } finally {
      setBusy(false);
    }
  }

  const items = task?.result?.items ?? [];
  const gaps = task?.result?.content_gaps ?? [];
  const running = task && (task.status === "pending" || task.status === "claimed");

  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-hairline p-6">
        <div className="flex items-center gap-2 text-fg-muted">
          <Radar className="h-4 w-4" />
          <p className="text-xs font-semibold uppercase tracking-wider">{copy.eyebrow}</p>
        </div>
        <h2 className="mt-2 text-xl font-bold text-fg">{copy.title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">{copy.desc}</p>
      </div>

      {devices.length === 0 ? (
        <div className="flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-fg-muted">{copy.setup}</p>
          <Link
            href="/settings?tab=local"
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-action/45 bg-action/[0.08] px-3.5 py-2 text-sm font-semibold text-action-strong dark:text-action"
          >
            {copy.settingsLink}
          </Link>
        </div>
      ) : (
        <div className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              {copy.device}
              <select
                value={deviceId}
                onChange={(event) => setDeviceId(event.target.value)}
                className="focus-ring min-h-10 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-fg"
              >
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>{device.device_name}</option>
                ))}
              </select>
            </label>
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder={copy.topicPlaceholder}
              maxLength={60}
              className="focus-ring min-h-10 flex-1 rounded-lg border border-hairline bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
            />
            <button
              type="button"
              onClick={() => void dispatch()}
              disabled={busy || topic.trim().length < 2 || channels.length === 0}
              className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] disabled:opacity-60 dark:text-action"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy ? copy.runBusy : copy.run}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {CHANNEL_OPTIONS.map((channel) => {
              const active = channels.includes(channel.key);
              return (
                <button
                  key={channel.key}
                  type="button"
                  onClick={() =>
                    setChannels((current) =>
                      current.includes(channel.key)
                        ? current.filter((key) => key !== channel.key)
                        : [...current, channel.key]
                    )
                  }
                  className={`focus-ring rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    active
                      ? "border-action/45 bg-action/[0.08] text-action-strong dark:text-action"
                      : "border-hairline bg-surface text-fg-muted hover:text-fg"
                  }`}
                >
                  {locale === "en" ? channel.labelEn : channel.labelZh}
                </button>
              );
            })}
          </div>

          {taskId && task ? (
            <div className="mt-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                {running ? <Loader2 className="h-4 w-4 animate-spin text-fg-muted" /> : null}
                {task.status === "pending" ? copy.queued
                  : task.status === "claimed" ? copy.running
                  : task.status === "done" ? copy.done
                  : copy.failed}
              </p>
              {task.status === "done" && items.length > 0 ? (
                <>
                  {gaps.length > 0 ? (
                    <p className="mt-2 text-xs text-fg-muted">
                      {copy.gaps}: {gaps.join(" · ")}
                    </p>
                  ) : null}
                  <ul className="mt-3 grid gap-2">
                    {items.slice(0, 10).map((item, index) => (
                      <li key={`${item.platform}-${index}`} className="rounded-lg border border-hairline p-3">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-bold text-action-strong dark:text-action">{item.score ?? "-"}</span>
                          {item.url ? (
                            <a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-fg hover:underline">
                              {item.title}
                            </a>
                          ) : (
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{item.title}</span>
                          )}
                          <span className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-xs text-fg-muted">{item.platform}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {task.status === "failed" ? (
                <p className="mt-2 text-sm text-danger">{task.result?.error ?? copy.failed}</p>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        </div>
      )}
    </Panel>
  );
}
