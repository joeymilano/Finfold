"use client";

import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Lightbulb,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  X
} from "@/components/ui/icons";
import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { dashboardCopy, type Locale } from "@/lib/i18n";
import { captureEvent } from "@/lib/posthog";
import { appendTranscript, SpeechInputButton } from "@/components/ui/SpeechInputButton";
import { addToast } from "@/components/ui/Toast";
import {
  AGENT_ATTACHMENT_ACCEPT,
  dedupePastedFiles,
  formatAgentAttachmentSize,
  type AgentAttachment,
  type AgentAttachmentKind
} from "@/lib/agent/attachments";
import type { CaptureSource, SourceImageCandidate } from "@/lib/source-image";

type IdeaInputProps = {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  attachments?: AgentAttachment[];
  onAttachmentsChange?: (attachments: AgentAttachment[]) => void;
  onSourceImagesDiscovered?: (result: {
    source?: CaptureSource;
    imageCandidates: SourceImageCandidate[];
  }) => void;
  disabled?: boolean;
};

type CaptureResult = {
  title?: string;
  summary: string;
  keyPoints: string[];
  source?: CaptureSource;
  imageCandidates?: SourceImageCandidate[];
};

const ideaInputCopy = {
  zh: {
    fetchLink: "抓取链接…",
    charCount: (n: number) => `${n} 字符`,
    hint: "可直接粘贴产品官网 / GitHub Release / changelog 链接，自动抓取要点。",
    ocr: "图片理解",
    ocrWorking: "理解图片中…",
    files: "上传资料",
    filesShort: "资料",
    filesHint: "支持视频、PDF、DOCX、PPTX、XLSX、CSV、JSON、Markdown 等；内容会真实进入本次生成。",
    fileUploading: "上传资料中…",
    removeFile: "移除源文件",
    capturedPoints: "已整理要点（勾选后加入输入框）",
    addSelected: "加入输入框",
    retryImage: "重新理解",
    removeImage: "移除图片",
    removeCapture: "移除",
    noPoints: "没能从这张图理解到内容，换张图或直接描述。",
    unusableResponse: "视觉模型返回格式异常，请重试。此尝试不会扣除 AI Credits。",
    ocrFailed: "图片理解失败，请换张图或改用文字描述。"
  },
  en: {
    fetchLink: "Fetching link…",
    charCount: (n: number) => `${n} chars`,
    hint: "Paste a product URL, GitHub Release, or changelog link — key points are auto-extracted.",
    ocr: "Understand image",
    ocrWorking: "Reading the image…",
    files: "Upload sources",
    filesShort: "Files",
    filesHint: "Video, PDF, DOCX, PPTX, XLSX, CSV, JSON, Markdown, and more. Contents are read for this generation.",
    fileUploading: "Uploading sources…",
    removeFile: "Remove source file",
    capturedPoints: "Key points ready (select to add to the input)",
    addSelected: "Add to input",
    retryImage: "Try again",
    removeImage: "Remove image",
    removeCapture: "Remove",
    noPoints: "Couldn't understand this image — try another one or describe it yourself.",
    unusableResponse: "The vision model returned an unusable response. Please retry — no AI Credits were charged.",
    ocrFailed: "Image understanding failed — try another image or describe it in text."
  }
} as const;

/**
 * 产品更新输入框（P1-1 素材收集箱入口）。除了手打文字，整段粘贴一个
 * 产品官网 / GitHub Release / changelog 链接时会自动抓取并抽成要点；也可
 * 上传任意图片（截图、产品图、设计稿、照片均可，不要求图里有文字），
 * 由视觉模型看懂内容后整理成要点。两类结果都不直接覆盖输入框，而是渲染
 * 成可勾选的要点列表——用户勾选后再"加入输入框"，把"输入太薄"变成
 * "挑要点即得素材"。
 */
const attachmentIcon: Record<AgentAttachmentKind, typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  pdf: FileText,
  document: FileText,
  data: FileSpreadsheet
};

export function IdeaInput({
  value,
  onChange,
  locale,
  attachments = [],
  onAttachmentsChange,
  onSourceImagesDiscovered,
  disabled = false
}: IdeaInputProps) {
  const copy = dashboardCopy[locale];
  const local = ideaInputCopy[locale];
  const [capturing, setCapturing] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureErrorSource, setCaptureErrorSource] = useState<"url" | "image" | "files" | null>(null);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [selectedPoints, setSelectedPoints] = useState<Set<string>>(new Set());
  const [captureSource, setCaptureSource] = useState<"url" | "image" | null>(null);
  const [linkAssistVisible, setLinkAssistVisible] = useState(false);
  const [lastImageFile, setLastImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 保留最近一次图片理解的本地预览与文件引用：要点不满意时可以直接重跑，
  // 不必回到文件选择器再选一遍；移除图片时一并释放。
  useEffect(() => {
    if (!lastImageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(lastImageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [lastImageFile]);

  function applyCapture(source: "url" | "image", result: CaptureResult) {
    const all = [
      result.summary,
      ...result.keyPoints.map((point) => point.replace(/^•\s*/, ""))
    ].filter((line) => line.trim().length > 0);
    setCaptureResult({ summary: result.summary, keyPoints: result.keyPoints });
    setSelectedPoints(new Set(all));
    setCaptureSource(source);
  }

  async function captureUrl(url: string) {
    setCapturing(true);
    setCaptureError(null);
    setCaptureErrorSource(null);
    setCaptureResult(null);
    try {
      const response = await fetch("/api/capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({ url })
      });
      const data = (await response.json()) as CaptureResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Capture failed.");
      onSourceImagesDiscovered?.({
        source: data.source,
        imageCandidates: data.imageCandidates ?? []
      });
      applyCapture("url", { summary: data.summary, keyPoints: data.keyPoints ?? [] });
      captureEvent("idea_captured", { source: "url", keyPoints: data.keyPoints?.length ?? 0 });
    } catch (caught) {
      setCaptureError(caught instanceof Error ? caught.message : "Capture failed.");
      setCaptureErrorSource("url");
    } finally {
      setCapturing(false);
    }
  }

  async function captureImage(file: File) {
    setOcrLoading(true);
    setCaptureError(null);
    setCaptureErrorSource(null);
    // 注意：这里不清 captureResult。重新理解时旧要点保留到新结果就绪，
    // 重试失败也不会把用户手里已有的内容弄丢。
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/capture/image", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: form
      });
      const data = (await response.json()) as CaptureResult & { error?: string; code?: string };
      if (!response.ok) {
        if (data.code === "no_usable_content") throw new Error(local.noPoints);
        if (data.code === "unusable_model_response") throw new Error(local.unusableResponse);
        throw new Error(data.error ?? local.ocrFailed);
      }
      if (data.error) throw new Error(data.error);
      const points = data.keyPoints ?? [];
      if (!data.summary && points.length === 0) {
        setCaptureError(local.noPoints);
        setCaptureErrorSource("image");
        return;
      }
      applyCapture("image", { summary: data.summary, keyPoints: points });
      captureEvent("idea_captured", { source: "image", keyPoints: points.length });
    } catch (caught) {
      setCaptureError(caught instanceof Error ? caught.message : local.ocrFailed);
      setCaptureErrorSource("image");
    } finally {
      setOcrLoading(false);
    }
  }

  async function uploadSourceFiles(files: FileList | File[] | null) {
    if (!files?.length || fileUploading || disabled || !onAttachmentsChange) return;
    const remaining = Math.max(0, 6 - attachments.length);
    if (remaining === 0) {
      addToast("error", locale === "en" ? "Add up to 6 source files." : "每次最多添加 6 份源文件。");
      return;
    }
    setFileUploading(true);
    setCaptureError(null);
    setCaptureErrorSource(null);
    try {
      const form = new FormData();
      Array.from(files).slice(0, remaining).forEach((file) => form.append("files", file));
      const response = await fetch("/api/agent/attachments", { method: "POST", body: form });
      const data = await response.json().catch(() => ({})) as {
        attachments?: AgentAttachment[];
        error?: string;
      };
      if (!response.ok || !data.attachments) {
        throw new Error(data.error ?? (locale === "en" ? "Source upload failed." : "源文件上传失败。"));
      }
      onAttachmentsChange([...attachments, ...data.attachments]);
      captureEvent("workbench_source_attachments_added", {
        count: data.attachments.length,
        kinds: Array.from(new Set(data.attachments.map((attachment) => attachment.kind))).join(",")
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : (locale === "en" ? "Source upload failed." : "源文件上传失败。");
      setCaptureError(message);
      setCaptureErrorSource("files");
      addToast("error", message);
    } finally {
      setFileUploading(false);
    }
  }

  function togglePoint(point: string) {
    setSelectedPoints((prev) => {
      const next = new Set(prev);
      if (next.has(point)) next.delete(point);
      else next.add(point);
      return next;
    });
  }

  function commitSelected() {
    if (!captureResult) return;
    const all = [captureResult.summary, ...captureResult.keyPoints.map((p) => p.replace(/^•\s*/, ""))];
    const picked = all.filter((line) => line.trim().length > 0 && selectedPoints.has(line));
    if (picked.length === 0) return;
    const block = picked.map((line) => `• ${line}`).join("\n");
    const merged = value.trim().length > 0 ? `${value.trimEnd()}\n\n${block}` : block;
    onChange(merged);
    discardCapture();
  }

  function discardCapture() {
    setCaptureResult(null);
    setSelectedPoints(new Set());
    setCaptureSource(null);
    setCaptureError(null);
    setCaptureErrorSource(null);
    setLastImageFile(null);
  }

  function retryImageCapture() {
    if (!lastImageFile || ocrLoading || capturing || disabled) return;
    void captureImage(lastImageFile);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (capturing || disabled) return;
    const pastedFiles = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (pastedFiles.length > 0 && onAttachmentsChange) {
      event.preventDefault();
      void uploadSourceFiles(dedupePastedFiles(pastedFiles));
      return;
    }
    const pasted = event.clipboardData?.getData("text") ?? "";
    const match = pasted.match(/https?:\/\/\S+/);
    if (!match) return;
    // 整段粘贴就是一个 URL → 抓取并替换，而不是把裸链接留在框里。
    if (pasted.trim() === match[0]) {
      event.preventDefault();
      setLinkAssistVisible(false);
      void captureUrl(match[0]);
    }
  }

  function handleImagePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      // 换了一张新图：旧图的要点不再保留；重试同一张图走 retryImageCapture。
      setCaptureResult(null);
      setSelectedPoints(new Set());
      setCaptureSource(null);
      setLastImageFile(file);
      void captureImage(file);
    }
  }

  const busy = capturing || ocrLoading || fileUploading || disabled;
  const allPoints = captureResult
    ? [captureResult.summary, ...captureResult.keyPoints.map((p) => p.replace(/^•\s*/, ""))].filter((line) => line.trim().length > 0)
    : [];

  return (
    <section className="panel rounded-md p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden h-7 w-7 items-center justify-center rounded-sm bg-action text-xs font-black text-on-action lg:flex">1</span>
          <Lightbulb className="hidden h-4 w-4 text-fg lg:block" />
          <h2 className="min-w-0 break-words text-sm font-black">
            <span className="lg:hidden">{locale === "en" ? "What are you publishing?" : "你要发什么？"}</span>
            <span className="hidden lg:inline">{copy.inputStep}</span>
          </h2>
        </div>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs text-fg-muted">
          {capturing ? (
            <span className="inline-flex items-center gap-1 text-action-strong dark:text-action">
              <Loader2 className="h-3 w-3 animate-spin" />
              {local.fetchLink}
            </span>
          ) : null}
          {ocrLoading ? (
            <span className="inline-flex items-center gap-1 text-action-strong dark:text-action">
              <Loader2 className="h-3 w-3 animate-spin" />
              {local.ocrWorking}
            </span>
          ) : null}
          {fileUploading ? (
            <span className="inline-flex items-center gap-1 text-action-strong dark:text-action">
              <Loader2 className="h-3 w-3 animate-spin" />
              {local.fileUploading}
            </span>
          ) : null}
          <span className="lg:hidden">{value.length.toLocaleString()} / 5,000</span>
          <span className="hidden lg:inline">{local.charCount(value.length)}</span>
        </span>
      </div>
      <p className="mb-2 hidden min-w-0 items-start gap-1.5 break-words text-[11px] leading-4 text-fg-muted lg:flex">
        <Link2 className="h-3 w-3 shrink-0" />
        {local.hint}
      </p>
      <textarea
        ref={textareaRef}
        dir="auto"
        data-testid="workbench-source-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPaste={handlePaste}
        disabled={busy}
        className="focus-ring min-h-[164px] w-full resize-none rounded-sm border border-hairline bg-surface p-3 text-start text-sm font-medium leading-6 shadow-panel text-fg placeholder:text-fg-muted/60 disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-[260px] lg:p-4"
        placeholder={copy.ideaHint}
      />

      {/* OCR 入口 */}
      <div className="mt-2 grid grid-cols-2 items-start gap-2 lg:flex lg:flex-wrap lg:items-center">
        <SpeechInputButton
          locale={locale}
          disabled={busy}
          className="w-full"
          buttonClassName="w-full"
          onTranscript={(transcript) => onChange(appendTranscript(value, transcript))}
        />
        <label className={`focus-ring inline-flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2 ${busy ? "cursor-not-allowed opacity-50" : ""}`}>
          <Paperclip className="h-3.5 w-3.5" />
          <span className="lg:hidden">{local.filesShort}</span>
          <span className="hidden lg:inline">{local.files}</span>
          <input
            type="file"
            accept={AGENT_ATTACHMENT_ACCEPT}
            multiple
            aria-label={local.files}
            className="sr-only"
            disabled={busy || !onAttachmentsChange}
            onChange={(event) => {
              void uploadSourceFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <label className={`focus-ring inline-flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2 ${busy ? "cursor-not-allowed opacity-50" : ""}`}>
          <ImageIcon className="h-3.5 w-3.5" />
          <span className="lg:hidden">{locale === "en" ? "Image" : "图片"}</span>
          <span className="hidden lg:inline">{local.ocr}</span>
          <input type="file" accept="image/*" aria-label={local.ocr} className="sr-only" disabled={busy} onChange={handleImagePick} />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setLinkAssistVisible(true);
            textareaRef.current?.focus();
          }}
          className="focus-ring inline-flex min-h-8 items-center justify-center gap-1.5 rounded-sm border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Link2 className="h-3.5 w-3.5" />
          {locale === "en" ? "Link" : "链接"}
        </button>
      </div>

      {attachments.length > 0 ? (
        <div className="mt-3 rounded-sm border border-action/20 bg-action/[0.035] p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-fg">
              {locale === "en" ? `${attachments.length} source file${attachments.length === 1 ? "" : "s"} ready` : `已添加 ${attachments.length} 份源文件`}
            </p>
            <p className="hidden text-[10px] text-fg-muted sm:block">{local.filesHint}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((attachment, index) => {
              const Icon = attachmentIcon[attachment.kind];
              return (
                <span key={attachment.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2 py-1.5 text-[10px] text-fg shadow-panel">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-action-strong dark:text-action" />
                  <span className="max-w-40 truncate font-semibold">{attachment.name}</span>
                  <span className="shrink-0 text-fg-subtle">{formatAgentAttachmentSize(attachment.size)}</span>
                  <button
                    type="button"
                    disabled={busy || !onAttachmentsChange}
                    onClick={() => onAttachmentsChange?.(attachments.filter((_, candidate) => candidate !== index))}
                    aria-label={`${local.removeFile}: ${attachment.name}`}
                    className="focus-ring ml-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-fg-subtle transition hover:bg-surface-2 hover:text-risk disabled:opacity-40"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-fg-muted sm:hidden">{local.filesHint}</p>
        </div>
      ) : null}

      {linkAssistVisible && !captureResult ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-fg-muted">
          <Link2 className="mt-0.5 h-3 w-3 shrink-0" />
          {locale === "en" ? "Paste a product or changelog URL into the field; Finfold will extract the useful points." : "把产品页或更新日志链接粘贴到输入框，Finfold 会自动提取可用要点。"}
        </p>
      ) : null}

      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-muted lg:hidden">
        <CheckCircle2 className="h-3 w-3 text-positive" />
        {locale === "en" ? "Draft stays available while you move between steps" : "切换步骤时会保留当前草稿"}
      </p>

      {/* 抓取要点勾选列表（URL + 图片理解共用） */}
      {captureResult && allPoints.length > 0 ? (
        <div className="mt-3 rounded-sm border border-hairline bg-surface-2 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {captureSource === "image" && imagePreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagePreviewUrl}
                  alt=""
                  data-testid="captured-image-preview"
                  className="h-8 w-8 shrink-0 rounded-sm border border-hairline object-cover"
                />
              ) : null}
              <p className="min-w-0 break-words text-[11px] font-bold text-fg-muted">{local.capturedPoints}</p>
            </div>
            <span className="flex shrink-0 items-center gap-1">
              {captureSource === "image" && lastImageFile ? (
                <button
                  type="button"
                  onClick={retryImageCapture}
                  disabled={busy}
                  className="focus-ring inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-[11px] font-medium text-action-strong transition-colors hover:bg-action/[0.08] disabled:cursor-not-allowed disabled:opacity-40 dark:text-action"
                >
                  <RefreshCw className="h-3 w-3" />
                  {local.retryImage}
                </button>
              ) : null}
              <button
                type="button"
                onClick={discardCapture}
                disabled={busy}
                aria-label={captureSource === "image" ? local.removeImage : local.removeCapture}
                className="focus-ring inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-3 w-3" />
                {captureSource === "image" ? local.removeImage : local.removeCapture}
              </button>
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {allPoints.map((point) => {
              const checked = selectedPoints.has(point);
              return (
                <li key={point}>
                  <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-fg">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePoint(point)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-action"
                    />
                    <span>{point}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={commitSelected}
            disabled={selectedPoints.size === 0}
            className="focus-ring mt-2.5 inline-flex items-center gap-1.5 rounded-sm border border-action/45 bg-action/[0.08] px-2.5 py-1.5 text-xs font-bold text-action-strong transition-colors hover:bg-action/[0.14] disabled:cursor-not-allowed disabled:opacity-40 dark:text-action"
          >
            <Plus className="h-3.5 w-3.5" />
            {local.addSelected}
          </button>
        </div>
      ) : null}

      {captureError ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 break-words text-xs font-medium text-risk">{captureError}</p>
          {captureErrorSource === "image" && lastImageFile ? (
            <button
              type="button"
              onClick={retryImageCapture}
              disabled={busy}
              className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-sm border border-hairline bg-surface px-2 py-1 text-[11px] font-medium text-fg transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw className="h-3 w-3" />
              {local.retryImage}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
