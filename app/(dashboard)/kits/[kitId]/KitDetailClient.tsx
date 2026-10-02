"use client";

import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw } from "@/components/ui/icons";
import { useEffect, useState } from "react";
import { KitLifecycle } from "@/components/workbench/KitLifecycle";
import { GrowthMissionBanner } from "@/components/workbench/GrowthMissionBanner";
import { OutputBoard } from "@/components/workbench/OutputBoard";
import { PerformancePanel } from "@/components/workbench/PerformancePanel";
import { ShareKitButton } from "@/components/workbench/ShareKitButton";
import { useLocale } from "@/hooks/useLocale";
import type { ContentKit } from "@/lib/content-schema";
import { getGoal } from "@/lib/goals";
import { summarizeSignal } from "@/lib/kit-lifecycle";
import { captureEvent } from "@/lib/posthog";

export default function KitDetailClient({ params }: { params: Promise<{ kitId: string }> }) {
  const locale = useLocale();
  const [kitId, setKitId] = useState<string | null>(null);
  const [kit, setKit] = useState<ContentKit | null>(null);
  const [canPolish, setCanPolish] = useState(false);
  const [canAnalyze, setCanAnalyze] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void params.then((value) => setKitId(value.kitId));
  }, [params]);

  useEffect(() => {
    if (!kitId) {
      return;
    }

    let cancelled = false;
    async function loadKit() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/kits/${encodeURIComponent(kitId!)}`, { cache: "no-store" });
        const data = (await response.json()) as { kit?: ContentKit; error?: string };
        if (!response.ok || !data.kit) {
          const localizedError = response.status === 401
            ? (locale === "en" ? "Please log in to view this content kit." : "请先登录后查看此内容包。")
            : response.status === 404
              ? (locale === "en" ? "This content kit was not found." : "未找到这个内容包，它可能已被删除。")
              : (data.error ?? (locale === "en" ? "Failed to load content kit." : "内容包加载失败，请稍后重试。"));
          throw new Error(localizedError);
        }
        if (cancelled) return;
        setKit(data.kit);
        captureEvent("kit_detail_viewed", {
          outputCount: data.kit.outputs.length,
          postedCount: data.kit.outputs.filter((output) => ["posted", "measured", "iterated"].includes(output.publishStatus)).length
        });
      } catch (caught) {
        if (cancelled) return;
        setKit(null);
        setError(caught instanceof Error ? caught.message : "Failed to load content kit.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadKit();

    fetch("/api/entitlements/check", { method: "POST", cache: "no-store" })
      .then((res) => res.json())
      .then((data: { polish?: boolean; canAnalyze?: boolean }) => {
        setCanPolish(Boolean(data.polish));
        setCanAnalyze(Boolean(data.canAnalyze));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [kitId, locale, reloadKey]);

  const goal = kit ? getGoal(kit.goal) : null;

  return (
    <div className="grid gap-5">
      <Link href="/workbench" className="inline-flex items-center gap-2 text-sm font-semibold text-fg-muted">
        <ArrowLeft className="h-4 w-4" />
        {locale === "en" ? "Back to workbench" : "返回创作台"}
      </Link>
      {isLoading ? (
        <div className="panel flex min-h-[260px] items-center justify-center gap-3 p-6 text-sm font-semibold text-fg-muted" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-action" />
          {locale === "en" ? "Loading your content kit…" : "正在加载内容包…"}
        </div>
      ) : kit && goal ? (
        <>
          {kit.growthMissionId ? (
            <GrowthMissionBanner missionId={kit.growthMissionId} locale={locale} />
          ) : null}
          <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-fg-muted">{locale === "en" ? goal.labelEn : goal.label}</p>
              <h1 className="mt-2 text-2xl font-semibold leading-tight text-fg">{summarizeSignal(kit.ideaText, 140)}</h1>
              <p className="mt-3 text-sm text-fg-muted">
                {locale === "en"
                  ? `${kit.outputs.length} outputs · ${new Date(kit.createdAt).toLocaleString()}`
                  : `${kit.outputs.length} 个输出 · ${new Date(kit.createdAt).toLocaleString()}`}
              </p>
            </div>
            <ShareKitButton kitId={kit.id} locale={locale} />
          </div>
          <KitLifecycle kit={kit} locale={locale} />
          <OutputBoard
            outputs={kit.outputs}
            isLoading={false}
            error={null}
            locale={locale}
            canUseOutputs
            canPolish={canPolish}
            kitId={kit.id}
            growthMissionId={kit.growthMissionId}
            referenceImageUrl={kit.mediaAssets.find((asset) => asset.type === "image" && asset.url)?.url}
            onOutputSaved={(platform, patch) => {
              setKit((current) =>
                current
                  ? { ...current, outputs: current.outputs.map((o) => (o.platform === platform ? { ...o, ...patch } : o)) }
                  : current
              );
            }}
          />
          <PerformancePanel
            kit={kit}
            locale={locale}
            canAnalyze={canAnalyze}
          />
        </>
      ) : (
        <div className="panel grid min-h-[260px] place-items-center p-6 text-center">
          <div className="max-w-md">
            <p className="text-sm font-semibold text-fg">
              {locale === "en" ? "This content kit could not be opened" : "暂时无法打开这个内容包"}
            </p>
            <p className="mt-2 text-sm leading-6 text-fg-muted">
              {error ?? (locale === "en" ? "It may have been removed or belong to another account." : "它可能已被删除，或属于其他账号。")}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2.5 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] dark:text-action">
                <RefreshCw className="h-4 w-4" />
                {locale === "en" ? "Try again" : "重新加载"}
              </button>
              <Link href="/packages" className="btn-ghost focus-ring text-sm">
                {locale === "en" ? "Open content library" : "返回内容库"}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
