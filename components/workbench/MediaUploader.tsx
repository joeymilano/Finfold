"use client";

import { ImagePlus, Loader2, Video } from "lucide-react";
import { useState } from "react";
import { addToast } from "@/components/ui/Toast";
import type { MediaAsset } from "@/lib/content-schema";
import { dashboardCopy, type Locale } from "@/lib/i18n";

type MediaUploaderProps = {
  assets: MediaAsset[];
  onChange: (assets: MediaAsset[]) => void;
  locale: Locale;
};

export function MediaUploader({ assets, onChange, locale }: MediaUploaderProps) {
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

  return (
    <section className="panel rounded-md p-4">
      <div className="mb-3 flex items-center gap-2">
        <ImagePlus className="h-4 w-4 text-fg" />
        <h2 className="text-sm font-black">{copy.mediaTitle}</h2>
      </div>
<<<<<<< Updated upstream
      <label className="focus-within:outline-fg flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-sm border border-dashed border-hairline bg-surface p-4 text-center transition hover:-translate-y-0.5 hover:border-brand/50 hover:bg-surface-2">
=======
      <label className={`focus-within:outline-fg flex min-h-32 min-w-0 flex-col items-center justify-center rounded-sm border border-dashed border-hairline bg-surface p-4 text-center transition hover:-translate-y-0.5 hover:border-brand/50 hover:bg-surface-2 ${isUploading ? "cursor-wait opacity-60" : "cursor-pointer"}`}>
>>>>>>> Stashed changes
        <input
          type="file"
          multiple
          accept="image/*,video/*"
          className="sr-only"
          disabled={isUploading}
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
<<<<<<< Updated upstream
        <Video className="mb-2 h-6 w-6 text-fg rk-pop" />
        <span className="text-sm font-black">{copy.mediaUpload}</span>
        <span className="mt-1 text-xs text-fg-muted">{copy.mediaNote}</span>
=======
        {isUploading ? (
          <Loader2 className="mb-2 h-6 w-6 animate-spin text-brand" />
        ) : (
          <Video className="mb-2 h-6 w-6 text-fg rk-pop" />
        )}
        <span className="max-w-full break-words text-sm font-black">
          {isUploading ? (locale === "en" ? "Uploading…" : "上传中…") : copy.mediaUpload}
        </span>
        <span className="mt-1 max-w-full break-words text-xs text-fg-muted">{copy.mediaNote}</span>
>>>>>>> Stashed changes
      </label>
      {assets.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {assets.map((asset) => (
            <div key={asset.id} className="flex items-center justify-between rounded-sm border border-hairline bg-surface px-3 py-2 text-xs font-bold shadow-panel">
              <span className="truncate">{asset.name}</span>
              <span className="text-fg-muted">{asset.type}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
