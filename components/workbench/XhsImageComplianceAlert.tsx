"use client";

import React from "react";
import { ArrowRight, ShieldAlert } from "@/components/ui/icons";
import type { MediaAsset } from "@/lib/content-schema";
import { hasQrCodeRisk } from "@/lib/image-compliance-client";
import type { Locale } from "@/lib/i18n";

type Props = {
  assets: MediaAsset[];
  locale: Locale;
  confirmOpen?: boolean;
  onReviewMedia?: () => void;
  onConfirm?: () => void;
};

export function XhsImageComplianceAlert({ assets, locale, confirmOpen = false, onReviewMedia, onConfirm }: Props) {
  const flagged = assets.filter(hasQrCodeRisk);
  if (flagged.length === 0) return null;

  const names = flagged.slice(0, 3).map((asset) => asset.name).join("、");
  const remaining = flagged.length - 3;

  return (
    <section role="alert" data-testid="xhs-image-compliance-alert" className="mb-4 overflow-hidden rounded-xl border border-risk/30 bg-risk/[0.065]">
      <div className="flex items-start gap-3 p-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-risk/10 text-risk">
          <ShieldAlert className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black text-risk">
              {locale === "en" ? "Xiaohongshu image risk" : "小红书图片合规风险"}
            </p>
            <span className="rounded-full bg-risk/10 px-2 py-0.5 text-[9px] font-black text-risk">
              {locale === "en" ? "REVIEW BEFORE PUBLISHING" : "发布前必须复核"}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-bold leading-5 text-fg">
            {locale === "en"
              ? `${flagged.length} source image(s) may contain a QR code.`
              : `本内容包有 ${flagged.length} 张素材可能含二维码。`}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-fg-muted">
            {locale === "en"
              ? "If these images will be published, remove, crop, or cover any off-platform QR code first. Xiaohongshu may restrict display or organic distribution."
              : "如果这些图片会随笔记发布，请先删除、裁切或遮挡站外导流二维码；否则可能被限制展示或自然流量。"}
          </p>
          <p className="mt-2 truncate text-[9px] font-semibold text-fg-muted" title={flagged.map((asset) => asset.name).join("、")}>
            {names}{remaining > 0 ? (locale === "en" ? ` +${remaining} more` : ` 等 ${flagged.length} 张`) : ""}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {onReviewMedia ? (
              <button type="button" onClick={onReviewMedia} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-risk/30 bg-surface px-3 py-1.5 text-[10px] font-bold text-risk transition hover:bg-risk/[0.06]">
                {locale === "en" ? "Review source images" : "返回素材处理"}
                <ArrowRight className="h-3 w-3" />
              </button>
            ) : null}
            {confirmOpen && onConfirm ? (
              <button type="button" onClick={onConfirm} className="focus-ring inline-flex items-center rounded-lg bg-risk px-3 py-1.5 text-[10px] font-bold text-white">
                {locale === "en" ? "Final images checked — continue" : "已确认最终发布图无站外导流，继续"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
