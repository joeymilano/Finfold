"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Radar, Trash2 } from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { addToast } from "@/components/ui/Toast";
import { useLocale } from "@/hooks/useLocale";

type WatchSource = {
  id: string;
  type: "rss" | "changelog" | "github_releases";
  url: string;
  label: string;
  enabled: boolean;
  last_checked_at: string | null;
};

const copy = {
  zh: {
    title: "更新监测",
    desc: "配置一个 changelog / RSS / GitHub Releases 地址，检测到新内容会自动起草一份全平台内容包。仅数字员工套餐可用。",
    locked: "需要升级到数字员工套餐才能使用更新监测。",
    urlPh: "https://yourproduct.com/changelog.rss",
    labelPh: "备注名称（可选）",
    add: "添加监测",
    empty: "还没有配置任何监测源。",
    delete: "删除",
    lastChecked: "上次检查",
    never: "从未检查",
    addFail: "添加监测源失败。",
    deleteFail: "删除监测源失败。"
  },
  en: {
    title: "Update Monitoring",
    desc: "Configure a changelog / RSS / GitHub Releases URL — a new entry auto-drafts a full content kit for you to review. Digital Employee plan only.",
    locked: "Upgrade to the Digital Employee plan to use update monitoring.",
    urlPh: "https://yourproduct.com/changelog.rss",
    labelPh: "Label (optional)",
    add: "Add source",
    empty: "No watch sources configured yet.",
    delete: "Delete",
    lastChecked: "Last checked",
    never: "Never checked",
    addFail: "Failed to add watch source.",
    deleteFail: "Failed to delete watch source."
  }
} as const;

export function WatchSourcesPanel() {
  const locale = useLocale();
  const c = copy[locale];

  const [available, setAvailable] = useState(false);
  const [sources, setSources] = useState<WatchSource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch("/api/entitlements/check", { method: "POST", cache: "no-store" })
      .then((res) => res.json())
      .then((data: { proactiveMonitoring?: boolean }) => setAvailable(Boolean(data.proactiveMonitoring)))
      .catch(() => undefined);

    fetch("/api/watch-sources", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { sources?: WatchSource[] }) => setSources(data.sources ?? []))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  async function addSource() {
    const trimmed = url.trim();
    if (!trimmed) return;

    setAdding(true);
    try {
      const response = await fetch("/api/watch-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "rss", url: trimmed, label: label.trim() })
      });
      const data = (await response.json()) as { source?: WatchSource; error?: string };
      if (!response.ok || !data.source) {
        throw new Error(data.error ?? c.addFail);
      }
      setSources((current) => [data.source!, ...current]);
      setUrl("");
      setLabel("");
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : c.addFail);
    } finally {
      setAdding(false);
    }
  }

  async function removeSource(id: string) {
    try {
      await fetch(`/api/watch-sources/${id}`, { method: "DELETE" });
      setSources((current) => current.filter((source) => source.id !== id));
    } catch {
      addToast("error", c.deleteFail);
    }
  }

  if (!loaded) {
    return null;
  }

  return (
    <Panel className="p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand">
        <Radar className="h-4 w-4" />
        {c.title}
      </div>
      <p className="mt-2 text-sm leading-6 text-fg-muted">{c.desc}</p>

      {!available ? (
        <p className="mt-3 rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs font-medium text-warn">{c.locked}</p>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2">
            <input
              type="url"
              placeholder={c.urlPh}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="field-input"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={c.labelPh}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="field-input min-w-0 flex-1"
              />
              <button
                type="button"
                onClick={() => void addSource()}
                disabled={adding || url.trim().length === 0}
                className="btn-primary shrink-0 justify-center disabled:opacity-50"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {c.add}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {sources.length === 0 ? (
              <p className="text-sm text-fg-muted">{c.empty}</p>
            ) : (
              sources.map((source) => (
                <div key={source.id} className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">{source.label || source.url}</p>
                    <p className="truncate text-xs text-fg-muted">
                      {c.lastChecked}: {source.last_checked_at ? new Date(source.last_checked_at).toLocaleString() : c.never}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeSource(source.id)}
                    className="rounded-sm p-1.5 text-fg-muted hover:bg-surface hover:text-risk"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
