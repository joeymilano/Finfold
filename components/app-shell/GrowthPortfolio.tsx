"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Check,
  Copy,
  Download,
  Eye,
  Gauge,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  Share2,
  Sparkles,
  Target,
  Trash2,
  X
} from "@/components/ui/icons";
import { PlatformBrandIcon, PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/cn";
import { exportCoverPngToDataUrl } from "@/lib/cover/cover-export";
import {
  GROWTH_PLATFORM_IDS,
  type GrowthPortfolioAccount,
  type GrowthPortfolioOverview
} from "@/lib/growth-portfolio";
import {
  GROWTH_SHARE_CHANNELS,
  buildGrowthShareCaption,
  buildGrowthShareIntent,
  type GrowthShareChannel
} from "@/lib/growth-share";
import { getLocalizedPlatformLabel, type PlatformId } from "@/lib/platforms";

type OverviewResponse = {
  overview?: GrowthPortfolioOverview;
  persisted?: boolean;
  error?: string;
};

type ChartPoint = { date: string; value: number };

const compactNumber = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });
const fullNumber = new Intl.NumberFormat("zh-CN");
const MASK = "•••••";

function formatMetric(value: number | null, signed = false): string {
  if (value === null) return "—";
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${Math.abs(value) >= 100_000 ? compactNumber.format(value) : fullNumber.format(value)}`;
}

function formatRelativeTime(iso: string, locale: "zh" | "en"): string {
  const elapsed = Date.now() - Date.parse(iso);
  if (!Number.isFinite(elapsed) || elapsed < 0) return locale === "en" ? "just now" : "刚刚";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return locale === "en" ? "just now" : "刚刚";
  if (minutes < 60) return locale === "en" ? `${minutes}m ago` : `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "en" ? `${hours}h ago` : `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return locale === "en" ? `${days}d ago` : `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return locale === "en" ? `${months}mo ago` : `${months} 个月前`;
  return locale === "en" ? `${Math.floor(months / 12)}y ago` : `${Math.floor(months / 12)} 年前`;
}

function formatDate(value: string, locale: "zh" | "en"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    month: "short",
    day: "numeric"
  }).format(new Date(`${value}T00:00:00Z`));
}

function filterChartRange(points: ChartPoint[], days: number): ChartPoint[] {
  if (!points.length || days <= 0) return points;
  const last = Date.parse(`${points[points.length - 1].date}T00:00:00Z`);
  const threshold = last - (days - 1) * 24 * 60 * 60 * 1000;
  return points.filter((point) => Date.parse(`${point.date}T00:00:00Z`) >= threshold);
}

const CHART_PAD = { top: 24, right: 22, bottom: 34, left: 18 } as const;

function buildChartScales(points: ChartPoint[], width: number, height: number) {
  const innerWidth = width - CHART_PAD.left - CHART_PAD.right;
  const innerHeight = height - CHART_PAD.top - CHART_PAD.bottom;
  const values = points.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(1, rawMax - rawMin);
  const min = rawMin - spread * 0.16;
  const max = rawMax + spread * 0.18;
  return {
    innerWidth,
    innerHeight,
    x: (index: number) => CHART_PAD.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth),
    y: (value: number) => CHART_PAD.top + (1 - (value - min) / (max - min)) * innerHeight
  };
}

function GrowthLineChart({
  points,
  days,
  locale,
  ariaLabel,
  masked = false
}: {
  points: ChartPoint[];
  days: number;
  locale: "zh" | "en";
  ariaLabel: string;
  masked?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const visiblePoints = useMemo(() => filterChartRange(points, days), [days, points]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = chartRef.current;
    if (!canvas || !container || visiblePoints.length === 0) return;
    let frame = 0;
    let animationFrame = 0;
    const duration = 760;

    const draw = (progress: number) => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(320, rect.width);
      const height = Math.max(220, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const { x, y, innerWidth } = buildChartScales(visiblePoints, width, height);

      context.lineWidth = 1;
      context.strokeStyle = "rgba(255, 255, 255, 0.07)";
      for (let grid = 0; grid < 4; grid += 1) {
        const gridY = CHART_PAD.top + (innerHeight / 3) * grid;
        context.beginPath();
        context.moveTo(CHART_PAD.left, gridY);
        context.lineTo(width - CHART_PAD.right, gridY);
        context.stroke();
      }

      const count = Math.max(1, Math.ceil(visiblePoints.length * progress));
      const renderPoints = visiblePoints.slice(0, count);
      if (renderPoints.length > 1) {
        const traceArea = () => {
          context.beginPath();
          context.moveTo(x(0), height - CHART_PAD.bottom);
          renderPoints.forEach((point, index) => context.lineTo(x(index), y(point.value)));
          context.lineTo(x(renderPoints.length - 1), height - CHART_PAD.bottom);
          context.closePath();
        };

        // Soft gradient body under the curve.
        const area = context.createLinearGradient(0, CHART_PAD.top, 0, height - CHART_PAD.bottom);
        area.addColorStop(0, "rgba(242, 190, 88, 0.20)");
        area.addColorStop(0.55, "rgba(217, 164, 65, 0.05)");
        area.addColorStop(1, "rgba(217, 164, 65, 0)");
        traceArea();
        context.fillStyle = area;
        context.fill();

        // OKX-style halftone dots, clipped to the area and fading away from the line.
        const lineYAt = (px: number) => {
          const t = Math.max(0, Math.min(renderPoints.length - 1, ((px - CHART_PAD.left) / innerWidth) * (renderPoints.length - 1)));
          const i0 = Math.floor(t);
          const i1 = Math.min(renderPoints.length - 1, i0 + 1);
          const frac = t - i0;
          return y(renderPoints[i0].value) * (1 - frac) + y(renderPoints[i1].value) * frac;
        };
        context.save();
        traceArea();
        context.clip();
        const gap = 13;
        for (let row = 0; ; row += 1) {
          const dotY = CHART_PAD.top + gap * 0.5 + row * gap;
          if (dotY > height - CHART_PAD.bottom + gap) break;
          for (let dotX = CHART_PAD.left + gap * 0.5 + ((row % 2) * gap) / 2; dotX <= width - CHART_PAD.right + gap; dotX += gap) {
            const lineY = lineYAt(dotX);
            if (dotY <= lineY) continue;
            const depth = Math.min(1, (dotY - lineY) / Math.max(56, height - CHART_PAD.bottom - lineY));
            const alpha = 0.62 * Math.pow(1 - depth, 1.7);
            if (alpha <= 0.03) continue;
            context.beginPath();
            context.arc(dotX, dotY, 1.6, 0, Math.PI * 2);
            context.fillStyle = `rgba(243, 196, 106, ${alpha})`;
            context.fill();
          }
        }
        context.restore();

        context.save();
        context.shadowBlur = 18;
        context.shadowColor = "rgba(245, 190, 77, 0.62)";
        context.lineWidth = 3;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.strokeStyle = "#f2bd58";
        context.beginPath();
        renderPoints.forEach((point, index) => {
          if (index === 0) context.moveTo(x(index), y(point.value));
          else context.lineTo(x(index), y(point.value));
        });
        context.stroke();
        context.restore();
      }

      const lastIndex = renderPoints.length - 1;
      const lastPoint = renderPoints[lastIndex];
      if (lastPoint) {
        context.beginPath();
        context.arc(x(lastIndex), y(lastPoint.value), 5, 0, Math.PI * 2);
        context.fillStyle = "#f9d88b";
        context.shadowBlur = 20;
        context.shadowColor = "#e5ad48";
        context.fill();
        context.shadowBlur = 0;
      }

      const tickIndexes = visiblePoints.length > 2
        ? [0, Math.floor((visiblePoints.length - 1) / 2), visiblePoints.length - 1]
        : visiblePoints.map((_, index) => index);
      context.font = "600 11px var(--font-geist-sans), sans-serif";
      context.fillStyle = "rgba(244, 241, 234, 0.48)";
      context.textBaseline = "bottom";
      tickIndexes.forEach((index, tick) => {
        context.textAlign = tick === 0 ? "left" : tick === tickIndexes.length - 1 ? "right" : "center";
        context.fillText(formatDate(visiblePoints[index].date, locale), x(index), height - 4);
      });
    };

    const animate = (timestamp: number) => {
      if (!frame) frame = timestamp;
      const progress = Math.min(1, (timestamp - frame) / duration);
      draw(1 - Math.pow(1 - progress, 3));
      if (progress < 1) animationFrame = window.requestAnimationFrame(animate);
    };
    animationFrame = window.requestAnimationFrame(animate);
    const syncSize = () => {
      const rect = container.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    syncSize();
    const observer = new ResizeObserver(() => {
      draw(1);
      syncSize();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [locale, visiblePoints]);

  const hovered = hoveredIndex === null ? null : visiblePoints[hoveredIndex];
  const overlayWidth = Math.max(320, size.width);
  const overlayHeight = Math.max(220, size.height);
  const scales = size.width > 0 && visiblePoints.length > 0 ? buildChartScales(visiblePoints, overlayWidth, overlayHeight) : null;
  const hoveredX = scales && hoveredIndex !== null ? scales.x(hoveredIndex) : null;
  const hoveredY = scales && hovered ? scales.y(hovered.value) : null;
  const delta = hoveredIndex !== null && hoveredIndex > 0 && hovered ? hovered.value - visiblePoints[hoveredIndex - 1].value : null;

  return (
    <div
      ref={chartRef}
      className="relative h-[250px] w-full cursor-crosshair overflow-hidden sm:h-[300px]"
      onPointerMove={(event) => {
        if (!visiblePoints.length) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const position = Math.max(
          0,
          Math.min(
            1,
            (event.clientX - rect.left - CHART_PAD.left) / Math.max(1, rect.width - CHART_PAD.left - CHART_PAD.right)
          )
        );
        setHoveredIndex(Math.round(position * (visiblePoints.length - 1)));
      }}
      onPointerLeave={() => setHoveredIndex(null)}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        className="h-full w-full touch-pan-y"
      />
      {hovered && hoveredX !== null && hoveredY !== null ? (
        <>
          <div
            className="pointer-events-none absolute w-px bg-white/30"
            style={{ left: hoveredX, top: CHART_PAD.top - 8, height: overlayHeight - CHART_PAD.top - CHART_PAD.bottom + 8 }}
          />
          <div
            className="pointer-events-none absolute grid h-[12px] w-[12px] -translate-x-1/2 -translate-y-1/2 place-items-center"
            style={{ left: hoveredX, top: hoveredY }}
          >
            <span className="absolute inline-block h-full w-full rounded-full bg-[#f6d487]/25 blur-[3px]" />
            <span className="relative inline-block h-[8px] w-[8px] rounded-full border-2 border-[#0b0a08] bg-[#f6d487]" />
          </div>
          <div
            className="pointer-events-none absolute top-4 min-w-[132px] -translate-x-1/2 rounded-xl border border-white/10 bg-[#0a0908]/92 px-3.5 py-2.5 text-center shadow-2xl backdrop-blur-xl"
            style={{ left: Math.min(Math.max(hoveredX, 96), Math.max(96, overlayWidth - 96)) }}
          >
            <p className="text-[10px] font-semibold text-white/50">{formatDate(hovered.date, locale)}</p>
            <p className="mt-1 text-base font-bold tracking-[-0.02em] text-[#f6d487]">{masked ? MASK : formatMetric(hovered.value)}</p>
            {delta !== null ? (
              <p className={cn("mt-0.5 text-[10px] font-semibold", delta >= 0 ? "text-[#edca82]/80" : "text-risk")}>
                {locale === "en" ? "vs prev" : "较上次"} {masked ? MASK : formatMetric(delta, true)}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-0 backdrop-blur-md sm:items-center sm:p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#12100d] shadow-[0_30px_100px_rgba(0,0,0,.72)] sm:rounded-[28px]",
          wide ? "sm:max-w-4xl" : "sm:max-w-xl"
        )}
        initial={{ y: 36, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-[#12100d]/95 px-5 py-4 backdrop-blur-xl">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button type="button" aria-label={`Close ${title}`} onClick={onClose} className="focus-ring grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

const fieldClass = "focus-ring h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#d9a441]/60";

function AccountEditor({
  account,
  locale,
  onSaved,
  onClose
}: {
  account: GrowthPortfolioAccount | null;
  locale: "zh" | "en";
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [platform, setPlatform] = useState<PlatformId>(account?.platform ?? "xiaohongshu");
  const [displayName, setDisplayName] = useState(account?.displayName ?? "");
  const [handle, setHandle] = useState(account?.handle ?? "");
  const [followers, setFollowers] = useState(account?.followerCount?.toString() ?? "");
  const [growth, setGrowth] = useState(account?.periodFollowerGrowth?.toString() ?? "");
  const [views, setViews] = useState(account?.views?.toString() ?? "");
  const [leads, setLeads] = useState(account?.leads?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/overview/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: account?.id ?? null,
          platform,
          displayName,
          handle: handle || null,
          followerCount: Number(followers),
          periodFollowerGrowth: growth === "" ? null : Number(growth),
          views: views === "" ? null : Number(views),
          leads: leads === "" ? null : Number(leads)
        })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || (locale === "en" ? "Unable to save account data." : "暂时无法保存账号数据。"));
      await onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (locale === "en" ? "Unable to save account data." : "暂时无法保存账号数据。"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5 p-5 sm:p-6">
      <p className="text-sm leading-6 text-white/55">
        {locale === "en"
          ? "Enter the numbers shown in the platform’s own analytics. Finfold keeps every update as a real snapshot."
          : "填写平台后台看到的真实数字。以后每次更新都会保留为真实快照。"}
      </p>
      <label className="grid gap-2 text-xs font-semibold text-white/58">
        {locale === "en" ? "Platform" : "平台"}
        <select value={platform} onChange={(event) => setPlatform(event.target.value as PlatformId)} className={fieldClass}>
          {GROWTH_PLATFORM_IDS.map((id) => <option key={id} value={id}>{getLocalizedPlatformLabel(id, locale)}</option>)}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-xs font-semibold text-white/58">
          {locale === "en" ? "Account name" : "账号名称"}
          <input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={locale === "en" ? "e.g. Finfold" : "例如：Finfold 官方号"} className={fieldClass} />
        </label>
        <label className="grid gap-2 text-xs font-semibold text-white/58">
          {locale === "en" ? "Handle (optional)" : "账号 ID（可选）"}
          <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@finfold" className={fieldClass} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-xs font-semibold text-white/58">
          {locale === "en" ? "Current followers" : "当前粉丝数"}
          <input required min="0" step="1" inputMode="numeric" type="number" value={followers} onChange={(event) => setFollowers(event.target.value)} placeholder="0" className={fieldClass} />
        </label>
        <label className="grid gap-2 text-xs font-semibold text-white/58">
          {locale === "en" ? "New followers this month" : "本月新增粉丝"}
          <input step="1" inputMode="numeric" type="number" value={growth} onChange={(event) => setGrowth(event.target.value)} placeholder={locale === "en" ? "Optional" : "可稍后补充"} className={fieldClass} />
        </label>
      </div>
      <details className="group rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3">
        <summary className="cursor-pointer text-xs font-semibold text-white/48">
          {locale === "en" ? "Optional: views and leads" : "可选：阅读量和线索"}
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-xs font-semibold text-white/58">
            {locale === "en" ? "Views this month" : "本月阅读量"}
            <input min="0" step="1" inputMode="numeric" type="number" value={views} onChange={(event) => setViews(event.target.value)} className={fieldClass} />
          </label>
          <label className="grid gap-2 text-xs font-semibold text-white/58">
            {locale === "en" ? "Leads this month" : "本月有效线索"}
            <input min="0" step="1" inputMode="numeric" type="number" value={leads} onChange={(event) => setLeads(event.target.value)} className={fieldClass} />
          </label>
        </div>
      </details>
      {error ? <p className="rounded-xl border border-risk/25 bg-risk/10 px-3 py-2 text-xs text-risk">{error}</p> : null}
      <button disabled={saving} className="focus-ring flex h-12 items-center justify-center gap-2 rounded-xl bg-[#e1aa43] text-sm font-bold text-[#171106] shadow-[0_14px_32px_rgba(217,164,65,.23)] transition hover:bg-[#efbd5b] disabled:opacity-55">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {account ? (locale === "en" ? "Save new snapshot" : "保存这次更新") : (locale === "en" ? "Add this account" : "添加这个账号")}
      </button>
    </form>
  );
}

type OfficialSyncResponse = {
  synced?: number;
  failed?: number;
  error?: string;
  results?: Array<{
    connectorId: string;
    accountLabel: string | null;
    status: "synced" | "failed" | "skipped";
    error: string | null;
  }>;
};

/** Builds the one-line sync outcome, appending each failure's server reason. */
function formatOfficialSyncMessage(payload: OfficialSyncResponse, locale: "zh" | "en"): string {
  const failed = payload.failed ?? 0;
  const failures = (payload.results ?? [])
    .filter((result) => result.status === "failed" && result.error)
    .map((result) => `${result.accountLabel ?? result.connectorId}: ${result.error}`)
    .join(locale === "en" ? "; " : "；");
  const base = failed > 0
    ? (locale === "en" ? `Synced ${payload.synced ?? 0} accounts; ${failed} failed.` : `已同步 ${payload.synced ?? 0} 个账号，${failed} 个失败。`)
    : (locale === "en" ? `Synced ${payload.synced ?? 0} accounts.` : `已同步 ${payload.synced ?? 0} 个账号。`);
  return failures ? `${base}${locale === "en" ? " " : ""}${failures}` : base;
}

function ManageAccountsDialog({
  accounts,
  locale,
  onAdd,
  onEdit,
  onRemoved,
  onRefreshed
}: {
  accounts: GrowthPortfolioAccount[];
  locale: "zh" | "en";
  onAdd: () => void;
  onEdit: (account: GrowthPortfolioAccount) => void;
  onRemoved: () => Promise<void>;
  onRefreshed: () => Promise<void>;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const hasOfficialAccounts = accounts.some((account) => account.source === "official_sync");

  const removeAccount = async (accountId: string) => {
    setRemovingId(accountId);
    setError(null);
    try {
      const response = await fetch("/api/overview/accounts", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || (locale === "en" ? "Unable to remove the account." : "暂时无法移除账号。"));
      setConfirmingId(null);
      await onRemoved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (locale === "en" ? "Unable to remove the account." : "暂时无法移除账号。"));
    } finally {
      setRemovingId(null);
    }
  };

  const syncAllOfficial = async () => {
    setSyncingAll(true);
    setSyncMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/performance/sync-official-accounts", { method: "POST" });
      const payload = await response.json() as OfficialSyncResponse;
      if (!response.ok) throw new Error(payload.error || (locale === "en" ? "Unable to sync connected accounts." : "暂时无法同步官方账号。"));
      setSyncMessage(formatOfficialSyncMessage(payload, locale));
      await onRefreshed();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (locale === "en" ? "Unable to sync connected accounts." : "暂时无法同步官方账号。"));
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <div className="grid gap-4 p-5 sm:p-6">
      {hasOfficialAccounts ? (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#6fc3a0]/20 bg-[#6fc3a0]/6 p-4">
          <div>
            <p className="text-sm font-semibold text-white/88">{locale === "en" ? "Sync all connected accounts" : "同步全部官方账号"}</p>
            <p className="mt-1 text-xs leading-5 text-white/42">{locale === "en" ? "Bring the latest numbers from every connected matrix account back here in one tap." : "一次带回所有已连接矩阵账号的最新数据。"}</p>
            {syncMessage ? <p role="status" className="mt-1 text-xs font-semibold text-[#8fd7b8]">{syncMessage}</p> : null}
          </div>
          <button type="button" onClick={() => void syncAllOfficial()} disabled={syncingAll} className="focus-ring inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[#6fc3a0]/30 bg-[#6fc3a0]/12 px-3.5 text-xs font-bold text-[#9fe3c6] transition hover:bg-[#6fc3a0]/18 disabled:opacity-55">
            {syncingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {syncingAll ? (locale === "en" ? "Syncing…" : "同步中…") : (locale === "en" ? "Sync all" : "全部同步")}
          </button>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#d9aa50]/18 bg-[#d9aa50]/7 p-4">
        <div>
          <p className="text-sm font-semibold text-white/88">{locale === "en" ? "Add another channel" : "补充一个运营账号"}</p>
          <p className="mt-1 text-xs leading-5 text-white/42">{locale === "en" ? "Its real numbers will join your portfolio." : "添加后，它的真实数据会计入增长总览。"}</p>
        </div>
        <button type="button" onClick={onAdd} className="focus-ring inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#e1aa43] px-3.5 text-xs font-bold text-[#171106] hover:bg-[#efbd5b]"><Plus className="h-3.5 w-3.5" />{locale === "en" ? "Add" : "新增"}</button>
      </div>

      <div className="grid gap-2">
        {accounts.map((account) => {
          const confirming = confirmingId === account.id;
          return (
            <div key={account.id} className={cn("rounded-2xl border p-3 transition", confirming ? "border-risk/25 bg-risk/[0.055]" : "border-white/[0.08] bg-white/[0.025]")}>
              <div className="flex items-center gap-3">
                <DarkPlatformBrandIcon platform={account.platform} className="h-11 w-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white/84">{account.displayName}</p>
                    {account.source === "official_sync" ? <span className="shrink-0 rounded-full border border-[#d9aa50]/22 bg-[#d9aa50]/9 px-2 py-0.5 text-[9px] font-bold text-[#e7bd6b]">{locale === "en" ? "Official sync" : "官方同步"}</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-white/38">{account.handle || getLocalizedPlatformLabel(account.platform, locale, true)} · {formatMetric(account.followerCount)} {locale === "en" ? "followers" : "粉丝"}</p>
                </div>
                {!confirming ? (
                  <div className="flex items-center gap-1.5">
                    {account.source === "official_sync" ? (
                      <Link href="/settings#social-accounts" className="focus-ring inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold text-[#e7bd6b] hover:bg-[#d9aa50]/8">{locale === "en" ? "Manage" : "管理"}</Link>
                    ) : (
                      <button type="button" onClick={() => onEdit(account)} className="focus-ring h-9 rounded-lg px-3 text-xs font-semibold text-white/58 hover:bg-white/[0.06] hover:text-white">{locale === "en" ? "Update" : "更新"}</button>
                    )}
                    <button type="button" aria-label={locale === "en" ? `Remove ${account.displayName}` : `移除 ${account.displayName}`} onClick={() => setConfirmingId(account.id)} className="focus-ring grid h-9 w-9 place-items-center rounded-lg text-white/30 hover:bg-risk/10 hover:text-risk"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ) : null}
              </div>
              {confirming ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-risk/15 pt-3">
                  <p className="text-xs leading-5 text-white/46">{locale === "en" ? "It will leave this overview. Saved history stays intact." : "移除后不再计入总览，历史快照仍会保留。"}</p>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={removingId === account.id} onClick={() => setConfirmingId(null)} className="focus-ring h-9 rounded-lg px-3 text-xs font-semibold text-white/48 hover:bg-white/[0.06] hover:text-white">{locale === "en" ? "Cancel" : "取消"}</button>
                    <button type="button" disabled={removingId === account.id} onClick={() => void removeAccount(account.id)} className="focus-ring inline-flex h-9 items-center gap-2 rounded-lg bg-risk/14 px-3 text-xs font-bold text-risk hover:bg-risk/20 disabled:opacity-50">{removingId === account.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}{locale === "en" ? "Remove" : "确认移除"}</button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {error ? <p role="alert" className="rounded-xl border border-risk/25 bg-risk/10 px-3 py-2 text-xs text-risk">{error}</p> : null}
      <p className="text-center text-[11px] leading-5 text-white/28">{locale === "en" ? "Tap Update to save a new real snapshot for an account." : "日常更新数据，仍可直接点击总览里的账号卡片。"}</p>
    </div>
  );
}

function getPeriodDates(periodType: "month" | "year") {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (periodType === "year") return { periodStart: `${year}-01-01`, periodEnd: `${year}-12-31` };
  const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  return { periodStart: `${year}-${String(month + 1).padStart(2, "0")}-01`, periodEnd: end };
}

function GoalEditor({ locale, initial, onSaved, onClose }: {
  locale: "zh" | "en";
  initial: GrowthPortfolioOverview["goal"];
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [periodType, setPeriodType] = useState<"month" | "year">(initial?.periodType ?? "month");
  const [metric, setMetric] = useState<"follower_growth" | "views" | "leads">(initial?.metric ?? "follower_growth");
  const [target, setTarget] = useState(initial?.targetValue.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const dates = getPeriodDates(periodType);
      const response = await fetch("/api/overview/goals", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ periodType, metric, targetValue: Number(target), ...dates })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || (locale === "en" ? "Unable to save goal." : "暂时无法保存目标。"));
      await onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (locale === "en" ? "Unable to save goal." : "暂时无法保存目标。"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5 p-5 sm:p-6">
      <p className="text-sm leading-6 text-white/55">
        {locale === "en" ? "Choose one result to focus on. You can change it anytime." : "只选一个最想实现的结果，减少干扰；之后随时可以调整。"}
      </p>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
        {(["month", "year"] as const).map((period) => (
          <button key={period} type="button" onClick={() => setPeriodType(period)} className={cn("h-10 rounded-lg text-xs font-bold transition", periodType === period ? "bg-white/10 text-white shadow" : "text-white/42 hover:text-white/70")}>{period === "month" ? (locale === "en" ? "Monthly" : "月度目标") : (locale === "en" ? "Yearly" : "年度目标")}</button>
        ))}
      </div>
      <label className="grid gap-2 text-xs font-semibold text-white/58">
        {locale === "en" ? "What do you want to grow?" : "你最想增长什么？"}
        <select value={metric} onChange={(event) => setMetric(event.target.value as typeof metric)} className={fieldClass}>
          <option value="follower_growth">{locale === "en" ? "New followers" : "新增粉丝"}</option>
          <option value="views">{locale === "en" ? "Content views" : "内容阅读量"}</option>
          <option value="leads">{locale === "en" ? "Qualified leads" : "有效线索"}</option>
        </select>
      </label>
      <label className="grid gap-2 text-xs font-semibold text-white/58">
        {locale === "en" ? "Target" : "目标数字"}
        <input required min="1" step="1" inputMode="numeric" type="number" value={target} onChange={(event) => setTarget(event.target.value)} placeholder={locale === "en" ? "Enter your target" : "输入你想达到的数字"} className={fieldClass} />
      </label>
      {error ? <p className="rounded-xl border border-risk/25 bg-risk/10 px-3 py-2 text-xs text-risk">{error}</p> : null}
      <button disabled={saving} className="focus-ring flex h-12 items-center justify-center gap-2 rounded-xl bg-[#e1aa43] text-sm font-bold text-[#171106] transition hover:bg-[#efbd5b] disabled:opacity-55">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
        {locale === "en" ? "Save goal" : "保存目标"}
      </button>
    </form>
  );
}

function ShareCard({ overview, cardRef, locale }: {
  overview: GrowthPortfolioOverview;
  cardRef: RefObject<HTMLDivElement | null>;
  locale: "zh" | "en";
}) {
  const progress = Math.round((overview.goal?.progress ?? 0) * 100);
  const topAccounts = overview.accounts.slice(0, 4);
  return (
    <div
      ref={cardRef}
      className="relative h-[450px] w-[360px] overflow-hidden rounded-[28px] border border-white/10 bg-[#090806] p-7 text-white shadow-2xl"
    >
      <Image fill src="/editorial/growth-portfolio-aurora.png" alt="" sizes="360px" className="object-cover opacity-40 mix-blend-screen" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(222,169,64,.22),transparent_36%),linear-gradient(180deg,rgba(8,7,5,.2),rgba(8,7,5,.96))]" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image
              width={36}
              height={36}
              src="/brand/app-icon-dark-256.webp"
              alt="Finfold"
              className="h-9 w-9 rounded-[11px] shadow-[0_7px_22px_rgba(0,0,0,.42)]"
            />
            <div>
              <p className="text-[13px] font-semibold leading-none tracking-[-0.02em] text-white">Finfold</p>
              <p className="mt-1 text-[7px] font-bold tracking-[0.2em] text-[#e7bd66]/70">{locale === "en" ? "GROWTH PORTFOLIO" : "增长组合"}</p>
            </div>
          </div>
          <span className="rounded-full border border-[#e6ad43]/18 bg-[#e6ad43]/8 px-2.5 py-1 text-[9px] font-semibold text-[#f0cb7a]">{locale === "en" ? "MY GROWTH" : "我的增长"}</span>
        </div>
        <div className="mt-12">
          <p className="text-xs font-semibold text-white/46">{locale === "en" ? "TOTAL FOLLOWERS" : "全网总粉丝"}</p>
          <p className="mt-2 text-[50px] font-semibold leading-none tracking-[-0.055em]">{formatMetric(overview.totalFollowers)}</p>
          <p className="mt-4 inline-flex rounded-full bg-[#e6ad43]/14 px-3 py-1.5 text-sm font-bold text-[#f5c86e]">{locale === "en" ? "This month" : "本月新增"} {formatMetric(overview.monthlyGrowth, true)}</p>
        </div>
        <div className="mt-9 flex items-end justify-between gap-4 border-t border-white/10 pt-5">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[9px] font-semibold text-white/38">{locale === "en" ? "ACTIVE ACCOUNTS" : "运营账号"}</p>
              <span className="text-[9px] font-semibold text-[#edc267]/72">{overview.totalAccounts}</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {topAccounts.map((account) => (
                <div key={account.id} className="grid h-11 w-11 place-items-center rounded-[13px] border border-white/[0.08] bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,.04)]">
                  <DarkPlatformBrandIcon platform={account.platform} className="h-8 w-8" />
                </div>
              ))}
            </div>
          </div>
          {overview.goal ? (
            <div className="text-right">
              <p className="text-[9px] font-semibold text-white/38">{locale === "en" ? "GOAL" : "目标进度"}</p>
              <p className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.04em] text-[#f0ca77]">{progress}%</p>
            </div>
          ) : null}
        </div>
        <p className="mt-auto text-[10px] font-medium text-white/32">finfold.app · {new Date().toISOString().slice(0, 10)}</p>
      </div>
    </div>
  );
}

type PreparedShareAsset = {
  dataUrl: string;
  file: File;
  filename: string;
};

const growthShareImageSize = { width: 1080, height: 1350, cssWidth: 360, cssHeight: 450, scale: 3 } as const;

function dataUrlToFile(dataUrl: string, filename: string): File {
  const separator = dataUrl.indexOf(",");
  if (separator === -1) throw new Error("The growth card image is invalid.");
  const metadata = dataUrl.slice(0, separator);
  const payload = dataUrl.slice(separator + 1);
  const mimeType = metadata.match(/^data:([^;,]+)/)?.[1] ?? "image/png";
  const bytes = metadata.includes(";base64")
    ? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return new File([bytes], filename, { type: mimeType });
}

function DarkPlatformBrandIcon({ platform, className }: { platform: PlatformId; className?: string }) {
  if (platform === "x" || platform === "threads") {
    return (
      <span className={cn("grid place-items-center rounded-xl bg-white/[0.07] text-white", className)}>
        <PlatformGlyph platform={platform} className="h-[55%] w-[55%]" />
      </span>
    );
  }
  return <PlatformBrandIcon platform={platform} className={className} />;
}

function downloadShareAsset(asset: PreparedShareAsset): void {
  const link = document.createElement("a");
  link.href = asset.dataUrl;
  link.download = asset.filename;
  link.click();
}

function ShareChannelButton({ channel, disabled, onClick }: {
  channel: GrowthShareChannel;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="focus-ring flex h-12 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-left text-xs font-semibold text-white/78 transition hover:border-[#e0aa43]/30 hover:bg-[#e0aa43]/8 hover:text-white disabled:cursor-wait disabled:opacity-45"
    >
      <DarkPlatformBrandIcon platform={channel.id} className="h-8 w-8 shrink-0" />
      <span>{channel.label}</span>
    </button>
  );
}

function ShareDialog({ overview, locale, onClose }: {
  overview: GrowthPortfolioOverview;
  locale: "zh" | "en";
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const assetPromiseRef = useRef<Promise<PreparedShareAsset> | null>(null);
  const [asset, setAsset] = useState<PreparedShareAsset | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [exportError, setExportError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const filename = `finfold-growth-${new Date().toISOString().slice(0, 10)}.png`;
  const caption = buildGrowthShareCaption({
    locale,
    totalFollowers: overview.totalFollowers,
    monthlyGrowth: overview.monthlyGrowth,
    goalProgress: overview.goal?.progress ?? null,
    hidden: false
  });
  const globalChannels = GROWTH_SHARE_CHANNELS.filter((channel) => channel.region === "global");
  const chinaChannels = GROWTH_SHARE_CHANNELS.filter((channel) => channel.region === "china");

  const prepareAsset = useCallback(() => {
    if (assetPromiseRef.current) return assetPromiseRef.current;
    if (!cardRef.current) return Promise.reject(new Error(locale === "en" ? "The growth card is not ready." : "增长战报还没有准备好。"));

    assetPromiseRef.current = exportCoverPngToDataUrl(cardRef.current, growthShareImageSize)
      .then((dataUrl) => ({ dataUrl, filename, file: dataUrlToFile(dataUrl, filename) }))
      .catch((caught) => {
        assetPromiseRef.current = null;
        throw caught;
      });
    return assetPromiseRef.current;
  }, [filename, locale]);

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      setPreparing(true);
      prepareAsset()
        .then((prepared) => {
          if (!active) return;
          setAsset(prepared);
          setExportError(null);
        })
        .catch((caught) => {
          if (!active) return;
          setExportError(caught instanceof Error ? caught.message : (locale === "en" ? "Unable to create the PNG." : "暂时无法生成 PNG，请重试。"));
        })
        .finally(() => {
          if (active) setPreparing(false);
        });
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, [locale, prepareAsset]);

  const getAsset = async (): Promise<PreparedShareAsset> => {
    if (asset) return asset;
    setPreparing(true);
    setExportError(null);
    try {
      const prepared = await prepareAsset();
      setAsset(prepared);
      return prepared;
    } finally {
      setPreparing(false);
    }
  };

  const copyCaption = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(caption);
      return true;
    } catch {
      return false;
    }
  };

  const canShareFile = (prepared: PreparedShareAsset): boolean => (
    typeof navigator.share === "function"
    && typeof navigator.canShare === "function"
    && navigator.canShare({ files: [prepared.file] })
  );

  const shareImage = async (channel?: GrowthShareChannel) => {
    setShareStatus(null);
    setExportError(null);
    try {
      const prepared = asset ?? await getAsset();
      if (canShareFile(prepared)) {
        await navigator.share({
          files: [prepared.file],
          title: locale === "en" ? "My Finfold growth portfolio" : "我的 Finfold 增长战报",
          text: caption
        });
        setShareStatus(channel
          ? (locale === "en" ? `Share sheet opened — choose ${channel.label}.` : `已打开系统分享，请选择 ${channel.label}。`)
          : (locale === "en" ? "Share sheet opened with the image attached." : "已打开系统分享，战报图片已附上。"));
        return;
      }

      const intent = channel ? buildGrowthShareIntent(channel.id, caption) : null;
      if (intent) window.open(intent, "_blank", "noopener,noreferrer");
      downloadShareAsset(prepared);
      const copied = await copyCaption();
      setShareStatus(channel
        ? (locale === "en"
          ? `${channel.label} is open; the image is saved${copied ? " and the caption is copied" : ""}.`
          : `已打开 ${channel.label}，图片已保存${copied ? "、文案已复制" : ""}。`)
        : (locale === "en"
          ? `The image is saved${copied ? " and the caption is copied" : ""}.`
          : `图片已保存${copied ? "，文案已复制" : ""}，可以直接发布。`));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setShareStatus(locale === "en" ? "Sharing cancelled." : "已取消分享。" );
        return;
      }
      setExportError(caught instanceof Error ? caught.message : (locale === "en" ? "Unable to prepare sharing." : "暂时无法准备分享，请重试。"));
    }
  };

  const exportCard = async () => {
    setShareStatus(null);
    setExportError(null);
    try {
      downloadShareAsset(await getAsset());
      setShareStatus(locale === "en" ? "High-resolution PNG downloaded." : "高清 PNG 已下载。" );
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : (locale === "en" ? "Unable to create the PNG." : "暂时无法生成 PNG，请重试。"));
    }
  };

  const handleCopy = async () => {
    setShareStatus(await copyCaption()
      ? (locale === "en" ? "Caption copied." : "分享文案已复制。")
      : (locale === "en" ? "Unable to copy the caption." : "暂时无法复制文案。"));
  };

  return (
    <Modal wide title={locale === "en" ? "Your growth card" : "你的增长战报"} onClose={onClose}>
      <div className="grid gap-6 p-3 sm:p-6 md:grid-cols-[360px_minmax(0,1fr)] md:items-start">
        <div className="max-w-full justify-self-center overflow-hidden rounded-[28px]"><ShareCard overview={overview} cardRef={cardRef} locale={locale} /></div>
        <div className="grid min-w-0 gap-4">
          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] text-[#d9aa50]">{locale === "en" ? "SHARE YOUR GROWTH" : "分享你的增长"}</p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.035em] text-white">{locale === "en" ? "Turn growth into reach" : "让增长本身，带来新流量"}</h3>
            <p className="mt-2 text-xs leading-5 text-white/45">{locale === "en" ? "Share the actual image from your phone. On desktop, Finfold prepares the image, caption, and publishing page together." : "手机端可直接分享战报图片；桌面端会同时准备图片、文案和发布页。"}</p>
          </div>

          <button type="button" disabled={preparing} onClick={() => void shareImage()} className="focus-ring flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e1aa43] text-sm font-bold text-[#171106] shadow-[0_14px_36px_rgba(217,164,65,.2)] transition hover:bg-[#efbd5b] disabled:cursor-wait disabled:opacity-55">
            {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            {preparing ? (locale === "en" ? "Preparing image…" : "正在准备战报…") : (locale === "en" ? "Share image" : "一键分享图片")}
          </button>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3.5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-bold tracking-[0.14em] text-white/42">{locale === "en" ? "GLOBAL PLATFORMS" : "海外平台"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {globalChannels.map((channel) => <ShareChannelButton key={channel.id} channel={channel} disabled={preparing} onClick={() => void shareImage(channel)} />)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3.5">
            <p className="mb-3 text-[10px] font-bold tracking-[0.14em] text-white/42">{locale === "en" ? "CHINA PLATFORMS" : "国内平台"}</p>
            <div className="grid grid-cols-2 gap-2">
              {chinaChannels.map((channel) => <ShareChannelButton key={channel.id} channel={channel} disabled={preparing} onClick={() => void shareImage(channel)} />)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={preparing} onClick={() => void exportCard()} className="focus-ring flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-white/66 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-wait disabled:opacity-45">
              <Download className="h-3.5 w-3.5" />{locale === "en" ? "Download PNG" : "下载 PNG"}
            </button>
            <button type="button" onClick={() => void handleCopy()} className="focus-ring flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-white/66 transition hover:bg-white/[0.08] hover:text-white">
              <Copy className="h-3.5 w-3.5" />{locale === "en" ? "Copy caption" : "复制文案"}
            </button>
          </div>

          {exportError ? <p role="alert" className="rounded-xl border border-risk/25 bg-risk/10 px-3 py-2 text-center text-xs text-risk">{exportError}</p> : null}
          {shareStatus ? <p aria-live="polite" className="rounded-xl border border-[#d9aa50]/18 bg-[#d9aa50]/8 px-3 py-2 text-center text-xs text-[#edca82]">{shareStatus}</p> : null}
        </div>
      </div>
    </Modal>
  );
}

function EmptyState({ locale, onAdd }: { locale: "zh" | "en"; onAdd: () => void }) {
  return (
    <div className="relative flex min-h-[650px] items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-[#080706] px-5 py-16 text-center shadow-[0_30px_100px_rgba(0,0,0,.35)]">
      <Image fill priority src="/editorial/growth-portfolio-aurora.png" alt="" sizes="(max-width: 1024px) 100vw, 1200px" className="object-cover opacity-32 mix-blend-screen" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(217,164,65,.12),transparent_36%),linear-gradient(180deg,rgba(8,7,6,.1),rgba(8,7,6,.92))]" />
      <motion.div className="relative max-w-xl" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[#e5ad48]/25 bg-[#e5ad48]/10 text-[#edc46f] shadow-[0_0_60px_rgba(217,164,65,.18)]"><Gauge className="h-6 w-6" /></div>
        <p className="mt-6 text-[11px] font-bold tracking-[0.24em] text-[#d8ad5a]">{locale === "en" ? "GROWTH PORTFOLIO" : "增长组合"}</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-white sm:text-5xl">{locale === "en" ? "See your growth in one place" : "把全网增长，放进一个账户"}</h1>
        <p className="mx-auto mt-5 max-w-md text-sm leading-7 text-white/52">{locale === "en" ? "Add one social account and its real follower number. Finfold will turn each update into a clear growth curve." : "先添加一个社交账号和它的真实粉丝数。之后每次更新，Finfold 都会把它变成清晰的增长曲线。"}</p>
        <button type="button" onClick={onAdd} className="focus-ring mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-[#e1aa43] px-6 text-sm font-bold text-[#171106] shadow-[0_16px_50px_rgba(217,164,65,.25)] hover:bg-[#efbd5b]"><Plus className="h-4 w-4" />{locale === "en" ? "Add your first account" : "添加第一个账号"}</button>
        <p className="mt-4 text-[11px] text-white/32">{locale === "en" ? "No sample numbers. Missing data stays missing." : "不展示示例数字，缺失数据会明确标注。"}</p>
      </motion.div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick, primary = false, disabled = false, spinning = false }: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  spinning?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="group focus-ring flex w-[76px] flex-col items-center gap-2 disabled:opacity-45">
      <span
        className={cn(
          "grid h-12 w-12 place-items-center rounded-full border transition",
          primary
            ? "border-transparent bg-[#e1aa43] text-[#171106] shadow-[0_10px_30px_rgba(217,164,65,.3)] group-hover:bg-[#efbd5b]"
            : "border-white/10 bg-white/[0.05] text-white/65 group-hover:border-white/20 group-hover:bg-white/[0.09] group-hover:text-white"
        )}
      >
        <Icon className={cn("h-[18px] w-[18px]", spinning && "animate-spin")} />
      </span>
      <span className="text-[11px] font-semibold text-white/50 transition group-hover:text-white/80">{label}</span>
    </button>
  );
}

export function GrowthPortfolio() {
  const locale = useLocale();
  const [overview, setOverview] = useState<GrowthPortfolioOverview | null>(null);
  const [persisted, setPersisted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<30 | 90 | 0>(90);
  const [chartMetric, setChartMetric] = useState<"followers" | "views">("followers");
  const [hidden, setHidden] = useState(false);
  const [editingAccount, setEditingAccount] = useState<GrowthPortfolioAccount | null | undefined>(undefined);
  const [manageAccountsOpen, setManageAccountsOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const loadOverview = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/overview", { cache: "no-store" });
    const payload = await response.json() as OverviewResponse;
    if (!response.ok || !payload.overview) throw new Error(payload.error || (locale === "en" ? "Unable to load growth overview." : "暂时无法加载增长总览。"));
    setOverview(payload.overview);
    setPersisted(payload.persisted !== false);
  }, [locale]);

  const [syncingAll, setSyncingAll] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const syncAllOfficial = useCallback(async () => {
    setSyncingAll(true);
    setSyncStatus(null);
    try {
      const response = await fetch("/api/performance/sync-official-accounts", { method: "POST" });
      const payload = await response.json() as OfficialSyncResponse;
      if (!response.ok) throw new Error(payload.error || (locale === "en" ? "Unable to sync connected accounts." : "暂时无法同步官方账号。"));
      setSyncStatus(formatOfficialSyncMessage(payload, locale));
      await loadOverview();
    } catch (caught) {
      setSyncStatus(caught instanceof Error ? caught.message : (locale === "en" ? "Unable to sync connected accounts." : "暂时无法同步官方账号。"));
    } finally {
      setSyncingAll(false);
    }
  }, [loadOverview, locale]);

  // Official-account metrics never sync on a schedule (X reads are metered),
  // so the overview quietly refreshes itself once a day when the newest
  // snapshot is stale — the same one-tap call, still behind its rate limit.
  const autoSyncRef = useRef(false);
  useEffect(() => {
    if (!overview || autoSyncRef.current || !persisted) return;
    const hasSyncable = overview.hasConnectedAuthorizations || overview.accounts.some((account) => account.source === "official_sync");
    if (!hasSyncable || !overview.lastUpdatedAt) return;
    if (Date.now() - Date.parse(overview.lastUpdatedAt) < 24 * 60 * 60 * 1000) return;
    autoSyncRef.current = true;
    void syncAllOfficial();
  }, [overview, persisted, syncAllOfficial]);

  useEffect(() => {
    loadOverview().catch((caught) => setError(caught instanceof Error ? caught.message : (locale === "en" ? "Unable to load growth overview." : "暂时无法加载增长总览。"))).finally(() => setLoading(false));
  }, [loadOverview]);

  if (loading) {
    return <div className="grid min-h-[65vh] place-items-center rounded-[28px] border border-white/8 bg-[#080706] text-[#d9a441]"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }

  if (error || !overview) {
    return (
      <div className="grid min-h-[520px] place-items-center rounded-[28px] border border-white/10 bg-[#080706] p-6 text-center">
        <div className="max-w-md"><p className="text-lg font-bold text-white">{locale === "en" ? "Growth overview is not ready" : "增长总览暂时不可用"}</p><p className="mt-3 text-sm leading-6 text-white/48">{error}</p><button type="button" onClick={() => { setLoading(true); loadOverview().catch((caught) => setError(caught instanceof Error ? caught.message : (locale === "en" ? "Unable to load growth overview." : "暂时无法加载增长总览。"))).finally(() => setLoading(false)); }} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-white/8 px-4 text-sm font-semibold text-white hover:bg-white/12"><RefreshCw className="h-4 w-4" />{locale === "en" ? "Try again" : "重新加载"}</button></div>
      </div>
    );
  }

  if (overview.totalAccounts === 0) {
    return (
      <>
        <EmptyState locale={locale} onAdd={() => setEditingAccount(null)} />
        <AnimatePresence>{editingAccount !== undefined ? <Modal title={locale === "en" ? "Add social account" : "添加社交账号"} onClose={() => setEditingAccount(undefined)}><AccountEditor account={editingAccount} locale={locale} onSaved={loadOverview} onClose={() => setEditingAccount(undefined)} /></Modal> : null}</AnimatePresence>
      </>
    );
  }

  const goalProgress = overview.goal?.progress === null || overview.goal?.progress === undefined ? null : Math.round(overview.goal.progress * 100);
  const metricName = overview.goal?.metric === "views" ? (locale === "en" ? "views" : "阅读量") : overview.goal?.metric === "leads" ? (locale === "en" ? "leads" : "有效线索") : (locale === "en" ? "new followers" : "新增粉丝");
  const hasShareableData = overview.totalFollowers !== null;

  return (
    <div className="relative mx-auto min-h-[calc(100vh-4rem)] max-w-[1380px] overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#080706] text-white shadow-[0_32px_120px_rgba(0,0,0,.38)] xl:max-w-[1560px] 2xl:max-w-[1800px]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] w-full">
        <Image fill priority src="/editorial/growth-portfolio-aurora.png" alt="" sizes="(max-width: 1024px) 100vw, (max-width: 1536px) 1560px, 1800px" className="object-cover opacity-[0.22] mix-blend-screen" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_0%,rgba(217,164,65,.13),transparent_28%),linear-gradient(180deg,rgba(8,7,6,.15),#080706_58%)]" />

      <div className="relative px-4 py-5 sm:px-7 sm:py-7 xl:px-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.22em] text-[#d7aa54]"><Sparkles className="h-3.5 w-3.5" />{locale === "en" ? "GROWTH PORTFOLIO" : "增长组合"}</div>
            <h1 className="mt-2 text-xl font-semibold tracking-[-0.025em] sm:text-2xl">{locale === "en" ? "Growth Overview" : "增长总览"}</h1>
            {!persisted ? <p className="mt-1 text-[11px] text-[#f0c66e]/70">{locale === "en" ? "Local preview · saving is disabled" : "本地预览 · 暂不可保存"}</p> : null}
          </div>
          <button type="button" onClick={() => setManageAccountsOpen(true)} className="focus-ring inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3.5 text-xs font-bold text-white/68 transition hover:bg-white/[0.07]">
            <Settings className="h-4 w-4" />{locale === "en" ? "Manage accounts" : "管理账号"}
            <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[9px] text-white/45">{overview.totalAccounts}</span>
          </button>
        </header>

        <section className="mt-9 sm:mt-11">
          <div className="flex items-center gap-2.5">
            <p className="text-[11px] font-bold tracking-[0.2em] text-white/38">
              {overview.knownFollowerAccounts === overview.totalAccounts
                ? (locale === "en" ? "TOTAL FOLLOWERS" : "全网总粉丝")
                : (locale === "en" ? `FOLLOWERS · ${overview.knownFollowerAccounts} ACCOUNTS` : `${overview.knownFollowerAccounts} 个账号总粉丝`)}
            </p>
            <button
              type="button"
              onClick={() => setHidden((value) => !value)}
              aria-label={hidden ? (locale === "en" ? "Show numbers" : "显示数字") : (locale === "en" ? "Hide numbers" : "隐藏数字")}
              aria-pressed={hidden}
              className="focus-ring relative grid h-6 w-6 place-items-center rounded-full text-white/45 transition hover:bg-white/[0.07] hover:text-white/80"
            >
              <Eye className="h-3.5 w-3.5" />
              {hidden ? <span className="absolute h-px w-[15px] rotate-[24deg] rounded bg-current" /> : null}
            </button>
          </div>
          <motion.p key={overview.totalFollowers} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 text-[clamp(3rem,6.6vw,5.4rem)] font-semibold leading-none tracking-[-0.06em] tabular-nums text-white">
            {hidden ? MASK : formatMetric(overview.totalFollowers)}
          </motion.p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold", (overview.monthlyGrowth ?? 0) >= 0 ? "bg-[#e6ad43]/14 text-[#f5c86e]" : "bg-risk/12 text-risk")}>
              {(overview.monthlyGrowth ?? 0) >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {locale === "en" ? "This month" : "本月新增"} {hidden ? MASK : formatMetric(overview.monthlyGrowth, true)}
            </span>
            <p className="text-xs text-white/34">
              {locale === "en" ? `${overview.totalAccounts} accounts in play` : `${overview.totalAccounts} 个账号在运营`}
              {overview.lastUpdatedAt ? (locale === "en" ? ` · updated ${formatRelativeTime(overview.lastUpdatedAt, locale)}` : ` · 更新于 ${formatRelativeTime(overview.lastUpdatedAt, locale)}`) : ""}
            </p>
            {overview.knownGrowthAccounts < overview.totalAccounts ? (
              <p className="text-xs text-white/26">{locale === "en" ? `${overview.totalAccounts - overview.knownGrowthAccounts} accounts still need this month’s growth` : `还有 ${overview.totalAccounts - overview.knownGrowthAccounts} 个账号未填写本月新增`}</p>
            ) : null}
          </div>
        </section>

        <section className="mt-9 overflow-hidden rounded-[22px] border border-white/[0.09] bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-sm sm:mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
            <div><p className="text-sm font-bold text-white/84">{chartMetric === "followers" ? (locale === "en" ? "Total follower trend" : "全网粉丝趋势") : (locale === "en" ? "Content views trend" : "内容浏览量趋势")}</p><p className="mt-1 text-[11px] text-white/32">{(chartMetric === "followers" ? overview.timeSeries : overview.viewsTimeSeries).length > 1 ? (locale === "en" ? "Built from saved account snapshots" : "由每次真实账号快照生成") : (locale === "en" ? "Update once more to form a trend" : "再更新一次，就能形成趋势")}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg bg-white/[0.045] p-1">
                {(["followers", "views"] as const).map((metric) => <button key={metric} type="button" onClick={() => setChartMetric(metric)} className={cn("h-8 rounded-md px-3 text-[11px] font-bold transition", chartMetric === metric ? "bg-white/90 text-[#1a1712] shadow-sm" : "text-white/34 hover:text-white/64")}>{metric === "followers" ? (locale === "en" ? "Followers" : "粉丝") : (locale === "en" ? "Views" : "浏览量")}</button>)}
              </div>
              <div className="flex rounded-lg bg-white/[0.045] p-1">
                {([30, 90, 0] as const).map((days) => <button key={days} type="button" onClick={() => setRangeDays(days)} className={cn("h-8 rounded-md px-3 text-[11px] font-bold transition", rangeDays === days ? "bg-white/90 text-[#1a1712] shadow-sm" : "text-white/34 hover:text-white/64")}>{days === 0 ? (locale === "en" ? "All" : "全部") : `${days}${locale === "en" ? "D" : "天"}`}</button>)}
              </div>
            </div>
          </div>
          {chartMetric === "followers"
            ? (overview.timeSeries.length
                ? <GrowthLineChart points={overview.timeSeries.map((point) => ({ date: point.date, value: point.followers }))} days={rangeDays} locale={locale} masked={hidden} ariaLabel={locale === "en" ? "Total follower trend" : "全网粉丝趋势"} />
                : <div className="grid h-[250px] place-items-center px-6 text-center text-xs leading-6 text-white/34 sm:h-[300px]">{locale === "en" ? "Follower history will appear after your first real snapshot." : "保存第一个真实粉丝数后，趋势会从这里开始。"}</div>)
            : (overview.viewsTimeSeries.length
                ? <GrowthLineChart points={overview.viewsTimeSeries.map((point) => ({ date: point.date, value: point.views }))} days={rangeDays} locale={locale} masked={hidden} ariaLabel={locale === "en" ? "Content views trend" : "内容浏览量趋势"} />
                : <div className="grid h-[250px] place-items-center px-6 text-center text-xs leading-6 text-white/34 sm:h-[300px]">{locale === "en" ? "Views will appear after an account reports them." : "任一账号填写浏览量后，趋势会在这里开始。"}</div>)}
        </section>

        <section className="mt-7 flex flex-wrap items-start gap-2 sm:gap-4">
          <QuickAction primary icon={Plus} label={locale === "en" ? "Add account" : "添加账号"} onClick={() => setEditingAccount(null)} />
          {overview.hasConnectedAuthorizations || overview.accounts.some((account) => account.source === "official_sync") ? (
            <QuickAction icon={RefreshCw} label={locale === "en" ? "Sync all" : "一键同步"} onClick={() => void syncAllOfficial()} disabled={syncingAll} spinning={syncingAll} />
          ) : null}
          <QuickAction icon={Target} label={locale === "en" ? "Set goal" : "设定目标"} onClick={() => setGoalOpen(true)} />
          <QuickAction icon={Share2} label={locale === "en" ? "Growth card" : "生成战报"} onClick={() => setShareOpen(true)} disabled={!hasShareableData} />
        </section>

        <section className="mt-7 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
          <button type="button" onClick={() => setGoalOpen(true)} className="group relative overflow-hidden rounded-[22px] border border-white/[0.09] bg-white/[0.028] p-5 text-left transition hover:border-[#d9a441]/25 hover:bg-white/[0.045] sm:p-6">
            <div className="absolute -right-12 -top-14 h-44 w-44 rounded-full bg-[#d9a441]/10 blur-3xl transition group-hover:bg-[#d9a441]/16" />
            <div className="relative flex items-start justify-between gap-5">
              <div><div className="flex items-center gap-2 text-xs font-bold text-white/48"><Target className="h-4 w-4 text-[#dfb04d]" />{overview.goal ? (overview.goal.periodType === "year" ? (locale === "en" ? "Yearly goal" : "年度目标") : (locale === "en" ? "Monthly goal" : "月度目标")) : (locale === "en" ? "Set a growth goal" : "设定增长目标")}</div>{overview.goal ? <><p className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-white">{goalProgress === null ? "—" : `${goalProgress}%`}</p><p className="mt-2 text-xs text-white/38">{hidden ? MASK : `${formatMetric(overview.goal.currentValue)} / ${formatMetric(overview.goal.targetValue)}`} {metricName}</p></> : <><p className="mt-5 max-w-xs text-lg font-semibold text-white/88">{locale === "en" ? "Give this month one clear finish line." : "给这个月一个清晰终点。"}</p><p className="mt-2 text-xs text-white/38">{locale === "en" ? "Tap to choose one result" : "点击选择一个最重要的结果"}</p></>}</div>
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full text-lg font-bold text-[#f0c76f]" style={{ background: `radial-gradient(circle at center,#0b0907 53%,transparent 55%),conic-gradient(#e3ad45 ${(goalProgress ?? 0) * 3.6}deg,rgba(255,255,255,.07) 0deg)` }}>{goalProgress === null ? <Plus className="h-5 w-5" /> : `${goalProgress}%`}</div>
            </div>
          </button>

          <div className="relative overflow-hidden rounded-[22px] border border-white/[0.09] bg-[linear-gradient(135deg,rgba(217,164,65,.075),rgba(255,255,255,.018))] p-5 sm:p-6">
            <div className="flex items-center gap-2 text-xs font-bold text-[#e6bb61]"><Bot className="h-4 w-4" />{locale === "en" ? "FINFOLD AGENT" : "Finfold智能体"}</div>
            <p className="mt-5 max-w-xl text-lg font-medium leading-8 text-white/88">{locale === "en" ? overview.insight.messageEn : overview.insight.messageZh}</p>
            <Link href={`/dashboard?prompt=${encodeURIComponent(locale === "en" ? "Analyze my Growth Overview and tell me the single most important action for this week." : "请分析我的增长总览，告诉我本周最应该做的一件事。")}`} className="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg text-xs font-bold text-[#e8bd64] hover:text-[#f6d891]">{locale === "en" ? "Ask Agent what to do next" : "让智能体给我下一步"}<ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </div>
        </section>

        <section className="mt-4 rounded-[22px] border border-white/[0.09] bg-white/[0.022] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 px-1">
            <div><p className="text-sm font-bold text-white/82">{locale === "en" ? "Your accounts" : "正在运营的账号"}</p><p className="mt-1 text-[11px] text-white/30">{locale === "en" ? "Manual accounts update here; official accounts sync in one tap" : "手动账号在这里更新，官方账号一键同步"}</p></div>
          </div>
          {syncStatus ? <p aria-live="polite" className="mt-2 px-1 text-[11px] font-semibold text-[#edca82]">{syncStatus}</p> : null}
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {overview.accounts.map((account) => (
              <button key={account.id} type="button" disabled={syncingAll} onClick={() => account.source === "official_sync" ? void syncAllOfficial() : setEditingAccount(account)} className="group flex flex-col gap-3.5 rounded-2xl border border-white/[0.075] bg-black/18 p-4 text-left transition hover:border-[#d9a441]/24 hover:bg-white/[0.035] disabled:opacity-60">
                <div className="flex items-center gap-3">
                  <DarkPlatformBrandIcon platform={account.platform} className="h-10 w-10 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[13px] font-bold text-white/85">{account.displayName}</span>
                      {account.source === "official_sync" ? <span className="shrink-0 rounded-full border border-[#d9aa50]/22 bg-[#d9aa50]/9 px-1.5 py-0.5 text-[8px] font-bold text-[#e7bd6b]">{locale === "en" ? "OFFICIAL" : "官方"}</span> : null}
                    </div>
                    <span className="mt-1 block truncate text-[11px] text-white/34">{account.handle || getLocalizedPlatformLabel(account.platform, locale, true)}</span>
                  </div>
                  {account.source === "official_sync" && syncingAll
                    ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#dfb04d]" />
                    : <RefreshCw className="h-3.5 w-3.5 shrink-0 text-white/20 transition group-hover:text-[#dfb04d]" />}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <span className="text-[22px] font-semibold leading-none tracking-[-0.035em] tabular-nums text-white">{hidden ? MASK : formatMetric(account.followerCount)}</span>
                  {account.periodFollowerGrowth !== null && account.periodFollowerGrowth !== undefined ? (
                    <span className={cn("inline-flex items-center gap-1 pb-0.5 text-xs font-bold", account.periodFollowerGrowth >= 0 ? "text-[#e9bd63]" : "text-risk")}>
                      {account.periodFollowerGrowth >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {hidden ? MASK : formatMetric(account.periodFollowerGrowth, true)}
                    </span>
                  ) : null}
                </div>
                {account.measuredAt ? <p className="text-[10px] text-white/26">{locale === "en" ? `Updated ${formatRelativeTime(account.measuredAt, locale)}` : `${formatRelativeTime(account.measuredAt, locale)}更新`}</p> : null}
              </button>
            ))}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {editingAccount !== undefined ? <Modal title={editingAccount ? (locale === "en" ? "Update account data" : "更新账号数据") : (locale === "en" ? "Add social account" : "添加社交账号")} onClose={() => setEditingAccount(undefined)}><AccountEditor account={editingAccount} locale={locale} onSaved={loadOverview} onClose={() => setEditingAccount(undefined)} /></Modal> : null}
        {manageAccountsOpen ? <Modal title={locale === "en" ? "Manage accounts" : "管理运营账号"} onClose={() => setManageAccountsOpen(false)}><ManageAccountsDialog accounts={overview.accounts} locale={locale} onAdd={() => { setManageAccountsOpen(false); setEditingAccount(null); }} onEdit={(account) => { setManageAccountsOpen(false); setEditingAccount(account); }} onRemoved={loadOverview} onRefreshed={loadOverview} /></Modal> : null}
        {goalOpen ? <Modal title={locale === "en" ? "Set growth goal" : "设定增长目标"} onClose={() => setGoalOpen(false)}><GoalEditor locale={locale} initial={overview.goal} onSaved={loadOverview} onClose={() => setGoalOpen(false)} /></Modal> : null}
        {shareOpen ? <ShareDialog overview={overview} locale={locale} onClose={() => setShareOpen(false)} /> : null}
      </AnimatePresence>
    </div>
  );
}
