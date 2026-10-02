"use client";

import React, { type ClipboardEvent, type DragEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUp,
  BarChart3,
  Check,
  FileSpreadsheet,
  FileText,
  Film,
  Gauge,
  Image,
  Loader2,
  Paperclip,
  Plus,
  Sparkles,
  Square,
  Target,
  X
} from "@/components/ui/icons";
import { appendTranscript, SpeechInputButton } from "@/components/ui/SpeechInputButton";
import {
  AGENT_ATTACHMENT_ACCEPT,
  dedupePastedFiles,
  formatAgentAttachmentSize,
  type AgentAttachment,
  type AgentAttachmentKind
} from "@/lib/agent/attachments";
import {
  AGENT_DEPTH_LABELS,
  AGENT_DEPTH_LEVELS,
  type AgentDepth
} from "@/lib/agent/depth";

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
  /** Thinking depth for the next run. Owned by the parent so it also reaches
   *  the chat request; switching mid-run only affects the next message. */
  depth?: AgentDepth;
  onDepthChange?: (depth: AgentDepth) => void;
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
  compact = false,
  depth = "low",
  onDepthChange
}: AgentComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const addMenuButtonRef = useRef<HTMLButtonElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const depthMenuButtonRef = useRef<HTMLButtonElement>(null);
  const depthMenuRef = useRef<HTMLDivElement>(null);
  const dictationBaselineRef = useRef("");
  const [dragOver, setDragOver] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [depthMenuOpen, setDepthMenuOpen] = useState(false);
  const [dictating, setDictating] = useState(false);
  const resolvedTextareaRef = textareaRef ?? internalTextareaRef;
  const canSend = Boolean(value.trim() || attachments.length) && !uploading;
  const copy = locale === "zh"
    ? {
        attach: "添加文件",
        attachDesc: "图片、视频、PDF、Office 文件、JSON 等文件格式",
        add: "添加",
        addOrAutomate: "添加或使用自动化",
        menu: "添加与自动化",
        automate: "让 Finfold 做",
        remove: "移除附件",
        send: "发送",
        steer: "插话",
        stop: "暂停",
        upload: "正在上传",
        depthMenu: "思考深度"
      }
    : {
        attach: "Add files",
        attachDesc: "Video, images, PDF, Office, JSON, and data",
        add: "Add",
        addOrAutomate: "Add or use automation",
        menu: "Add and automate",
        automate: "Let Finfold do it",
        remove: "Remove attachment",
        send: "Send",
        steer: "Steer",
        stop: "Pause",
        upload: "Uploading",
        depthMenu: "Thinking depth"
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
    const textarea = resolvedTextareaRef.current;
    if (!textarea) return;

    const minimumHeight = compact ? 44 : 76;
    const maximumHeight = compact ? 144 : 208;
    textarea.style.height = "auto";
    const contentHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(Math.max(contentHeight, minimumHeight), maximumHeight)}px`;
    textarea.style.overflowY = contentHeight > maximumHeight ? "auto" : "hidden";
  }, [compact, resolvedTextareaRef, value]);

  useEffect(() => {
    if (!addMenuOpen) return;
    setDepthMenuOpen(false);
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

  useEffect(() => {
    if (!depthMenuOpen) return;
    setAddMenuOpen(false);
    const firstMenuItem = depthMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]');
    requestAnimationFrame(() => firstMenuItem?.focus());

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (depthMenuRef.current?.contains(target) || depthMenuButtonRef.current?.contains(target)) return;
      setDepthMenuOpen(false);
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDepthMenuOpen(false);
      depthMenuButtonRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [depthMenuOpen]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      // While a task is running, Enter still submits — the parent queues the
      // message instead of firing a second concurrent run (Codex-style steer).
      if (canSend) onSubmit();
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const menuItems = Array.from(
      addMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? []
    ).filter((item) => !item.disabled);
    if (!menuItems.length) return;

    event.preventDefault();
    const activeIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Home") {
      menuItems[0]?.focus();
      return;
    }
    if (event.key === "End") {
      menuItems.at(-1)?.focus();
      return;
    }

    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = activeIndex < 0
      ? (direction > 0 ? 0 : menuItems.length - 1)
      : (activeIndex + direction + menuItems.length) % menuItems.length;
    menuItems[nextIndex]?.focus();
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
    // Allowed while a task runs: attachments pair with the next queued/steer
    // message, so only an in-flight upload blocks more files.
    if (uploading) return;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) onFiles(files);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (uploading) return;
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
      onFiles(dedupePastedFiles(files));
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
      {!dictating ? (
        <textarea
          ref={resolvedTextareaRef}
          dir="auto"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={compact ? 1 : 3}
          maxLength={4000}
          placeholder={placeholder}
          className={`w-full resize-none bg-transparent px-1 text-start text-fg outline-none placeholder:text-fg-subtle ${compact ? "min-h-11 max-h-36 py-1 text-[15px] leading-6" : "min-h-[76px] max-h-52 py-1.5 text-base leading-6"}`}
        />
      ) : null}

      <div className={`flex items-center justify-between ${dictating ? "gap-0 pt-0" : "gap-3 pt-1"}`}>
        {!dictating ? (
          <div className="relative flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept={AGENT_ATTACHMENT_ACCEPT}
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                onFiles(event.target.files);
                event.target.value = "";
              }}
            />
            {addMenuOpen ? (
              <div
                ref={addMenuRef}
                id="agent-add-menu"
                role="menu"
                aria-label={copy.menu}
                aria-orientation="vertical"
                onKeyDown={handleMenuKeyDown}
                className={`absolute left-0 z-50 max-h-[min(21rem,calc(100dvh-8rem))] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-[18px] border border-hairline bg-surface-raised p-1.5 text-fg shadow-raised ${compact
                  ? "bottom-[calc(100%+0.55rem)]"
                  : "bottom-[calc(100%+0.55rem)] sm:bottom-auto sm:top-[calc(100%+0.55rem)]"}`}
              >
                <p className="px-2.5 pb-0.5 pt-1 text-[11px] font-medium text-fg-subtle">{copy.add}</p>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAddMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-1 text-left transition-[background-color,border-color,color] duration-150 hover:border-hairline hover:bg-surface-2/85 focus-visible:border-action/30 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action/20"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors group-hover:text-action group-focus-visible:text-action">
                    <Paperclip className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-fg">{copy.attach}</span>
                    <span className="mt-0.5 block truncate text-[11px] leading-4 text-fg-muted">{copy.attachDesc}</span>
                  </span>
                </button>

                <div className="mx-2.5 my-1 border-t border-hairline" />
                <p className="px-2.5 pb-0.5 pt-1 text-[11px] font-medium text-fg-subtle">{copy.automate}</p>
                <div className="grid gap-0.5">
                  {automationActions.map((action) => {
                    const ActionIcon = action.icon;
                    const selected = value.trim() === action.prompt;
                    return (
                      <button
                        key={action.label}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        onClick={() => {
                          onChange(action.prompt);
                          setAddMenuOpen(false);
                          requestAnimationFrame(() => (textareaRef?.current ?? internalTextareaRef.current)?.focus());
                        }}
                        className={`group flex w-full items-center gap-3 rounded-xl border px-2.5 py-1 text-left transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action/20 ${selected
                          ? "border-action/30 bg-action/[0.10] shadow-[inset_3px_0_0_rgb(var(--action))]"
                          : "border-transparent hover:border-hairline hover:bg-surface-2/85 focus-visible:border-action/30 focus-visible:bg-surface-2"}`}
                      >
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors ${selected
                          ? "bg-action/15 text-action"
                          : "text-fg-muted group-hover:text-action group-focus-visible:text-action"}`}
                        >
                          <ActionIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-fg">{action.label}</span>
                          <span className="mt-0.5 block truncate text-[11px] leading-4 text-fg-muted">{action.description}</span>
                        </span>
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition ${selected ? "bg-action/15 text-action opacity-100" : "text-fg-subtle opacity-0"}`} aria-hidden="true">
                          <Check className="h-3 w-3" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {depthMenuOpen ? (
              <div
                ref={depthMenuRef}
                id="agent-depth-menu"
                role="menu"
                aria-label={copy.depthMenu}
                onKeyDown={handleMenuKeyDown}
                className={`absolute left-0 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-[18px] border border-hairline bg-surface-raised p-1.5 text-fg shadow-raised ${compact
                  ? "bottom-[calc(100%+0.55rem)]"
                  : "bottom-[calc(100%+0.55rem)] sm:bottom-auto sm:top-[calc(100%+0.55rem)]"}`}
              >
                <p className="px-2.5 pb-0.5 pt-1 text-[11px] font-medium text-fg-subtle">{copy.depthMenu}</p>
                {AGENT_DEPTH_LEVELS.map((level) => {
                  const selected = depth === level;
                  const labels = AGENT_DEPTH_LABELS[level];
                  return (
                    <button
                      key={level}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => {
                        onDepthChange?.(level);
                        setDepthMenuOpen(false);
                      }}
                      className={`group flex w-full items-center gap-3 rounded-xl border px-2.5 py-1.5 text-left transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action/20 ${selected
                        ? "border-action/30 bg-action/[0.10] shadow-[inset_3px_0_0_rgb(var(--action))]"
                        : "border-transparent hover:border-hairline hover:bg-surface-2/85 focus-visible:border-action/30 focus-visible:bg-surface-2"}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-fg">{locale === "zh" ? labels.zh : labels.en}</span>
                        <span className="mt-0.5 block truncate text-[11px] leading-4 text-fg-muted">
                          {locale === "zh" ? labels.zhDesc : labels.enDesc}
                        </span>
                      </span>
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition ${selected ? "bg-action/15 text-action opacity-100" : "text-fg-subtle opacity-0"}`} aria-hidden="true">
                        <Check className="h-3 w-3" />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <button
              ref={addMenuButtonRef}
              type="button"
              onClick={() => setAddMenuOpen((open) => !open)}
              disabled={uploading}
              className={`focus-ring relative grid h-9 w-9 place-items-center rounded-full border transition-[background-color,border-color,color,box-shadow] after:absolute after:-inset-1 after:content-[''] disabled:opacity-45 ${addMenuOpen
                ? "border-action/30 bg-action/[0.10] text-action shadow-[0_0_0_3px_rgb(var(--action)/0.08)]"
                : "border-transparent text-fg-muted hover:border-hairline hover:bg-surface-2 hover:text-fg"}`}
              aria-label={uploading ? copy.upload : copy.addOrAutomate}
              aria-haspopup="menu"
              aria-expanded={addMenuOpen}
              aria-controls="agent-add-menu"
              title={copy.addOrAutomate}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className={`h-4 w-4 transition-transform ${addMenuOpen ? "rotate-45" : ""}`} />}
            </button>
            <button
              ref={depthMenuButtonRef}
              type="button"
              onClick={() => setDepthMenuOpen((open) => !open)}
              className={`focus-ring relative inline-flex h-9 items-center gap-1 rounded-full border px-2.5 text-[11px] font-bold transition-[background-color,border-color,color] after:absolute after:-inset-1 after:content-[''] ${depthMenuOpen
                ? "border-action/30 bg-action/[0.10] text-action"
                : "border-transparent text-fg-muted hover:border-hairline hover:bg-surface-2 hover:text-fg"}`}
              aria-label={`${copy.depthMenu}: ${locale === "zh" ? AGENT_DEPTH_LABELS[depth].zh : AGENT_DEPTH_LABELS[depth].en}`}
              aria-haspopup="menu"
              aria-expanded={depthMenuOpen}
              aria-controls="agent-depth-menu"
              title={copy.depthMenu}
            >
              <Gauge className="h-4 w-4" />
              {locale === "zh" ? AGENT_DEPTH_LABELS[depth].zh : AGENT_DEPTH_LABELS[depth].en}
            </button>
          </div>
        ) : null}

        <div className={dictating ? "flex min-w-0 flex-1" : "flex items-center gap-1.5"}>
          {sending && !dictating ? (
              <button
                type="button"
                onClick={onStop}
                className="focus-ring relative grid h-9 w-9 place-items-center rounded-full border border-hairline bg-surface text-fg transition after:absolute after:-inset-1 after:content-[''] hover:border-action/45 hover:text-action-strong dark:hover:text-action"
                aria-label={copy.stop}
                title={copy.stop}
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
          ) : null}

          <SpeechInputButton
            locale={locale}
            compact
            disabled={uploading}
            className={dictating ? "w-full" : ""}
            onTranscript={(transcript) => onChange(appendTranscript(value, transcript))}
            onListeningChange={(isListening) => {
              if (isListening) {
                dictationBaselineRef.current = value;
                setAddMenuOpen(false);
              }
              setDictating(isListening);
            }}
            onCancel={() => onChange(dictationBaselineRef.current)}
            onSubmit={onSubmit}
            confirmDisabled={!canSend}
            buttonClassName="!h-9 !w-9 !rounded-full !border-0 !bg-transparent !p-0 hover:!bg-surface-2"
          />

          {!dictating ? (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSend}
              className="focus-ring relative grid h-9 w-9 place-items-center rounded-full bg-action text-on-action shadow-[0_5px_16px_rgb(var(--action)/0.2)] transition after:absolute after:-inset-1 after:content-[''] hover:bg-action-strong disabled:cursor-not-allowed disabled:bg-fg disabled:text-bg disabled:opacity-25 disabled:shadow-none"
              aria-label={sending ? copy.steer : copy.send}
              title={sending ? copy.steer : copy.send}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
