"use client";

import { ImagePlus, Loader2, ScanLine, ShieldAlert, ShieldCheck, X } from "@/components/ui/icons";
import React, { useState } from "react";
import { addToast } from "@/components/ui/Toast";
import type { MediaAsset } from "@/lib/content-schema";
import { dashboardCopy, type Locale } from "@/lib/i18n";
import { hasQrCodeRisk, inspectImageCompliance, type ImageComplianceResult } from "@/lib/image-compliance-client";
import type { PlatformId } from "@/lib/platforms";
import { captureEvent } from "@/lib/posthog";
import {
  isAcceptedMediaUploadFile,
  MEDIA_UPLOAD_ACCEPT
} from "@/lib/media-upload-policy";

type MediaUploaderProps = {
  assets: MediaAsset[];
  onChange: (assets: MediaAsset[]) => void;
  locale: Locale;
  selectedPlatforms?: PlatformId[];
  disabled?: boolean;
};

export function MediaUploader({ assets, onChange, locale, selectedPlatforms = [], disabled = false }: MediaUploaderProps) {
  const copy = dashboardCopy[locale];
  const [isUploading, setIsUploading] = useState(false);
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const xhsSelected = selectedPlatforms.includes("xiaohongshu");
  const qrRiskAssets = assets.filter(hasQrCodeRisk);
  const checkedAssets = assets.filter((asset) => asset.compliance?.qrCode === "not-detected");
  const unavailableAssets = assets.filter((asset) => asset.compliance?.qrCode === "unavailable");

  async function handleFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    const selectedFiles = Array.from(files);
    if (selectedFiles.some((file) => !isAcceptedMediaUploadFile(file))) {
      addToast(
        "error",
        locale === "en"
          ? "Only JPEG, PNG, and WebP images can be uploaded. GIF and video are not supported."
          : "仅支持上传 JPEG、PNG 和 WebP 图片，不支持 GIF 和视频。"
      );
      return;
    }

    setIsUploading(true);
    try {
      setIsCheckingCompliance(true);
      const compliance: ImageComplianceResult[] = [];
      // Keep scans sequential so six large screenshots cannot create six
      // simultaneous 2048px RGBA canvases on a memory-constrained phone.
      for (const file of selectedFiles) {
        compliance.push(await inspectImageCompliance(file));
      }
      setIsCheckingCompliance(false);

      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append("files", file));
      const response = await fetch("/api/media", {
        method: "POST",
        body: formData
      });
      const data = (await response.json().catch(() => ({}))) as {
        assets?: MediaAsset[];
        error?: string;
      };

      if (!response.ok || data.error) {
        const fallback = locale === "en" ? "Upload failed. Please try again." : "上传失败，请重试。";
        addToast("error", data.error || fallback);
        return;
      }

      if (data.assets?.length) {
        const checked = data.assets.map((asset, index) => ({
          ...asset,
          compliance: compliance[index] ?? { qrCode: "unavailable" as const }
        }));
        const riskCount = checked.filter(hasQrCodeRisk).length;
        onChange([...assets, ...checked]);
        captureEvent("media_compliance_checked", {
          files: checked.length,
          qrRisks: riskCount,
          unavailable: checked.filter((asset) => asset.compliance.qrCode === "unavailable").length,
          xhsSelected
        });
        if (xhsSelected && riskCount > 0) {
          addToast(
            "warning",
            locale === "en"
              ? "A possible QR code was found. Review it before using this image on Xiaohongshu."
              : "检测到疑似二维码，请在用于小红书发布前处理。"
          );
        }
      }
    } catch {
      addToast("error", locale === "en" ? "Upload failed. Please try again." : "上传失败，请重试。");
    } finally {
      setIsCheckingCompliance(false);
      setIsUploading(false);
    }
  }

  function removeAsset(id: string) {
    onChange(assets.filter((asset) => asset.id !== id));
  }

  const isBusy = isUploading || disabled;

  return (
    <section className="panel min-w-0 rounded-md p-4">
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <ImagePlus className="h-4 w-4 text-fg" />
        <h2 className="min-w-0 break-words text-sm font-black">{copy.mediaTitle}</h2>
      </div>
      <label className={`focus-within:outline-action flex min-h-32 min-w-0 flex-col items-center justify-center rounded-sm border border-dashed border-hairline bg-surface p-4 text-center transition hover:-translate-y-0.5 hover:border-action/50 hover:bg-action/[0.035] ${isBusy ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
        <input
          type="file"
          multiple
          accept={MEDIA_UPLOAD_ACCEPT}
          className="sr-only"
          disabled={isBusy}
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        {isUploading ? (
          <Loader2 className="mb-2 h-6 w-6 animate-spin text-action" />
        ) : (
          <ImagePlus className="mb-2 h-6 w-6 text-fg rk-pop" />
        )}
        <span className="max-w-full break-words text-sm font-black">
          {isCheckingCompliance
            ? (locale === "en" ? "Checking image compliance…" : "正在检查图片合规…")
            : isUploading
              ? (locale === "en" ? "Uploading…" : "上传中…")
              : copy.mediaUpload}
        </span>
        <span className="mt-1 max-w-full break-words text-xs text-fg-muted">{copy.mediaNote}</span>
      </label>
      {xhsSelected && qrRiskAssets.length > 0 ? (
        <div role="alert" data-testid="xhs-qr-upload-warning" className="mt-3 flex items-start gap-2 rounded-lg border border-risk/30 bg-risk/[0.07] px-3 py-2.5 text-risk">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold">
              {locale === "en" ? "Possible QR code detected" : `检测到 ${qrRiskAssets.length} 张图片可能含二维码`}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-fg-muted">
              {locale === "en"
                ? "Xiaohongshu may treat off-platform QR codes as diversion and restrict distribution. Remove, crop, or cover them before publishing."
                : "小红书可能将站外导流二维码判定为违规并限制展示或自然流量。发布前请删除、裁切或遮挡。"}
            </p>
          </div>
        </div>
      ) : xhsSelected && assets.length > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-fg-muted">
          {unavailableAssets.length > 0 ? <ScanLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" /> : <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" />}
          <p className="text-[10px] leading-4">
            {unavailableAssets.length > 0
              ? (locale === "en"
                  ? `${unavailableAssets.length} image(s) could not be scanned automatically. Check them manually before publishing to Xiaohongshu.`
                  : `有 ${unavailableAssets.length} 张图片无法自动检查；发布到小红书前请人工确认没有二维码。`)
              : (locale === "en"
                  ? `${checkedAssets.length} image(s) checked; no recognizable QR code found. A final manual review is still recommended.`
                  : `已检查 ${checkedAssets.length} 张图片，未检出明显二维码；发布前仍建议人工复核。`)}
          </p>
        </div>
      ) : null}
      {assets.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {assets.map((asset) => (
            <div key={asset.id} className="flex min-w-0 items-center justify-between gap-2 rounded-sm border border-hairline bg-surface px-3 py-2 text-xs font-bold shadow-panel">
              <span className="min-w-0 flex-1 truncate">{asset.name}</span>
              {xhsSelected && hasQrCodeRisk(asset) ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-risk/10 px-2 py-0.5 text-[10px] font-bold text-risk">
                  <ShieldAlert className="h-3 w-3" />
                  {locale === "en" ? "QR risk" : "二维码风险"}
                </span>
              ) : (
                <span className="shrink-0 text-fg-muted">{asset.type}</span>
              )}
              <button
                type="button"
                onClick={() => removeAsset(asset.id)}
                disabled={disabled}
                aria-label={locale === "en" ? "Remove" : "删除"}
                title={locale === "en" ? "Remove" : "删除"}
                className="focus-ring shrink-0 rounded-sm p-1 text-fg-muted transition-colors hover:bg-surface-2 hover:text-risk disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
