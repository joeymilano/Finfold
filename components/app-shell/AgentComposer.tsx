"use client";

import React, { type ClipboardEvent, type DragEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUp,
  BarChart3,
  FileSpreadsheet,
  FileText,
  Film,
  Image,
  Loader2,
  Plus,
  Sparkles,
  Square,
  Target,
  X
} from "@/components/ui/icons";
import { appendTranscript, SpeechInputButton } from "@/components/ui/SpeechInputButton";
import {
  AGENT_ATTACHMENT_ACCEPT,
  formatAgentAttachmentSize,
  type AgentAttachment,
  type AgentAttachmentKind
} from "@/lib/agent/attachments";

type AgentComposerProps = {
  locale: "zh" | "en";
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  sending: boolean;
  onStop: () => void;
  attachments?: AgentAttachment[];
  onFiles: (files: FileList | File[] | null) => void;
  onRemoveAttachment?: (index: number) => void;
  uploading?: boolean;
  placeholder: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  compact?: boolean;
};

const attachmentIcon: Record<AgentAttachmentKind, typeof Image> = {
  image: Image,
  video: Film,
  pdf: FileText,
  document: FileText,
  data: FileSpreadsheet
};

export function AgentComposer({
  locale,
  value,
  onChange,
  onSubmit,
  sending,
  onStop,
  attachments = [],
  onFiles,
  onRemoveAttachment,
  uploading = false,
  placeholder,
  textareaRef,
  compact = false
}: AgentComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const addMenuButtonRef = useRef<HTMLButtonElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const canSend = Boolean(value.trim() || attachments.length) && !uploading;
  const copy = locale === "zh"
    ? {
        attach: "添加文件",
        attachDesc: "图片、文档或数据",
        addOrAutomate: "添加或使用自动化",
        menu: "添加与自动化",
        automate: "让 Finfold 做",
        remove: "移除附件",
        send: "发送",
        stop: "暂停",
        upload: "正在上传"
      }
    : {
        attach: "Add files",
        attachDesc: "Images, documents, or data",
        addOrAutomate: "Add or use automation",
        menu: "Add and automate",
        automate: "Let Finfold do it",
        remove: "Remove attachment",
        send: "Send",
        stop: "Pause",
        upload: "Uploading"
      };
  const automationActions = locale === "zh"
    ? [
        { label: "诊断账号", description: "找出瓶颈和下一步", prompt: "帮我诊断账号。先告诉我需要哪些资料。", icon: Activity },
        { label: "学习博主", description: "提炼可迁移的风格能力", prompt: "帮我学习一个对标博主。先告诉我需要哪些主页链接和样本。", icon: Target },
        { label: "调研机会", description: "分析品类或竞品", prompt: "帮我调研一个品类或竞品机会。先问我需要补充什么。", icon: BarChart3 },
        { label: "规划内容", description: "从选题到发布计划", prompt: "帮我规划下一轮内容，从选题到发布步骤。", icon: Sparkles }
      ]
    : [
        { label: "Diagnose account", description: "Find the bottleneck and next step", prompt: "Help me diagnose my account. First tell me what evidence you need.", icon: Activity },
        { label: "Learn from a creator", description: "Extract transferable style rules", prompt: "Help me learn from a benchmark creator. First tell me which profile link and samples you need.", icon: Target },
        { label: "Research an opportunity", description: "Analyze a category or competitor", prompt: "Help me research a category or competitor opportunity. First ask what minimum context you need.", icon: BarChart3 },
        { label: "Plan content", description: "From topic to publishing plan", prompt: "Help me plan the next content cycle, from topics to publishing steps.", icon: Sparkles }
      ];

  useEffect(() => {
    if (!addMenuOpen) return;
    const firstMenuItem = addMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    requestAnimationFrame(() => firstMenuItem?.focus());

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (addMenuRef.current?.contains(target) || addMenuButtonRef.current?.contains(target)) return;
      setAddMenuOpen(false);
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setAddMenuOpen(false);
      addMenuButtonRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [addMenuOpen]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend && !sending) onSubmit();
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault();
      setDragOver(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget === event.target) setDragOver(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    if (uploading || sending) return;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) onFiles(files);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (uploading || sending) return;
    const items = event.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      event.preventDefault();
      onFiles(files);
    }
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`relative rounded-[24px] border bg-surface/96 shadow-raised transition focus-within:ring-2 focus-within:ring-action/10 ${dragOver ? "border-action/60 bg-action/[0.04] ring-2 ring-action/15" : "border-hairline focus-within:border-action/50"} ${compact ? "p-2.5" : "p-3"}`}
    >
      {dragOver ? (
        <div className="mb-2 rounded-xl border border-dashed border-action/50 bg-action/[0.06] px-3 py-2 text-center text-[11px] font-bold text-action-strong dark:text-action">
          {locale === "zh" ? "松开即可添加截图或文件" : "Drop to attach screenshots or files"}
        </div>
      ) : null}
      {attachments.length ? (
        <div className="mb-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto px-0.5" aria-label={locale === "zh" ? "待发送附件" : "Pending attachments"}>
          {attachments.map((attachment, index) => {
            const Icon = attachmentIcon[attachment.kind];
            return (
              <span key={`${attachment.id}-${index}`} className="group inline-flex max-w-full items-center gap-2 rounded-xl border border-hairline bg-surface-2/80 py-1.5 pl-2 pr-1.5 text-left">
                {attachment.kind === "image" && attachment.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attachment.url} alt="" className="h-7 w-7 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-action/[0.09] text-action-strong dark:text-action">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="min-w-0 max-w-44">
                  <span className="block truncate text-[11px] font-bold text-fg">{attachment.name}</span>
                  <span className="block text-[9px] text-fg-subtle">{formatAgentAttachmentSize(attachment.size)}</span>
                </span>
                {onRemoveAttachment ? (
                  <button type="button" onClick={() => onRemoveAttachment(index)} className="focus-ring grid h-6 w-6 shrink-0 place-items-center rounded-full text-fg-subtle transition hover:bg-surface hover:text-fg" aria-label={`${copy.remove}: ${attachment.name}`}>
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}

      <textarea
        ref={textareaRef ?? internalTextareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        rows={compact ? 2 : 3}
        maxLength={4000}
        placeholder={placeholder}
        className={`w-full resize-none bg-transparent px-1 text-fg outline-none placeholder:text-fg-subtle ${compact ? "min-h-[58px] py-1 text-[15px] leading-6" : "min-h-[76px] py-1.5 text-base leading-6"}`}
      />

      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept={AGENT_ATTACHMENT_ACCEPT}
            multiple
            className="sr-only"
            disabled={uploading || sending}
            onChange={(event) => {
              onFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            ref={addMenuButtonRef}
            type="button"
            onClick={() => setAddMenuOpen((open) => !open)}
            disabled={uploading || sending}
            className="focus-ring relative grid h-9 w-9 place-items-center rounded-full text-fg-muted transition after:absolute after:-inset-1 after:content-[''] hover:bg-surface-2 hover:text-fg disabled:opacity-45"
            aria-label={uploading ? copy.upload : copy.addOrAutomate}
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
            aria-controls="agent-add-menu"
            title={copy.addOrAutomate}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className={`h-4 w-4 transition-transform ${addMenuOpen ? "rotate-45" : ""}`} />}
          </button>
          {addMenuOpen ? (
            <div
              ref={addMenuRef}
              id="agent-add-menu"
              role="menu"
              aria-label={copy.menu}
              className="absolute bottom-14 left-2 z-40 w-[min(22rem,calc(100vw-4rem))] overflow-hidden rounded-2xl border border-hairline bg-surface/98 p-2 text-fg shadow-[0_24px_70px_rgb(0_0_0/0.38)] backdrop-blur-xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAddMenuOpen(false);
                  fileInputRef.current?.click();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-action/35"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-muted">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg">{copy.attach}</span>
                  <span className="mt-0.5 block text-xs text-fg-muted">{copy.attachDesc}</span>
                </span>
              </button>

              <div className="my-2 border-t border-hairline" />
              <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">{copy.automate}</p>
              <div className="grid gap-0.5 sm:grid-cols-2">
                {automationActions.map((action) => {
                  const ActionIcon = action.icon;
                  return (
                    <button
                      key={action.label}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onChange(action.prompt);
                        setAddMenuOpen(false);
                        requestAnimationFrame(() => (textareaRef?.current ?? internalTextareaRef.current)?.focus());
                      }}
                      className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-action/35"
                    >
                      <ActionIcon className="mt-0.5 h-4 w-4 shrink-0 text-action" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-fg">{action.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-fg-muted">{action.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <SpeechInputButton
            locale={locale}
            compact
            disabled={sending || uploading}
            onTranscript={(transcript) => onChange(appendTranscript(value, transcript))}
            buttonClassName="!h-9 !w-9 !rounded-full !border-0 !bg-transparent !p-0 hover:!bg-surface-2"
          />
        </div>

        {sending ? (
          <button type="button" onClick={onStop} className="focus-ring relative grid h-9 w-9 place-items-center rounded-full bg-fg text-bg shadow-sm transition after:absolute after:-inset-1 after:content-[''] hover:opacity-85" aria-label={copy.stop} title={copy.stop}>
            <Square className="h-3 w-3 fill-current" />
          </button>
        ) : (
          <button type="button" onClick={onSubmit} disabled={!canSend} className="focus-ring relative grid h-9 w-9 place-items-center rounded-full bg-action text-on-action shadow-[0_5px_16px_rgb(var(--action)/0.2)] transition after:absolute after:-inset-1 after:content-[''] hover:bg-action-strong disabled:cursor-not-allowed disabled:bg-fg disabled:text-bg disabled:opacity-25 disabled:shadow-none" aria-label={copy.send}>
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
