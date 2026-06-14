"use client";

import Link from "next/link";
import { ArrowRight, Clock, Copy, Download, FileStack, Loader2, WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { ContentKit } from "@/lib/content-schema";
import { getPlatform } from "@/lib/platforms";
import { useLocale } from "@/hooks/useLocale";

function formatRelativeTime(iso: string, locale: "zh" | "en"): string {
  const now = Date.now();
  const diff = now - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (locale === "en") {
    if (mins < 2) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "Yesterday";
    return `${days}d ago`;
  } else {
    if (mins < 2) return "刚刚";
    if (mins < 60) return `${mins} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days === 1) return "昨天";
    return `${days} 天前`;
  }
}

export default function PackagesPage() {
  const locale = useLocale();
  const [kits, setKits] = useState<ContentKit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadKits() {
      try {
        const res = await fetch("/api/kits", { cache: "no-store" });
        const data = (await res.json()) as { kits?: ContentKit[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load kits.");
        setKits(data.kits ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load kits.");
      } finally {
        setIsLoading(false);
      }
    }
    void loadKits();
  }, []);

  const c = locale === "en"
    ? {
        title: "Content Library",
        subtitle: "Your saved growth kits",
        empty: "No kits yet",
        emptyDesc: "Generate your first growth kit from the Workbench.",
        goWorkbench: "Go to Workbench",
        col_kit: "Kit",
        col_platforms: "Platforms",
        col_saved: "Saved",
        col_actions: "Actions",
        copy: "Copy all",
        export: "Export MD",
        view: "View",
        outputs: (n: number) => `${n} output${n !== 1 ? "s" : ""}`,
      }
    : {
        title: "内容库",
        subtitle: "已生成的增长资产包",
        empty: "还没有内容包",
        emptyDesc: "去创作台生成第一个增长资产包。",
        goWorkbench: "前往创作台",
        col_kit: "资产包",
        col_platforms: "平台",
        col_saved: "保存时间",
        col_actions: "操作",
        copy: "复制全部",
        export: "导出 MD",
        view: "查看",
        outputs: (n: number) => `${n} 条内容`,
      };

  function downloadKit(kit: ContentKit) {
    const lines = kit.outputs.map((o) => {
      const p = getPlatform(o.platform);
      return `## ${p.label}\n\n**${o.title}**\n\n${o.body}\n\nCTA: ${o.cta}\n\nNotes: ${o.notes}`;
    });
    const md = `# ${kit.ideaText.slice(0, 60)}\n\n${lines.join("\n\n---\n\n")}`;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kit-${kit.id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyKit(kit: ContentKit) {
    const lines = kit.outputs.map((o) => {
      const p = getPlatform(o.platform);
      return `${p.label}\n${o.title}\n\n${o.body}\n\nCTA: ${o.cta}`;
    });
    await navigator.clipboard.writeText(lines.join("\n\n---\n\n"));
  }

  return (
    <div className="grid gap-6 pb-10">
      <section className="relative overflow-hidden rounded-xl border border-hairline bg-surface p-5 shadow-panel md:p-6">
        <div className="pointer-events-none absolute -right-24 -top-16 h-48 w-64 rounded-full bg-brand/8 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="eyebrow">{c.subtitle}</span>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-fg md:text-3xl">{c.title}</h1>
          </div>
          <Link href="/workbench" className="btn-primary focus-ring cursor-pointer w-fit">
            <WandSparkles className="h-4 w-4" />
            {locale === "en" ? "New Kit" : "生成新资产包"}
          </Link>
        </div>
      </section>

      <section className="panel overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_140px_140px] gap-4 border-b border-hairline bg-surface-2 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-fg-muted max-md:hidden">
          <span>{c.col_kit}</span>
          <span>{c.col_platforms}</span>
          <span>{c.col_saved}</span>
          <span>{c.col_actions}</span>
        </div>

        {isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-fg-muted" />
          </div>
        ) : error ? (
          <div className="flex min-h-[200px] items-center justify-center p-8 text-center">
            <p className="text-sm text-risk">{error}</p>
          </div>
        ) : kits.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-brand shadow-panel">
              <FileStack className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-semibold text-fg">{c.empty}</p>
              <p className="mt-1 text-xs text-fg-muted">{c.emptyDesc}</p>
            </div>
            <Link href="/workbench" className="btn-primary focus-ring cursor-pointer text-sm">
              <WandSparkles className="h-4 w-4" />
              {c.goWorkbench} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          kits.map((kit) => {
            const platformLabels = kit.platforms
              .slice(0, 3)
              .map((pid) => {
                try { return getPlatform(pid).shortLabel; } catch { return pid; }
              });
            const extra = kit.platforms.length - 3;

            return (
              <article
                key={kit.id}
                className="grid gap-3 border-b border-hairline px-5 py-4 last:border-b-0 transition-colors hover:bg-surface-2 md:grid-cols-[1fr_auto_140px_140px] md:items-center"
              >
                {/* Kit info */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-fg">
                      {kit.ideaText.length > 72 ? kit.ideaText.slice(0, 72).trim() + "…" : kit.ideaText}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">{c.outputs(kit.outputs.length)}</p>
                </div>

                {/* Platforms */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {platformLabels.map((label) => (
                    <span key={label} className="tag tag-neutral text-[10px]">{label}</span>
                  ))}
                  {extra > 0 && (
                    <span className="tag tag-neutral text-[10px]">+{extra}</span>
                  )}
                </div>

                {/* Time */}
                <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <Clock className="h-3 w-3 shrink-0" />
                  {formatRelativeTime(kit.createdAt, locale)}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyKit(kit)}
                    title={c.copy}
                    className="btn-ghost focus-ring cursor-pointer px-2.5 py-1.5 text-xs"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadKit(kit)}
                    title={c.export}
                    className="btn-ghost focus-ring cursor-pointer px-2.5 py-1.5 text-xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <Link
                    href={`/kits/${kit.id}`}
                    className="btn-ghost focus-ring cursor-pointer px-2.5 py-1.5 text-xs font-semibold"
                  >
                    {c.view}
                  </Link>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
