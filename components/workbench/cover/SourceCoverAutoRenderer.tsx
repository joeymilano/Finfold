"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KitOutput } from "@/lib/content-schema";
import { CoverCanvas } from "@/components/workbench/cover/CoverCanvas";
import { coverSizes, defaultCoverConfig, getPlatformCoverSpec } from "@/lib/cover/cover-spec";
import { exportCoverPngToDataUrl } from "@/lib/cover/cover-export";
import type { Locale } from "@/lib/i18n";
import { getLocalizedPlatformLabel, type PlatformId } from "@/lib/platforms";
import type { OutputImageSource } from "@/lib/source-image";

type Props = {
  kitId?: string;
  outputs: KitOutput[];
  locale: Locale;
  onOutputSaved: (platform: string, patch: Partial<KitOutput>) => void;
};

export function SourceCoverAutoRenderer({ kitId, outputs, locale, onOutputSaved }: Props) {
  const attempted = useRef(new Set<string>());
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [current, setCurrent] = useState<KitOutput | null>(null);
  const candidate = useMemo(() => outputs.find((output) => {
    const source = output.imageSource;
    return Boolean(
      kitId && output.id && source
      && (source.renderStatus === "pending" || (source.renderStatus === "failed" && (source.renderAttemptCount ?? 0) < 2))
      && (source.renderStatus === "pending" || !attempted.current.has(output.id))
    );
  }) ?? null, [kitId, outputs]);

  useEffect(() => {
    if (!candidate || current) return;
    if (!candidate.id) return;
    attempted.current.add(candidate.id);
    setCurrent(candidate);
  }, [candidate, current]);

  useEffect(() => {
    if (!kitId || !current?.id || !current.imageSource || !nodeRef.current) return;
    let cancelled = false;
    const outputId = current.id;
    const source = current.imageSource;
    const attempts = Math.min(2, (source.renderAttemptCount ?? 0) + 1);
    const run = async () => {
      try {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (!nodeRef.current) throw new Error("Cover render surface is unavailable.");
        const sizeId = getPlatformCoverSpec(current.platform as PlatformId).sizes[0];
        const dataUrl = await exportCoverPngToDataUrl(nodeRef.current, coverSizes[sizeId]);
        const blob = await (await fetch(dataUrl)).blob();
        const readySource: OutputImageSource = { ...source, renderStatus: "ready", renderAttemptCount: attempts };
        const form = new FormData();
        form.append("file", new File([blob], `finfold-${current.platform}.png`, { type: "image/png" }));
        form.append("imageSource", JSON.stringify(readySource));
        const response = await fetch(`/api/kits/${encodeURIComponent(kitId)}/outputs/${encodeURIComponent(outputId)}/cover`, { method: "POST", body: form });
        const result = await response.json().catch(() => ({})) as { imageUrl?: string; imageSource?: OutputImageSource; updatedAt?: string; error?: string };
        if (!response.ok || !result.imageUrl) throw new Error(result.error ?? "Cover adaptation failed.");
        if (!cancelled) onOutputSaved(current.platform, {
          imageUrl: result.imageUrl,
          imageSource: result.imageSource ?? readySource,
          ...(result.updatedAt ? { updatedAt: result.updatedAt } : {})
        });
      } catch {
        const failedSource: OutputImageSource = { ...source, renderStatus: "failed", renderAttemptCount: attempts };
        let updatedAt: string | undefined;
        try {
          const response = await fetch(`/api/kits/${encodeURIComponent(kitId)}/outputs/${encodeURIComponent(outputId)}/cover`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl: source.cachedUrl, imageSource: failedSource })
          });
          const result = await response.json().catch(() => ({})) as { updatedAt?: string };
          updatedAt = response.ok ? result.updatedAt : undefined;
        } catch {
          // The original source URL remains usable in the current session;
          // the manual retry control can persist the failed state later.
        } finally {
          if (!cancelled) onOutputSaved(current.platform, {
            imageUrl: source.cachedUrl,
            imageSource: failedSource,
            ...(updatedAt ? { updatedAt } : {})
          });
        }
      } finally {
        if (!cancelled) setCurrent(null);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [current, kitId, onOutputSaved]);

  if (!current?.imageSource) return null;
  const sizeId = getPlatformCoverSpec(current.platform as PlatformId).sizes[0];
  const config = {
    ...defaultCoverConfig(current.platform as PlatformId, current),
    style: "photo" as const,
    themeId: "midnight-ink",
    focalPoint: current.imageSource.focalPoint ?? { x: 0.5, y: 0.5 }
  };
  return (
    <div aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
      <div ref={nodeRef}>
        <CoverCanvas output={current} platformLabel={getLocalizedPlatformLabel(current.platform as PlatformId, locale)} sizeId={sizeId} config={config} locale={locale} />
      </div>
    </div>
  );
}
