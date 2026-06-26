"use client";

import { ImagePlus, Loader2, Video, X } from "lucide-react";
import { useState } from "react";
import { addToast } from "@/components/ui/Toast";
import type { MediaAsset } from "@/lib/content-schema";
import { dashboardCopy, type Locale } from "@/lib/i18n";

type MediaUploaderProps = {
  assets: MediaAsset[];
  onChange: (assets: MediaAsset[]) => void;
  locale: Locale;
  disabled?: boolean;
};

export function MediaUploader({ assets, onChange, locale, disabled = false }: MediaUploaderProps) {
  const copy = dashboardCopy[locale];
  const [isUploading, setIsUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));

    setIsUploading(true);
    try {
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
        onChange([...assets, ...data.assets]);
      }
    } catch {
      addToast("error", locale === "en" ? "Upload failed. Please try again." : "上传失败，请重试。");
    } finally {
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
      <label className={`focus-within:outline-fg flex min-h-32 min-w-0 flex-col items-center justify-center rounded-sm border border-dashed border-hairline bg-surface p-4 text-center transition hover:-translate-y-0.5 hover:border-brand/50 hover:bg-surface-2 ${isBusy ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
        <input
          type="file"
          multiple
          accept="image/*,video/*"
          className="sr-only"
          disabled={isBusy}
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        {isUploading ? (
          <Loader2 className="mb-2 h-6 w-6 animate-spin text-brand" />
        ) : (
          <Video className="mb-2 h-6 w-6 text-fg rk-pop" />
        )}
        <span className="max-w-full break-words text-sm font-black">
          {isUploading ? (locale === "en" ? "Uploading…" : "上传中…") : copy.mediaUpload}
        </span>
        <span className="mt-1 max-w-full break-words text-xs text-fg-muted">{copy.mediaNote}</span>
      </label>
      {assets.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {assets.map((asset) => (
            <div key={asset.id} className="flex min-w-0 items-center justify-between gap-2 rounded-sm border border-hairline bg-surface px-3 py-2 text-xs font-bold shadow-panel">
              <span className="min-w-0 flex-1 truncate">{asset.name}</span>
              <span className="shrink-0 text-fg-muted">{asset.type}</span>
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
