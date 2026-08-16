"use client";

import { CheckCircle2, Image as ImageIcon, Lightbulb, Link2, Loader2, Plus } from "@/components/ui/icons";
import { useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { dashboardCopy, type Locale } from "@/lib/i18n";
import { captureEvent } from "@/lib/posthog";
import { appendTranscript, SpeechInputButton } from "@/components/ui/SpeechInputButton";

type IdeaInputProps = {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  disabled?: boolean;
};

type CaptureResult = { title?: string; summary: string; keyPoints: string[] };

const ideaInputCopy = {
  zh: {
    fetchLink: "抓取链接…",
    charCount: (n: number) => `${n} 字符`,
    hint: "可直接粘贴产品官网 / GitHub Release / changelog 链接，自动抓取要点。",
    ocr: "从截图提文字",
    ocrHint: "上传产品页面 / changelog / 竞品截图，自动提取要点。",
    ocrWorking: "识别中…",
    capturedPoints: "已抓取要点（勾选后加入输入框）",
    addSelected: "加入输入框",
    noPoints: "未提取到可用要点，请换张图或直接描述。",
    unusableResponse: "视觉模型返回格式异常，请重试。此尝试不会扣除 AI Credits。",
    ocrFailed: "OCR 失败，请换张图或改用文字描述。"
  },
  en: {
    fetchLink: "Fetching link…",
    charCount: (n: number) => `${n} chars`,
    hint: "Paste a product URL, GitHub Release, or changelog link — key points are auto-extracted.",
    ocr: "Extract from screenshot",
    ocrHint: "Upload a product page / changelog / competitor screenshot to auto-extract points.",
    ocrWorking: "Recognizing…",
    capturedPoints: "Captured points (select to add to the input)",
    addSelected: "Add to input",
    noPoints: "No usable points found — try another image or describe it yourself.",
    unusableResponse: "The vision model returned an unusable response. Please retry — no AI Credits were charged.",
    ocrFailed: "OCR failed — try another image or describe it in text."
  }
} as const;

/**
 * 产品更新输入框（P1-1 素材收集箱入口）。除了手打文字，整段粘贴一个
 * 产品官网 / GitHub Release / changelog 链接时会自动抓取并抽成要点；也可
 * 上传截图走 OCR 提取。两类抓取结果都不直接覆盖输入框，而是渲染成可勾选
 * 的要点列表——用户勾选后再"加入输入框"，把"输入太薄"变成"挑要点即得素材"。
 */
export function IdeaInput({ value, onChange, locale, disabled = false }: IdeaInputProps) {
  const copy = dashboardCopy[locale];
  const local = ideaInputCopy[locale];
  const [capturing, setCapturing] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [selectedPoints, setSelectedPoints] = useState<Set<string>>(new Set());
  const [captureSource, setCaptureSource] = useState<"url" | "image" | null>(null);
  const [linkAssistVisible, setLinkAssistVisible] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
      applyCapture("url", { summary: data.summary, keyPoints: data.keyPoints ?? [] });
      captureEvent("idea_captured", { source: "url", keyPoints: data.keyPoints?.length ?? 0 });
    } catch (caught) {
      setCaptureError(caught instanceof Error ? caught.message : "Capture failed.");
    } finally {
      setCapturing(false);
    }
  }

  async function captureImage(file: File) {
    setOcrLoading(true);
    setCaptureError(null);
    setCaptureResult(null);
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
        return;
      }
      applyCapture("image", { summary: data.summary, keyPoints: points });
      captureEvent("idea_captured", { source: "image", keyPoints: points.length });
    } catch (caught) {
      setCaptureError(caught instanceof Error ? caught.message : local.ocrFailed);
    } finally {
      setOcrLoading(false);
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
    setCaptureResult(null);
    setSelectedPoints(new Set());
    setCaptureSource(null);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (capturing || disabled) return;
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
    if (file) void captureImage(file);
  }

  const busy = capturing || ocrLoading || disabled;
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
        data-testid="workbench-source-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPaste={handlePaste}
        disabled={busy}
        className="focus-ring min-h-[164px] w-full resize-none rounded-sm border border-hairline bg-surface p-3 text-sm font-medium leading-6 shadow-panel text-fg placeholder:text-fg-muted/60 disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-[260px] lg:p-4"
        placeholder={copy.ideaHint}
      />

      {/* OCR 入口 */}
      <div className="mt-2 grid grid-cols-3 items-start gap-2 lg:flex lg:flex-wrap lg:items-center">
        <SpeechInputButton
          locale={locale}
          disabled={busy}
          className="w-full"
          buttonClassName="w-full"
          onTranscript={(transcript) => onChange(appendTranscript(value, transcript))}
        />
        <label className={`focus-ring inline-flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2 ${busy ? "cursor-not-allowed opacity-50" : ""}`}>
          <ImageIcon className="h-3.5 w-3.5" />
          <span className="lg:hidden">{locale === "en" ? "Image" : "图片"}</span>
          <span className="hidden lg:inline">{local.ocr}</span>
          <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={handleImagePick} />
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
        {captureSource === "image" ? (
          <span className="col-span-3 min-w-0 flex-1 break-words text-[11px] leading-4 text-fg-muted lg:col-span-1">{local.ocrHint}</span>
        ) : null}
      </div>

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

      {/* 抓取要点勾选列表（URL + OCR 共用） */}
      {captureResult && allPoints.length > 0 ? (
        <div className="mt-3 rounded-sm border border-hairline bg-surface-2 p-3">
          <p className="mb-2 text-[11px] font-bold text-fg-muted">{local.capturedPoints}</p>
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
        <p className="mt-2 text-xs font-medium text-risk">{captureError}</p>
      ) : null}
    </section>
  );
}
