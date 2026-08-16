"use client";

import React from "react";
import type { DragEvent, FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  FileSpreadsheet,
  FileStack,
  History,
  Loader2,
  PanelRight,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  Wrench,
  X
} from "@/components/ui/icons";
import { AgentComposer } from "@/components/app-shell/AgentComposer";
import { AgentThinkingTrace, getAgentStatusLabel } from "@/components/app-shell/AgentThinkingTrace";
import {
  AgentWorkPanel,
  type AgentWorkResult,
  type AgentWorkStep
} from "@/components/app-shell/AgentWorkPanel";
import { CreatorStyleProfileCard } from "@/components/app-shell/CreatorStyleProfileCard";
import { BorderBeam } from "@/components/ui/BorderBeam";
import { McpAccessPanel } from "@/components/app-shell/McpAccessPanel";
import { WatchSourcesPanel } from "@/components/app-shell/WatchSourcesPanel";
import { AgentDutyQueue } from "@/components/app-shell/AgentDutyQueue";
import { WeeklyGrowthPulse } from "@/components/app-shell/WeeklyGrowthPulse";
import { addToast } from "@/components/ui/Toast";
import { useLocale } from "@/hooks/useLocale";
import { consumeSSEStream } from "@/lib/sse-client";
import {
  isAcceptedAgentAttachmentFile,
  type AgentAttachment
} from "@/lib/agent/attachments";
import {
  isAgentChatOutcome,
  isPendingAgentConfirmation,
  resolveAgentTerminalContent,
  type AgentChatOutcome
} from "@/lib/agent/chat-outcome";
import type { GrowthBriefing } from "@/lib/agent/growth-briefing";
import type { GrowthMission } from "@/lib/agent/growth-missions";
import type { AgentContentWorkflow } from "@/lib/agent/content-workflow";
import type { XhsWorkflowState } from "@/lib/agent/xhs-workflow";
import { XhsTodayActionCard, XhsToolResultCard } from "@/components/app-shell/XhsAgentWorkflowCard";
import { AgentContentWorkflowStateCard } from "@/components/app-shell/AgentContentWorkflowStateCard";
import { getAgentToolLabel } from "@/lib/agent/presentation";
import type { MemoryGovernanceReport } from "@/lib/memory-governance";
import { creatorStyleProfileSchema } from "@/lib/agent/style-profile";
import {
  advanceAgentStatus,
  completeAgentStatuses,
  isAgentStatusStage,
  type AgentStatusEvent
} from "@/lib/agent/status";
import { parseAgentWorkRecord, workRecordStatusEvents } from "@/lib/agent/work-record";

type ToolEvent = { name: string; args?: Record<string, unknown>; result?: unknown };

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
  images?: string[];
  attachments?: AgentAttachment[];
  dataFiles?: string[];
  toolEvents?: ToolEvent[];
  statusEvents?: AgentStatusEvent[];
  durationMs?: number;
  pending?: boolean;
  paused?: boolean;
};

type AgentSession = { id: string; title: string; updated_at: string };
type PendingDataImport = { id: string; name: string; rowCount: number };

export function AgentAutomationCenter({
  initialIntent,
  initialPrompt
}: {
  initialIntent?: "research";
  initialPrompt?: string;
}) {
  const locale = useLocale();

  const copy = locale === "en" ? {
    title: "Finfold Agent",
    heroLabel: "Your AI marketing teammate",
    heroTitle: "Put today’s marketing task in motion",
    heroDesc: "Tell me the outcome. I’ll research, create, and review the results—and ask only when I need more.",
    placeholder: "For example: diagnose my account and tell me the next move",
    send: "Send",
    pause: "Pause",
    paused: "Paused. You can continue whenever you're ready.",
    resume: "Continue this task",
    thinking: "Thinking...",
    fallback: "The agent could not reply. Please try again.",
    memory: "Brand Memory",
    rules: "Brand Rules",
    contextTitle: "Context",
    contextDesc: "Finfold uses this information when it is relevant.",
    contextItems: ["Product positioning", "Voice & examples", "Words to avoid"],
    openContext: "Context",
    attachHint: "Drop to add files",
    dropTitle: "Drop files anywhere to add them to this chat",
    dropDesc: "Add an image, document, or data file.",
    imageOnly: "Use an image, video, PDF, Office document, text file, CSV, or XLSX file.",
    uploadFail: "Upload failed.",
    newChat: "New chat",
    history: "History",
    workPanel: "Work",
  } : {
    title: "Finfold Agent",
    heroLabel: "你的 AI 营销员工",
    heroTitle: "把今天的营销任务交给我",
    heroDesc: "告诉我目标。我会调研、创作并检查结果，只在需要时问你。",
    placeholder: "例如：分析我的账号，告诉我下一步",
    send: "发送",
    pause: "暂停",
    paused: "已暂停。你可以随时从这里继续。",
    resume: "继续这个任务",
    thinking: "思考中...",
    fallback: "Agent 暂时无法回复，请重试。",
    memory: "品牌记忆",
    rules: "品牌规则",
    contextTitle: "上下文",
    contextDesc: "需要时，Finfold 会使用这些信息。",
    contextItems: ["产品定位", "语气和示例", "不要使用的表达"],
    openContext: "上下文",
    attachHint: "松开以上传附件",
    dropTitle: "松开文件，添加到这段对话",
    dropDesc: "添加图片、文档或数据文件。",
    imageOnly: "支持图片、视频、PDF、Office 文档、文本、CSV 和 XLSX 文件。",
    uploadFail: "上传失败。",
    newChat: "新对话",
    history: "历史会话",
    workPanel: "工作",
  };

  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<AgentAttachment[]>([]);
  const [pendingDataImports, setPendingDataImports] = useState<PendingDataImport[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [briefing, setBriefing] = useState<GrowthBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [activeMission, setActiveMission] = useState<GrowthMission | null>(null);
  const [missionStarting, setMissionStarting] = useState(false);
  const [xhsState, setXhsState] = useState<XhsWorkflowState | null>(null);
  const [xhsLoading, setXhsLoading] = useState(true);
  const [contentWorkflows, setContentWorkflows] = useState<AgentContentWorkflow[]>([]);
  const [workPanelOpen, setWorkPanelOpen] = useState(false);
  // 右侧上下文抽屉默认收起：避免挤压 chat，需要时点"上下文"展开。
  const [contextOpen, setContextOpen] = useState(false);
  const chatAbortRef = useRef<AbortController | null>(null);
  const activeChatRunRef = useRef(0);
  const initialIntentAppliedRef = useRef(false);
  const contextTriggerRef = useRef<HTMLButtonElement | null>(null);
  const contextDrawerRef = useRef<HTMLElement | null>(null);
  const contextCloseRef = useRef<HTMLButtonElement | null>(null);
  const workPanelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const workPanelDrawerRef = useRef<HTMLDivElement | null>(null);
  const workPanelCloseRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (initialIntentAppliedRef.current) return;
    if (!initialPrompt && initialIntent !== "research") return;
    initialIntentAppliedRef.current = true;
    setChatInput(initialPrompt || (locale === "en"
      ? "Use real evidence to analyze a category or competitor opportunity. Ask me for the minimum missing inputs first."
      : "请用真实证据帮我分析一个品类或竞品机会。先问我最少需要补充哪些资料。"));
  }, [initialIntent, initialPrompt, locale]);

  useEffect(() => () => {
    chatAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!contextOpen) return;
    const previousOverflow = document.body.style.overflow;
    const contextTrigger = contextTriggerRef.current;
    document.body.style.overflow = "hidden";
    contextCloseRef.current?.focus();

    function handleDialogKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setContextOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(contextDrawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), summary, input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleDialogKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleDialogKeys);
      contextTrigger?.focus();
    };
  }, [contextOpen]);

  useEffect(() => {
    if (!workPanelOpen || (typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches)) return;
    const previousOverflow = document.body.style.overflow;
    const workPanelTrigger = workPanelTriggerRef.current;
    document.body.style.overflow = "hidden";
    workPanelCloseRef.current?.focus();

    function handleWorkPanelKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setWorkPanelOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(workPanelDrawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), summary, input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleWorkPanelKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleWorkPanelKeys);
      workPanelTrigger?.focus();
    };
  }, [workPanelOpen]);

  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/agent/sessions", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { sessions?: AgentSession[] };
      setSessions(data.sessions ?? []);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const loadBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const response = await fetch(`/api/agent/briefing?locale=${locale}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { briefing?: GrowthBriefing };
      if (response.ok && data.briefing) setBriefing(data.briefing);
    } catch {
      /* The chat remains usable if the briefing endpoint is temporarily unavailable. */
    } finally {
      setBriefingLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void loadBriefing();
  }, [loadBriefing]);

  const loadMissions = useCallback(async () => {
    try {
      const response = await fetch("/api/agent/missions?limit=5", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        activeMission?: GrowthMission | null;
      };
      if (response.ok) setActiveMission(data.activeMission ?? null);
    } catch {
      /* The briefing and chat remain usable if missions are temporarily unavailable. */
    }
  }, []);

  useEffect(() => {
    void loadMissions();
  }, [loadMissions]);

  const loadXhsState = useCallback(async () => {
    setXhsLoading(true);
    try {
      const response = await fetch(`/api/agent/xhs/state?locale=${locale}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { state?: XhsWorkflowState };
      if (response.ok && data.state) setXhsState(data.state);
    } catch {
      /* Agent chat remains usable while workflow persistence is unavailable. */
    } finally {
      setXhsLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void loadXhsState();
  }, [loadXhsState]);

  const loadContentWorkflows = useCallback(async () => {
    try {
      const response = await fetch("/api/agent/content-workflows?limit=4", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { workflows?: AgentContentWorkflow[] };
      if (response.ok) setContentWorkflows(data.workflows ?? []);
    } catch {
      /* The chat remains usable if workflow history is temporarily unavailable. */
    }
  }, []);

  useEffect(() => {
    void loadContentWorkflows();
  }, [loadContentWorkflows]);

  useEffect(() => {
    if (!contentWorkflows.some((workflow) => workflow.stage === "generating")) return;
    const interval = window.setInterval(() => void loadContentWorkflows(), 8_000);
    return () => window.clearInterval(interval);
  }, [contentWorkflows, loadContentWorkflows]);

  async function startGrowthMission() {
    if (missionStarting || !briefing?.experiment) return;
    setMissionStarting(true);
    try {
      const response = await fetch("/api/agent/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          platform: briefing.experiment.platform
        })
      });
      const data = (await response.json().catch(() => ({}))) as {
        mission?: GrowthMission;
        error?: string;
      };
      if (!response.ok || !data.mission) {
        throw new Error(data.error ?? (locale === "en" ? "Could not start this mission." : "暂时无法启动这个任务。"));
      }
      setActiveMission(data.mission);
      addToast("success", locale === "en" ? "Growth Mission accepted." : "Growth Mission 已接受。");
      window.location.assign(buildMissionWorkbenchHref(data.mission));
    } catch (error) {
      addToast(
        "error",
        error instanceof Error
          ? error.message
          : locale === "en"
            ? "Could not start this mission."
            : "暂时无法启动这个任务。"
      );
    } finally {
      setMissionStarting(false);
    }
  }

  async function loadSession(id: string) {
    if (chatSending) stopAgentChat();
    try {
      const response = await fetch(`/api/agent/sessions/${id}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        messages?: Array<{ role: string; content: { text?: string; imageUrls?: string[]; attachments?: AgentAttachment[]; dataImportIds?: string[]; toolCalls?: Array<{ name: string; args: Record<string, unknown> }>; toolResults?: Array<{ name: string; result: unknown }>; work?: unknown } }>;
      };
      const mapped: ChatMessage[] = (data.messages ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => {
          const work = parseAgentWorkRecord(m.content.work);
          return {
            role: m.role as "user" | "assistant",
            content: m.content.text ?? "",
            images: m.content.imageUrls,
            attachments: m.content.attachments,
            dataFiles: m.content.dataImportIds?.map((_, index) => locale === "zh" ? `已导入表现数据 ${index + 1}` : `Imported performance data ${index + 1}`),
            toolEvents: m.content.toolCalls?.map((call, i) => ({
              name: call.name,
              args: call.args,
              result: m.content.toolResults?.[i]?.result
            })),
            statusEvents: workRecordStatusEvents(work),
            durationMs: work?.durationMs
          };
        });
      setChatMessages(mapped.length > 0 ? mapped : chatMessages);
      setSessionId(id);
      setHistoryOpen(false);
      if (mapped.length > 0 && typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches) {
        setWorkPanelOpen(true);
      }
    } catch {
      addToast("error", copy.fallback);
    }
  }

  function startNewChat() {
    if (chatSending) stopAgentChat();
    setSessionId(null);
    setChatMessages([]);
    setHistoryOpen(false);
    setWorkPanelOpen(false);
  }

  async function handleFiles(files: FileList | File[] | null) {
    if (!files?.length) return;
    const remainingSlots = Math.max(0, 6 - pendingAttachments.length - pendingDataImports.length);
    if (!remainingSlots) {
      addToast("error", locale === "zh" ? "每次最多添加 6 个附件。" : "Add up to 6 attachments at a time.");
      return;
    }
    const allFiles = Array.from(files).slice(0, remainingSlots);
    const dataFiles = allFiles.filter((file) => /\.(csv|xlsx)$/i.test(file.name));
    const attachmentFiles = allFiles.filter((file) => !/\.(csv|xlsx)$/i.test(file.name) && isAcceptedAgentAttachmentFile(file));
    const unsupportedFiles = allFiles.filter(
      (file) => !isAcceptedAgentAttachmentFile(file)
    );
    if (unsupportedFiles.length > 0 || (!attachmentFiles.length && !dataFiles.length)) {
      addToast("error", copy.imageOnly);
      return;
    }
    setIsUploadingAttachment(true);
    try {
      if (attachmentFiles.length) {
        const formData = new FormData();
        attachmentFiles.forEach((file) => formData.append("files", file));
        const response = await fetch("/api/agent/attachments", { method: "POST", body: formData });
        const data = (await response.json().catch(() => ({}))) as { attachments?: AgentAttachment[]; error?: string };
        if (!response.ok || !data.attachments) throw new Error(data.error ?? copy.uploadFail);
        setPendingAttachments((current) => [...current, ...data.attachments!].slice(0, 6));
      }
      for (const file of dataFiles.slice(0, 6)) {
        const formData = new FormData();
        formData.append("file", file);
        if (xhsState?.workflow?.id) formData.append("workflowId", xhsState.workflow.id);
        const response = await fetch("/api/agent/xhs/data-import", { method: "POST", body: formData });
        const data = (await response.json().catch(() => ({}))) as {
          import?: PendingDataImport;
          error?: string;
        };
        if (!response.ok || !data.import) throw new Error(data.error ?? copy.uploadFail);
        setPendingDataImports((current) => [...current, data.import!]);
      }
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : copy.uploadFail);
    } finally {
      setIsUploadingAttachment(false);
    }
  }

  function removePendingDataImport(index: number) {
    setPendingDataImports((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (event.dataTransfer.files?.length) {
      void handleFiles(event.dataTransfer.files);
    }
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (Array.from(event.dataTransfer.types).includes("Files")) setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }

  async function sendAgentMessage(event?: FormEvent, preset?: string) {
    event?.preventDefault();
    const attachments = [...pendingAttachments];
    const dataImports = [...pendingDataImports];
    const message = (preset ?? chatInput).trim() || ((attachments.length || dataImports.length)
      ? (locale === "zh" ? "请分析这些附件。" : "Please analyze these attachments.")
      : "");
    if (!message || chatSending || isUploadingAttachment) return;

    const runId = activeChatRunRef.current + 1;
    const runStartedAt = Date.now();
    activeChatRunRef.current = runId;

    setChatInput("");
    setPendingAttachments([]);
    setPendingDataImports([]);
    setChatSending(true);
    if (typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches) {
      setWorkPanelOpen(true);
    }
    setChatMessages((current) => [
      ...current,
      {
        role: "user",
        content: message,
        ...(attachments.length ? { attachments } : {}),
        ...(attachments.length ? { images: attachments.filter((item) => item.kind === "image").map((item) => item.url).filter((url): url is string => Boolean(url)) } : {}),
        ...(dataImports.length ? { dataFiles: dataImports.map((item) => `${item.name} · ${item.rowCount} 行`) } : {})
      },
      {
        role: "assistant",
        content: "",
        pending: true,
        statusEvents: [{ stage: "understanding_request", completed: false }]
      }
    ]);

    let assistantText = "";
    const toolEvents: ToolEvent[] = [];
    let statusEvents: AgentStatusEvent[] = [{ stage: "understanding_request", completed: false }];
    let terminalOutcome: AgentChatOutcome | null = null;
    let terminalDurationMs: number | undefined;

    function updateAssistant() {
      if (activeChatRunRef.current !== runId) return;
      setChatMessages((current) => {
        const next = [...current];
        next[next.length - 1] = {
          role: "assistant",
          content: assistantText,
          toolEvents: [...toolEvents],
          statusEvents: [...statusEvents],
          pending: true
        };
        return next;
      });
    }

    let controller: AbortController | null = null;
    try {
      controller = new AbortController();
      chatAbortRef.current = controller;
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId ?? undefined,
          workflowId: xhsState?.workflow?.id ?? undefined,
          dataImportIds: dataImports.length ? dataImports.map((item) => item.id) : undefined,
          message,
          attachments: attachments.length ? attachments : undefined
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? copy.fallback);
      }

      let streamError: string | null = null;

      await consumeSSEStream(response, (event, data) => {
        if (activeChatRunRef.current !== runId) return;
        if (event === "session") {
          const { sessionId: newId } = data as { sessionId: string };
          setSessionId((current) => current ?? newId);
        } else if (event === "text") {
          assistantText += (data as { text: string }).text;
          updateAssistant();
        } else if (event === "status") {
          const { stage } = data as { stage?: unknown };
          if (isAgentStatusStage(stage)) {
            statusEvents = advanceAgentStatus(statusEvents, stage);
            updateAssistant();
          }
        } else if (event === "tool_call") {
          const { name, args } = data as { name: string; args: Record<string, unknown> };
          toolEvents.push({ name, args });
          updateAssistant();
        } else if (event === "tool_result") {
          const { name, result } = data as { name: string; result: unknown };
          const idx = toolEvents.findIndex((t) => t.name === name && t.result === undefined);
          if (idx >= 0) toolEvents[idx].result = result;
          updateAssistant();
        } else if (event === "error") {
          streamError = (data as { error?: string }).error ?? copy.fallback;
        } else if (event === "done") {
          const { outcome, work: rawWork } = data as { outcome?: unknown; work?: unknown };
          if (isAgentChatOutcome(outcome)) terminalOutcome = outcome;
          const work = parseAgentWorkRecord(rawWork);
          if (work) terminalDurationMs = work.durationMs;
        }
      });

      if (activeChatRunRef.current !== runId) return;
      const terminalContent = resolveAgentTerminalContent({
        assistantText,
        streamError,
        outcome: terminalOutcome,
        hasPendingConfirmation: toolEvents.some((tool) => isPendingAgentConfirmation(tool.result)),
        fallback: copy.fallback
      });
      setChatMessages((current) => {
        const next = [...current];
        next[next.length - 1] = {
          role: "assistant",
          content: terminalContent,
          toolEvents,
          statusEvents: completeAgentStatuses(statusEvents),
          durationMs: terminalDurationMs ?? Date.now() - runStartedAt
        };
        return next;
      });
      void loadSessions();
      void loadMissions();
      void loadXhsState();
      void loadContentWorkflows();
    } catch (error) {
      if (activeChatRunRef.current !== runId) return;
      setChatMessages((current) => {
        const next = [...current];
        next[next.length - 1] = {
          role: "assistant",
          content: error instanceof Error ? error.message : copy.fallback,
          toolEvents,
          statusEvents: completeAgentStatuses(statusEvents),
          durationMs: Date.now() - runStartedAt
        };
        return next;
      });
    } finally {
      if (controller && chatAbortRef.current === controller) chatAbortRef.current = null;
      if (activeChatRunRef.current === runId) setChatSending(false);
    }
  }

  function stopAgentChat() {
    if (!chatSending) return;
    activeChatRunRef.current += 1;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatMessages((current) => {
      const next = [...current];
      const lastIndex = next.length - 1;
      const last = next[lastIndex];
      if (last?.role === "assistant") {
        next[lastIndex] = {
          ...last,
          content: last.content ? `${last.content}\n\n${copy.paused}` : copy.paused,
          pending: false,
          paused: true
        };
      }
      return next;
    });
    setChatSending(false);
  }

  const composerAttachments: AgentAttachment[] = [
    ...pendingAttachments,
    ...pendingDataImports.map((item) => ({
      id: item.id,
      name: `${item.name} · ${item.rowCount} ${locale === "zh" ? "行" : "rows"}`,
      size: 0,
      kind: "data" as const,
      mimeType: "text/csv",
      storagePath: `data-import/${item.id}`
    }))
  ];
  const emptyConversation = chatMessages.length === 0;
  const latestUserMessage = [...chatMessages].reverse().find((message) => message.role === "user");
  const latestAssistantMessage = [...chatMessages].reverse().find((message) => message.role === "assistant");
  const currentToolEvents = latestAssistantMessage?.toolEvents ?? [];
  const workPanelActive = chatSending || Boolean(latestAssistantMessage?.pending);
  const workPanelAwaitingConfirmation = currentToolEvents.some((tool) => isPendingAgentConfirmation(tool.result));
  const workPanelState = latestAssistantMessage?.paused
    ? "paused" as const
    : workPanelAwaitingConfirmation
      ? "awaiting_confirmation" as const
      : workPanelActive
        ? "active" as const
        : "complete" as const;
  const workPanelDurationMs = latestAssistantMessage?.durationMs;
  const workPanelTask = latestUserMessage?.content || (locale === "zh" ? "当前 Agent 任务" : "Current Agent task");
  const workPanelSteps: AgentWorkStep[] = [
    ...(latestAssistantMessage?.statusEvents ?? []).map((status, index) => ({
      id: `status-${status.stage}-${index}`,
      label: getAgentStatusLabel(status.stage, locale),
      state: status.completed ? "complete" as const : latestAssistantMessage?.paused ? "paused" as const : "active" as const,
      kind: "status" as const
    })),
    ...currentToolEvents.map((tool, index) => ({
      id: `tool-${tool.name}-${index}`,
      label: getAgentToolLabel(tool.name, locale),
      state: tool.result !== undefined ? "complete" as const : latestAssistantMessage?.paused ? "paused" as const : "active" as const,
      kind: "tool" as const
    }))
  ];
  if (!emptyConversation && workPanelSteps.length === 0) {
    workPanelSteps.push({
      id: "history-without-steps",
      label: locale === "zh" ? "这段历史未保存详细执行步骤" : "Detailed steps were not saved for this history",
      state: "complete",
      kind: "status"
    });
  }
  const completedToolResults: AgentWorkResult[] = currentToolEvents
    .flatMap((tool, toolIndex) => tool.result === undefined ? [] : [{
      id: `result-current-${toolIndex}`,
      label: getAgentToolLabel(tool.name, locale),
      summary: summarizeAgentToolResult(tool.result, locale)
    }])
    .reverse()
    .slice(0, 5);
  const workPanelResults: AgentWorkResult[] = latestAssistantMessage?.content && !latestAssistantMessage.pending
    ? [{
        id: "latest-agent-conclusion",
        label: locale === "zh" ? "Agent 结论" : "Agent conclusion",
        summary: compactWorkPanelText(latestAssistantMessage.content)
      }, ...completedToolResults].slice(0, 6)
    : completedToolResults;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className="relative mx-auto flex min-h-[calc(100svh-8rem)] max-w-[1360px] flex-col pb-4 lg:min-h-[calc(100vh-2.5rem)] lg:pb-0"
    >
      <section
        aria-label={copy.title}
        className="relative flex min-h-[600px] flex-1 flex-col overflow-hidden rounded-[28px] border border-hairline bg-surface text-fg shadow-raised sm:min-h-[660px] lg:min-h-0"
      >
        {chatSending ? (
          <>
            <BorderBeam size={220} duration={7.2} borderWidth={1.5} />
            <BorderBeam size={130} duration={9.4} delay={3.8} colorFrom="#f0c275" colorTo="#2dd4bf" reverse className="opacity-65" />
          </>
        ) : null}
        <header className="relative z-10 flex min-h-14 items-center justify-between gap-3 border-b border-hairline px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-action/20 bg-action/[0.08] text-action">
              <Bot className="h-4 w-4" />
            </span>
            <span className="truncate text-sm font-bold text-fg">{copy.title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!emptyConversation ? (
              <button
                type="button"
                onClick={startNewChat}
                className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                aria-label={copy.newChat}
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-2 hover:text-fg"
              aria-label={copy.history}
              aria-expanded={historyOpen}
            >
              <History className="h-4 w-4" />
            </button>
            {!emptyConversation ? (
              <button
                ref={workPanelTriggerRef}
                type="button"
                onClick={() => setWorkPanelOpen((open) => !open)}
                aria-expanded={workPanelOpen}
                className={`focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-full px-2.5 text-xs font-semibold transition ${workPanelOpen
                  ? "bg-surface-2 text-fg"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg"}`}
                aria-label={workPanelOpen
                  ? (locale === "zh" ? "关闭工作过程和结果" : "Close work progress and results")
                  : (locale === "zh" ? "打开工作过程和结果" : "Open work progress and results")}
              >
                <Activity className="h-4 w-4" />
                <span className="hidden sm:inline">{copy.workPanel}</span>
                {workPanelActive ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-action shadow-[0_0_10px_rgb(var(--action)/0.8)]" />
                ) : workPanelResults.length > 0 ? (
                  <span className="rounded-full bg-positive/12 px-1.5 py-0.5 text-[9px] font-bold text-positive">
                    {workPanelResults.length}
                  </span>
                ) : null}
              </button>
            ) : null}
            {!emptyConversation ? (
              <button
                ref={contextTriggerRef}
                type="button"
                onClick={() => setContextOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={contextOpen}
                className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                aria-label={copy.openContext}
              >
                <PanelRight className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </header>

        {historyOpen && (
          <div className="absolute right-3 top-[4.25rem] z-30 w-[min(22rem,calc(100%-1.5rem))] rounded-2xl border border-hairline bg-surface-raised/98 p-2 shadow-raised backdrop-blur-xl sm:right-5" role="region" aria-label={copy.history}>
            {sessions.length === 0 ? (
              <p className="px-3 py-4 text-sm text-fg-muted">{locale === "en" ? "No previous sessions yet." : "还没有历史会话。"}</p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void loadSession(s.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                    s.id === sessionId ? "bg-action/12 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                  }`}
                >
                  <span className="truncate">{s.title || (locale === "en" ? "Untitled" : "新对话")}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-40" />
                </button>
              ))
            )}
          </div>
        )}

        {emptyConversation ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16 pt-8 sm:px-8 sm:pb-20">
            <div className="w-full max-w-[720px]">
              <div className="text-center">
                <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-action/85">
                  {copy.heroLabel}
                </p>
                <h1 className="text-balance text-[clamp(1.65rem,4vw,2.4rem)] font-semibold leading-tight tracking-[-0.035em] text-fg">
                  {copy.heroTitle}
                </h1>
                <p className="mx-auto mt-3 max-w-[560px] text-sm leading-6 text-fg-muted sm:text-[15px]">
                  {copy.heroDesc}
                </p>
              </div>

              <div className="mt-6">
                <AgentComposer
                  locale={locale}
                  value={chatInput}
                  onChange={setChatInput}
                  onSubmit={() => void sendAgentMessage()}
                  sending={chatSending}
                  onStop={stopAgentChat}
                  attachments={composerAttachments}
                  onFiles={(files) => void handleFiles(files)}
                  onRemoveAttachment={(index) => {
                    if (index < pendingAttachments.length) {
                      setPendingAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
                    } else {
                      removePendingDataImport(index - pendingAttachments.length);
                    }
                  }}
                  uploading={isUploadingAttachment}
                  placeholder={isDragging ? copy.attachHint : copy.placeholder}
                />
              </div>

            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <div role="log" aria-live="polite" aria-relevant="additions text" aria-busy={chatSending} className="mx-auto flex min-h-0 w-full max-w-[920px] flex-1 flex-col gap-5 overflow-y-auto px-4 py-8 sm:px-8">
              {chatMessages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={message.role === "user"
                ? "ml-auto max-w-[82%] rounded-[22px] bg-surface-2 px-4 py-3 text-[15px] font-medium leading-7 text-fg sm:max-w-[72%]"
                : `relative max-w-full overflow-hidden border-l-2 px-4 py-1 text-[15px] leading-7 text-fg transition-[border-color,background-color] ${message.pending
                    ? "border-action bg-action/[0.035]"
                    : "border-hairline-strong"}`}
            >
              {message.images?.length ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {message.images.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={url} alt="" className="h-20 w-20 rounded-md border border-hairline object-cover" />
                  ))}
                </div>
              ) : null}
              {message.attachments?.some((attachment) => attachment.kind !== "image") ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {message.attachments.filter((attachment) => attachment.kind !== "image").map((attachment) => (
                    <span key={attachment.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-action/25 bg-action/10 px-2 py-1 text-[11px] font-bold text-action">
                      <FileStack className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{attachment.name}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              {message.dataFiles?.length ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {message.dataFiles.map((name) => (
                    <span key={name} className="inline-flex items-center gap-1.5 rounded-md border border-action/25 bg-action/10 px-2 py-1 text-[11px] font-bold text-action">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      {name}
                    </span>
                  ))}
                </div>
              ) : null}

              {message.statusEvents?.length ? (
                <AgentThinkingTrace
                  events={message.statusEvents}
                  active={Boolean(message.pending)}
                  locale={locale}
                  tone="surface"
                />
              ) : null}

              {message.toolEvents?.map((tool, i) => (
                <ToolEventCard
                  key={i}
                  tool={tool}
                  locale={locale}
                  onXhsStateChanged={(state) => setXhsState(state)}
                  onAskAgent={(prompt) => void sendAgentMessage(undefined, prompt)}
                />
              ))}

              {message.content ? <div className="whitespace-pre-wrap">{message.content}</div> : null}

              {message.pending && !message.content && (!message.toolEvents || message.toolEvents.length === 0) && !message.statusEvents?.length ? (
                <span className="inline-flex items-center gap-2 text-fg-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {copy.thinking}
                </span>
              ) : null}

              {message.paused ? (
                <button
                  type="button"
                  onClick={() => void sendAgentMessage(
                    undefined,
                    locale === "zh" ? "继续刚才暂停的任务。" : "Continue the task I paused."
                  )}
                  className="focus-ring mt-3 inline-flex items-center gap-2 rounded-md border border-action/40 bg-action/10 px-3 py-2 text-xs font-bold text-action transition hover:bg-action/20"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {copy.resume}
                </button>
              ) : null}
            </div>
              ))}
              </div>

              <div className="relative z-10 border-t border-hairline bg-surface/95 px-4 pb-4 pt-4 backdrop-blur-xl sm:px-8 sm:pb-6">
                <div className="mx-auto max-w-[820px]">
                  <AgentComposer
                    locale={locale}
                    value={chatInput}
                    onChange={setChatInput}
                    onSubmit={() => void sendAgentMessage()}
                    sending={chatSending}
                    onStop={stopAgentChat}
                    attachments={composerAttachments}
                    onFiles={(files) => void handleFiles(files)}
                    onRemoveAttachment={(index) => {
                      if (index < pendingAttachments.length) {
                        setPendingAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
                      } else {
                        removePendingDataImport(index - pendingAttachments.length);
                      }
                    }}
                    uploading={isUploadingAttachment}
                    placeholder={isDragging ? copy.attachHint : copy.placeholder}
                    compact
                  />
                  <p className="mt-2 text-center text-[10px] font-medium text-fg-muted">
                    {locale === "en" ? "You confirm key actions." : "关键操作会先确认。"}
                  </p>
                </div>
              </div>
            </div>

            {workPanelOpen ? (
              <AgentWorkPanel
                locale={locale}
                task={workPanelTask}
                steps={workPanelSteps}
                results={workPanelResults}
                state={workPanelState}
                durationMs={workPanelDurationMs}
                onClose={() => setWorkPanelOpen(false)}
                className="hidden w-[340px] shrink-0 border-l border-hairline lg:flex xl:w-[370px]"
              />
            ) : null}
          </div>
        )}

        <AnimatePresence>
          {isDragging ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-[28px] border-2 border-action bg-surface/92 p-6 backdrop-blur-sm"
            >
              <div className="max-w-sm text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-action/50 bg-action/15 text-action shadow-[0_0_50px_rgb(var(--action)/0.2)]">
                  <Upload className="h-7 w-7" />
                </span>
                <p className="mt-5 text-lg font-bold text-fg">{copy.dropTitle}</p>
                <p className="mt-2 text-sm leading-6 text-fg-muted">{copy.dropDesc}</p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {workPanelOpen ? (
          <>
            <motion.button
              type="button"
              aria-label={locale === "zh" ? "关闭工作面板" : "Close work panel"}
              key="work-panel-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setWorkPanelOpen(false)}
              className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              ref={workPanelDrawerRef}
              key="work-panel-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
              aria-label={locale === "zh" ? "工作过程和结果" : "Work progress and results"}
              className="fixed right-0 top-0 z-50 h-full w-full max-w-[390px] shadow-2xl lg:hidden"
            >
              <AgentWorkPanel
                locale={locale}
                task={workPanelTask}
                steps={workPanelSteps}
                results={workPanelResults}
                state={workPanelState}
                durationMs={workPanelDurationMs}
                onClose={() => setWorkPanelOpen(false)}
                closeButtonRef={workPanelCloseRef}
                className="flex h-full border-l border-hairline"
              />
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      {/* 右侧上下文抽屉：可展开/收起，默认隐藏。浮动抽屉 + 遮罩，
          不再挤压 chat、不再造成右下角错位。 */}
      <AnimatePresence>
        {contextOpen ? (
          <>
            <motion.button
              type="button"
              aria-label={locale === "en" ? "Close context" : "关闭上下文"}
              key="context-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setContextOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            />
            <motion.aside
              ref={contextDrawerRef}
              key="context-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
              aria-label={copy.contextTitle}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[400px] flex-col gap-4 overflow-y-auto border-l border-hairline bg-surface p-5 text-fg shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-action">
                  <Sparkles className="h-4 w-4" />
                  {copy.contextTitle}
                </div>
                <button
                  ref={contextCloseRef}
                  type="button"
                  onClick={() => setContextOpen(false)}
                  className="focus-ring rounded-md p-1.5 text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                  aria-label={locale === "en" ? "Close" : "关闭"}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-sm leading-6 text-fg-muted">{copy.contextDesc}</p>

              <div className="grid gap-2">
                {copy.contextItems.map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-md border border-hairline bg-surface-2/60 px-3 py-2 text-sm font-semibold text-fg">
                    <ShieldCheck className="h-4 w-4 text-action" />
                    {item}
                  </div>
                ))}
              </div>

              <div className="grid gap-3">
                <Link href="/brand-memory" className="btn-ghost justify-center">
                  {copy.memory} <FileStack className="h-4 w-4" />
                </Link>
                <Link href="/guardrails" className="btn-ghost justify-center">
                  {copy.rules} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="grid gap-4 border-t border-hairline pt-4">
                <XhsTodayActionCard
                  state={xhsState}
                  loading={xhsLoading}
                  locale={locale}
                  onAskAgent={(prompt) => {
                    setContextOpen(false);
                    void sendAgentMessage(undefined, prompt);
                  }}
                />
                <AgentContentWorkflowStateCard
                  workflows={contentWorkflows}
                  locale={locale}
                  onChanged={() => void loadContentWorkflows()}
                />
                <AgentDutyQueue locale={locale} />
                <WeeklyGrowthPulse
                  locale={locale}
                  variant="dark"
                  onAskAgent={(prompt) => {
                    setContextOpen(false);
                    void sendAgentMessage(undefined, prompt);
                  }}
                />
                <GrowthBriefingCard
                  briefing={briefing}
                  loading={briefingLoading}
                  activeMission={activeMission}
                  missionStarting={missionStarting}
                  locale={locale}
                  onRefresh={() => void loadBriefing()}
                  onStartMission={() => void startGrowthMission()}
                  onAskAgent={(prompt) => {
                    setContextOpen(false);
                    void sendAgentMessage(undefined, prompt);
                  }}
                />
              </div>

              <WatchSourcesPanel />

              <details className="rounded-xl border border-hairline bg-surface-2/45 p-3">
                <summary className="focus-ring cursor-pointer text-xs font-bold text-fg-muted">
                  {locale === "en" ? "Agent access and integrations" : "Agent 接入与高级连接"}
                </summary>
                <div className="mt-3"><McpAccessPanel /></div>
              </details>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

    </motion.div>
  );
}

function compactWorkPanelText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

function summarizeAgentToolResult(result: unknown, locale: "zh" | "en"): string {
  if (isPendingAgentConfirmation(result)) {
    return locale === "zh" ? "已生成预览，等待你确认后执行。" : "Preview ready and waiting for your confirmation.";
  }

  const record = recordValue(result);
  if (!record) return locale === "zh" ? "结果已生成，可在对话中查看。" : "Result ready to review in the conversation.";

  const creatorStyleProfile = recordValue(record.creatorStyleProfile);
  if (creatorStyleProfile) {
    const accountName = typeof creatorStyleProfile.accountName === "string" ? creatorStyleProfile.accountName.trim() : "";
    return accountName
      ? (locale === "zh" ? `${accountName} 的可迁移能力画像已生成。` : `Transferable style profile for ${accountName} is ready.`)
      : (locale === "zh" ? "对标博主能力画像已生成。" : "Benchmark creator profile is ready.");
  }

  const investigation = recordValue(record.investigation);
  if (investigation && typeof investigation.executiveSummary === "string") {
    return compactWorkPanelText(investigation.executiveSummary);
  }

  const report = recordValue(record.report);
  if (report && typeof report.accountSummary === "string") {
    return compactWorkPanelText(report.accountSummary);
  }

  const briefing = recordValue(record.briefing);
  if (briefing && typeof briefing.summary === "string") {
    return compactWorkPanelText(briefing.summary);
  }

  const mission = recordValue(record.mission);
  if (mission && typeof mission.title === "string") {
    return compactWorkPanelText(mission.title);
  }

  for (const key of ["summary", "message", "title"] as const) {
    if (typeof record[key] === "string" && record[key].trim()) return compactWorkPanelText(record[key]);
  }

  return locale === "zh" ? "结果已生成，可在对话中查看。" : "Result ready to review in the conversation.";
}

function ToolEventCard({
  tool,
  locale,
  onXhsStateChanged,
  onAskAgent
}: {
  tool: ToolEvent;
  locale: "zh" | "en";
  onXhsStateChanged?: (state: XhsWorkflowState) => void;
  onAskAgent?: (prompt: string) => void;
}) {
  const label = getAgentToolLabel(tool.name, locale);
  const isRunning = tool.result === undefined;
  const report = tool.name === "diagnose_xiaohongshu" && tool.result
    ? (tool.result as { report?: { accountSummary: string; scores: Array<{ dimension: string; score: number; comment: string }>; problems: Array<{ title: string; evidence: string; severity: string }>; actions: Array<{ title: string; detail: string; priority: string }>; contentSuggestions: string[] } }).report
    : undefined;
  const growthBriefing = (tool.name === "analyze_account_performance" || tool.name === "plan_next_content_experiment") && tool.result
    ? (tool.result as { briefing?: GrowthBriefing }).briefing
    : undefined;
  const growthMission = tool.name === "start_growth_mission" && tool.result
    ? (tool.result as { mission?: GrowthMission }).mission
    : undefined;
  const xhsResult = tool.result && typeof tool.result === "object" && "xhsCard" in tool.result
    ? tool.result
    : undefined;
  const memoryGovernance = tool.name === "inspect_memory_conflicts" && tool.result
    ? (tool.result as { memoryGovernance?: MemoryGovernanceReport }).memoryGovernance
    : undefined;
  const creatorStyleProfile = tool.result && typeof tool.result === "object" && "creatorStyleProfile" in tool.result
    ? creatorStyleProfileSchema.safeParse(tool.result.creatorStyleProfile)
    : null;

  return (
    <div className="mb-3 rounded-xl border border-hairline bg-surface-2/45 p-3 text-sm">
      <div className="flex items-center gap-2 font-semibold text-fg">
        {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin text-action" /> : <Wrench className="h-3.5 w-3.5 text-action" />}
        {label}
        {isRunning ? <span className="text-xs font-normal text-fg-subtle">{locale === "en" ? "running..." : "执行中..."}</span> : null}
      </div>

      {creatorStyleProfile?.success ? (
        <CreatorStyleProfileCard
          profile={creatorStyleProfile.data}
          locale={locale}
          variant="surface"
          onAskAgent={onAskAgent}
        />
      ) : xhsResult ? (
        <XhsToolResultCard result={xhsResult} locale={locale} onStateChanged={onXhsStateChanged} />
      ) : growthMission ? (
        <div className="mt-3 rounded-md border border-action/20 bg-action/[0.06] p-3">
          <p className="text-xs font-bold text-fg">{growthMission.title}</p>
          <p className="mt-1 text-[11px] leading-5 text-fg-muted">{growthMission.hypothesis}</p>
          <Link
            href={buildMissionWorkbenchHref(growthMission)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-action hover:underline"
          >
            {locale === "en" ? "Execute in workbench" : "带着任务去工作台"}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : growthBriefing ? (
        <GrowthToolSummary briefing={growthBriefing} locale={locale} />
      ) : memoryGovernance ? (
        <MemoryGovernanceSummary report={memoryGovernance} locale={locale} />
      ) : report ? (
        <div className="mt-3 space-y-3 text-fg-muted">
          <p>{report.accountSummary}</p>
          {report.scores?.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {report.scores.map((s) => (
                <div key={s.dimension} className="rounded-md border border-hairline bg-surface p-2 text-center">
                  <div className="text-lg font-bold text-action">{s.score}</div>
                  <div className="text-[11px] text-fg-muted">{s.dimension}</div>
                </div>
              ))}
            </div>
          )}
          {report.problems?.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase text-fg-subtle">{locale === "en" ? "Problems" : "问题"}</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {report.problems.map((p, i) => (
                  <li key={i}><span className="font-semibold text-fg">{p.title}</span> — {p.evidence}</li>
                ))}
              </ul>
            </div>
          )}
          {report.actions?.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase text-fg-subtle">{locale === "en" ? "Actions" : "行动建议"}</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {report.actions.map((a, i) => (
                  <li key={i}><span className="font-semibold text-fg">{a.title}</span> — {a.detail}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : !isRunning && tool.result ? (
        <ToolResultSummary result={tool.result} locale={locale} />
      ) : null}
    </div>
  );
}

function MemoryGovernanceSummary({
  report,
  locale
}: {
  report: MemoryGovernanceReport;
  locale: "zh" | "en";
}) {
  if (report.status === "clear") {
    return <p className="mt-3 text-xs leading-5 text-positive">{locale === "en" ? "No direct Brand Memory conflicts were found." : "未发现可确定的品牌记忆冲突。"}</p>;
  }
  return (
    <div className="mt-3 rounded-md border border-warn/25 bg-warn/[0.06] p-3">
      <p className="text-xs font-bold text-warn">{locale === "en" ? "Memory needs review" : "品牌记忆需要复核"}</p>
      <p className="mt-1 text-[11px] leading-5 text-fg-muted">
        {locale === "en" ? "Only direct, verifiable conflicts are shown. Finfold has not changed your memory." : "这里只显示可验证的直接冲突；Finfold 尚未修改任何记忆。"}
      </p>
      <div className="mt-2 space-y-2">
        {report.conflicts.map((conflict) => (
          <div key={conflict.id} className="border-l-2 border-warn/65 pl-2.5">
            <p className="text-xs font-semibold text-fg">{conflict.title}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-fg-muted">{conflict.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function GrowthBriefingCard({
  briefing,
  loading,
  activeMission,
  missionStarting,
  locale,
  onRefresh,
  onStartMission,
  onAskAgent
}: {
  briefing: GrowthBriefing | null;
  loading: boolean;
  activeMission: GrowthMission | null;
  missionStarting: boolean;
  locale: "zh" | "en";
  onRefresh: () => void;
  onStartMission: () => void;
  onAskAgent: (prompt: string) => void;
}) {
  if (loading && !briefing) {
    return (
      <div className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 lg:grid-cols-[1.45fr_0.75fr]">
        <div className="h-28 animate-pulse rounded-lg bg-white/[0.05]" />
        <div className="h-28 animate-pulse rounded-lg bg-white/[0.05]" />
      </div>
    );
  }
  if (!briefing) return null;

  const primary = briefing.priorities[0];
  const experiment = briefing.experiment;
  const askPrompt = experiment?.agentPrompt ?? (locale === "en"
    ? "Tell me exactly which analytics I need to import, then help me create a measurement-ready Xiaohongshu post."
    : "请告诉我需要补齐哪些真实数据，并帮我创建一篇可以完整测量的小红书内容。");
  const workbenchHref = experiment
    ? `/workbench?platform=${experiment.platform}&idea=${encodeURIComponent(experiment.workbenchIdea)}`
    : "/workbench";
  const missionHref = activeMission
    ? activeMission.kitId
      ? `/kits/${activeMission.kitId}`
      : buildMissionWorkbenchHref(activeMission)
    : workbenchHref;
  const assignmentTitle = activeMission?.title ?? primary?.title ?? briefing.headline;
  const assignmentEvidence = activeMission?.hypothesis ?? primary?.evidence ?? briefing.summary;
  const assignmentVariants = activeMission?.variants ?? experiment?.variants ?? [];

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-[#0d0f14]">
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.72fr)]">
        <div className="relative p-4 sm:p-5">
          <div className="absolute inset-y-0 left-0 w-0.5 bg-action" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-action">
              <Activity className="h-3.5 w-3.5" />
              {locale === "en" ? "On-duty briefing · live" : "今日值班简报 · 自动更新"}
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="focus-ring inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-white/40 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              {locale === "en" ? "Refresh" : "刷新"}
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold leading-snug text-white sm:text-xl">{briefing.headline}</h2>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-white/55">{briefing.summary}</p>
            </div>
            <div className="shrink-0 border-l border-white/10 pl-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">{briefing.northStar.label}</p>
              <p className="mt-1 font-mono text-2xl font-bold text-white">{briefing.northStar.value}</p>
              <p className="mt-0.5 text-[11px] text-white/40">{briefing.northStar.evidence}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {briefing.funnel.map((signal) => (
              <div key={signal.stage} className="rounded-md border border-white/10 bg-white/[0.025] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-white/45">{signal.label}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${healthDot(signal.health)}`} />
                </div>
                <p className="mt-1 font-mono text-sm font-bold text-white/85">{signal.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 bg-white/[0.025] p-4 sm:p-5 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/38">
            <Target className="h-3.5 w-3.5 text-action" />
            {activeMission
              ? (locale === "en" ? "Active Growth Mission" : "进行中的 Growth Mission")
              : (locale === "en" ? "Today's assignment" : "Agent 今日任务")}
          </div>
          <h3 className="mt-3 text-base font-bold text-white">{assignmentTitle}</h3>
          <p className="mt-1.5 text-xs leading-5 text-white/52">{assignmentEvidence}</p>
          {activeMission ? (
            <div className="mt-3 rounded-md border border-action/20 bg-action/[0.06] p-3">
              <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-white/38">
                <span>{missionStatusLabel(activeMission.status, locale)}</span>
                <span>{activeMission.primaryMetric}</span>
              </div>
              <div className="mt-1.5 flex items-end gap-2 font-mono">
                <span className="text-sm font-bold text-white/50">{formatMissionMetric(activeMission.baselineValue)}</span>
                <span className="pb-0.5 text-[10px] text-white/28">→</span>
                <span className="text-xl font-black text-action">{formatMissionMetric(activeMission.targetValue)}</span>
              </div>
            </div>
          ) : null}
          {assignmentVariants.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {assignmentVariants.map((variant) => (
                <span key={variant.name} className="rounded-sm border border-action/20 bg-action/[0.08] px-2 py-1 text-[10px] font-semibold text-action">
                  {variant.name}
                </span>
              ))}
            </div>
          ) : briefing.missingData.length > 0 ? (
            <p className="mt-3 text-[11px] leading-5 text-warn">
              {locale === "en" ? "Missing: " : "待补数据："}{briefing.missingData.join(locale === "en" ? ", " : "、")}
            </p>
          ) : null}
          <div className="mt-4 grid gap-2">
            {activeMission ? (
              <Link href={missionHref} className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-action/55 bg-action px-4 text-xs font-bold text-on-action transition hover:bg-action-strong">
                {activeMission.kitId
                  ? (locale === "en" ? "Continue mission" : "继续推进任务")
                  : (locale === "en" ? "Generate mission draft" : "生成任务内容")}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ) : experiment ? (
              <button
                type="button"
                onClick={onStartMission}
                disabled={missionStarting}
                className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-action/55 bg-action px-4 text-xs font-bold text-on-action transition hover:bg-action-strong disabled:cursor-wait disabled:opacity-60"
              >
                {missionStarting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
                {locale === "en" ? "Accept today's mission" : "接受今日任务"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onAskAgent(askPrompt)}
                className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-action/55 bg-action px-4 text-xs font-bold text-on-action transition hover:bg-action-strong"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {locale === "en" ? "Build the data loop" : "让 Agent 帮我补数据"}
              </button>
            )}
            <button
              type="button"
              onClick={() => onAskAgent(activeMission
                ? (locale === "en"
                    ? "Review my active Growth Mission and tell me the single next action."
                    : "复盘我当前进行中的 Growth Mission，只告诉我现在唯一要做的下一步。")
                : askPrompt)}
              className="btn-ghost justify-center text-xs"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {activeMission
                ? (locale === "en" ? "Ask Agent for next action" : "让 Agent 推进下一步")
                : (locale === "en" ? "Let Agent explain the plan" : "让 Agent 展开方案")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function buildMissionWorkbenchHref(mission: GrowthMission): string {
  return `/workbench?missionId=${mission.id}&platform=${mission.platform}&idea=${encodeURIComponent(mission.workbenchIdea)}`;
}

function missionStatusLabel(status: GrowthMission["status"], locale: "zh" | "en"): string {
  const labels = locale === "en"
    ? {
        accepted: "Accepted · generate next",
        draft_ready: "Draft ready · publish next",
        posted: "Posted · waiting for metrics",
        completed: "Completed",
        dismissed: "Dismissed",
        superseded: "Superseded"
      }
    : {
        accepted: "已接受 · 下一步生成",
        draft_ready: "草稿已就绪 · 下一步发布",
        posted: "已发布 · 等待数据",
        completed: "已完成判定",
        dismissed: "已关闭",
        superseded: "已替换"
      };
  return labels[status];
}

function formatMissionMetric(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function GrowthToolSummary({ briefing, locale }: { briefing: GrowthBriefing; locale: "zh" | "en" }) {
  return (
    <div className="mt-3 space-y-3 text-white/70">
      <p className="font-semibold text-white/90">{briefing.headline}</p>
      <p className="text-xs leading-5">{briefing.summary}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {briefing.priorities.slice(0, 2).map((priority) => (
          <div key={priority.stage} className="rounded-md border border-white/10 bg-white/[0.03] p-2.5">
            <p className="text-xs font-bold text-white/85">{priority.title}</p>
            <p className="mt-1 text-[11px] leading-4 text-white/48">{priority.evidence}</p>
          </div>
        ))}
      </div>
      {briefing.experiment ? (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-white/40">
            <BarChart3 className="h-3.5 w-3.5 text-action" />
            {locale === "en" ? "Next experiment" : "下一轮实验"}
          </p>
          <p className="mt-1 text-xs text-white/65">{briefing.experiment.hypothesis}</p>
          <p className="mt-1 text-[11px] text-action">
            {locale === "en" ? "Primary metric: " : "唯一主指标："}{briefing.experiment.primaryMetric}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function healthDot(health: GrowthBriefing["funnel"][number]["health"]): string {
  if (health === "healthy") return "bg-positive shadow-[0_0_8px_rgba(70,180,120,0.55)]";
  if (health === "critical") return "bg-negative shadow-[0_0_8px_rgba(245,90,90,0.5)]";
  if (health === "warning") return "bg-warn shadow-[0_0_8px_rgba(236,180,70,0.5)]";
  return "bg-white/20";
}

function ToolResultSummary({ result, locale }: { result: unknown; locale: "zh" | "en" }) {
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  if (result && typeof result === "object" && "upgradeRequired" in result) {
    return <p className="mt-1 text-xs text-warn">{locale === "en" ? "Requires a paid plan." : "此操作需要付费套餐。"}</p>;
  }
  if (result && typeof result === "object" && "confirmationRequired" in result) {
    return <PendingAgentMutationCard result={result as Record<string, unknown>} locale={locale} />;
  }

  const auditId = result && typeof result === "object" && "auditId" in result && typeof result.auditId === "string"
    ? result.auditId
    : null;
  if (auditId) {
    async function undo() {
      setUndoing(true);
      setUndoError(null);
      try {
        const response = await fetch(`/api/agent/actions/${auditId}/undo`, { method: "POST" });
        const data = (await response.json().catch(() => ({}))) as { undone?: boolean; error?: string };
        if (!response.ok || !data.undone) throw new Error(data.error ?? "Undo failed.");
        setUndone(true);
      } catch (error) {
        setUndoError(error instanceof Error ? error.message : "Undo failed.");
      } finally {
        setUndoing(false);
      }
    }

    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-positive">{undone ? (locale === "en" ? "Change undone" : "已撤销更改") : (locale === "en" ? "Change saved and audited" : "更改已保存并记录")}</span>
        {!undone ? (
          <button
            type="button"
            onClick={() => void undo()}
            disabled={undoing}
            className="rounded-md border border-hairline px-2 py-1 text-xs font-semibold text-fg-muted transition hover:border-action/50 hover:text-fg disabled:opacity-50"
          >
            {undoing ? (locale === "en" ? "Undoing..." : "撤销中...") : (locale === "en" ? "Undo" : "撤销")}
          </button>
        ) : null}
        {undoError ? <span className="w-full text-xs text-risk">{undoError}</span> : null}
      </div>
    );
  }
  return null;
}

export function PendingAgentMutationCard({
  result,
  locale
}: {
  result: Record<string, unknown>;
  locale: "zh" | "en";
}) {
  const pending = result.pendingAction && typeof result.pendingAction === "object"
    ? result.pendingAction as { id?: string; toolName?: string; args?: Record<string, unknown> }
    : null;
  const [confirming, setConfirming] = useState(false);
  const [confirmedResult, setConfirmedResult] = useState<Record<string, unknown> | null>(null);
  const [undone, setUndone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingPackage, setGeneratingPackage] = useState(false);
  const [packageQueued, setPackageQueued] = useState(false);
  const [savedPackage, setSavedPackage] = useState<{ id: string; outputCount: number } | null>(null);
  const [packageError, setPackageError] = useState<string | null>(null);
  const zh = locale === "zh";

  async function generateContentPackage(generationRequest: Record<string, unknown>) {
    setGeneratingPackage(true);
    setPackageQueued(false);
    setSavedPackage(null);
    setPackageError(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify(generationRequest)
      });
      if (!response.ok) {
        const initial = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(initial?.error ?? "Unable to generate this content package.");
      }

      let streamError: string | null = null;
      await consumeSSEStream(response, (event, data) => {
        if (event === "queued") {
          setPackageQueued(true);
          return;
        }
        if (event === "done") {
          const kit = (data as { kit?: { id?: unknown; outputs?: unknown[] } }).kit;
          if (kit && typeof kit.id === "string") {
            setPackageQueued(false);
            setSavedPackage({ id: kit.id, outputCount: Array.isArray(kit.outputs) ? kit.outputs.length : 0 });
          }
          return;
        }
        if (event === "error") {
          streamError = (data as { error?: string }).error ?? "Unable to generate this content package.";
        }
      });
      if (streamError) throw new Error(streamError);
    } catch (caught) {
      setPackageError(caught instanceof Error ? caught.message : "Unable to generate this content package.");
    } finally {
      setGeneratingPackage(false);
    }
  }

  async function confirm() {
    if (!pending?.id) return;
    setConfirming(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent/actions/${pending.id}/confirm`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        executed?: boolean;
        result?: Record<string, unknown>;
        error?: string;
      };
      if (!response.ok || !data.executed) throw new Error(data.error ?? "Unable to confirm this Agent change.");
      const confirmed = data.result ?? {};
      setConfirmedResult(confirmed);
      const generationRequest = recordValue(confirmed.generationRequest);
      if (generationRequest) await generateContentPackage(generationRequest);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to confirm this Agent change.");
    } finally {
      setConfirming(false);
    }
  }

  async function undo() {
    const auditId = confirmedResult && typeof confirmedResult.auditId === "string"
      ? confirmedResult.auditId
      : null;
    if (!auditId) return;
    setConfirming(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent/actions/${auditId}/undo`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { undone?: boolean; error?: string };
      if (!response.ok || !data.undone) throw new Error(data.error ?? "Undo failed.");
      setUndone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Undo failed.");
    } finally {
      setConfirming(false);
    }
  }

  if (!pending?.id) return null;
  const workbenchUrl = confirmedResult && typeof confirmedResult.workbenchUrl === "string"
    ? confirmedResult.workbenchUrl
    : null;
  const generationRequest = confirmedResult ? recordValue(confirmedResult.generationRequest) : null;
  const isContentPackageWorkflow = Boolean(generationRequest);
  const contentPackagePreview = !confirmedResult && pending?.toolName === "prepare_platform_content_package"
    ? contentPackagePreviewValue(pending.args)
    : null;
  const creatorStylePreview = pending?.toolName === "save_creator_style_profile"
    ? creatorStyleProfileSchema.safeParse(pending.args?.profile)
    : null;
  const researchPreview = pending?.toolName === "run_evidence_research"
    ? researchMissionPreviewValue(pending.args)
    : null;
  const completedResearch = confirmedResult ? recordValue(confirmedResult.researchMission) : null;
  return (
    <div className="mt-3 rounded-lg border border-action/25 bg-action/[0.06] p-3">
      <p className="text-xs font-bold text-fg">
        {undone
          ? (zh ? "更改已撤销" : "Change undone")
          : confirmedResult
          ? (zh ? "更改已确认并执行" : "Change confirmed and applied")
          : (zh ? "等待你确认" : "Waiting for confirmation")}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-fg-muted">
        {undone
          ? (zh ? "本次更改已恢复到执行前状态。" : "This change has been restored to its previous state.")
          : confirmedResult
            ? (zh ? "服务端已校验并记录这次操作。" : "The server validated and recorded this action.")
          : (zh ? "Agent 尚未写入任何内容。点击确认后才会执行。" : "The Agent has not written anything. The change runs only after confirmation.")}
      </p>
      {!confirmedResult && pending.toolName === "update_brand_brain" ? (
        <p className="mt-2 text-[11px] leading-5 text-action/90">
          {zh ? `值得记住吗：${describeBrandMemoryUpdate(pending.args, locale)}` : `Worth remembering: ${describeBrandMemoryUpdate(pending.args, locale)}`}
        </p>
      ) : null}
      {creatorStylePreview?.success ? (
        <CreatorStyleProfileCard
          profile={creatorStylePreview.data}
          locale={locale}
          variant="surface"
          compact
        />
      ) : null}
      {researchPreview ? <ResearchMissionPreview preview={researchPreview} locale={locale} /> : null}
      {completedResearch ? <CompletedResearchSummary mission={completedResearch} locale={locale} /> : null}
      {contentPackagePreview ? <ContentPackagePreview preview={contentPackagePreview} locale={locale} /> : null}
      {confirmedResult ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {workbenchUrl ? (
            <Link href={workbenchUrl} className="inline-flex items-center gap-1.5 text-xs font-bold text-action hover:underline">
              {zh ? "带着任务去创作台" : "Execute in Workbench"}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
          {!undone && typeof confirmedResult.auditId === "string" ? (
            <button
              type="button"
              onClick={() => void undo()}
              disabled={confirming}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-fg-muted hover:text-fg"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {zh ? "撤销" : "Undo"}
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={confirming}
          className="focus-ring mt-3 inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-action/55 bg-action px-3 text-xs font-bold text-on-action transition hover:bg-action-strong disabled:opacity-50"
        >
          {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {zh ? "确认执行" : "Confirm"}
        </button>
      )}
      {confirmedResult && isContentPackageWorkflow ? (
        <div className="mt-3 border-t border-hairline pt-3">
          {generatingPackage ? (
            <p className="flex items-center gap-2 text-xs text-fg-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-action" />
              {zh ? "正在生成内容包，Credits 将由现有生成流程结算。" : "Generating the content package through the existing Credits workflow."}
            </p>
          ) : null}
          {packageQueued ? (
            <p className="text-xs leading-5 text-fg-muted">
              {zh ? "内容包已进入生成队列。保存后会出现在内容库。" : "The content package is queued and will appear in the Content Library after it is saved."}
            </p>
          ) : null}
          {savedPackage ? (
            <div>
              <p className="text-xs leading-5 text-positive">
                {zh ? `内容包已保存，包含 ${savedPackage.outputCount} 条可编辑输出；尚未对外发布。` : `Content package saved with ${savedPackage.outputCount} editable output${savedPackage.outputCount === 1 ? "" : "s"}. It has not been published.`}
              </p>
              <Link href={`/kits/${savedPackage.id}`} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-action hover:underline">
                {zh ? "打开内容包" : "Open content package"}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : null}
          {packageError && generationRequest ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-risk">{packageError}</p>
              <button
                type="button"
                onClick={() => void generateContentPackage(generationRequest)}
                disabled={generatingPackage}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-action hover:underline disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {zh ? "重试生成" : "Retry generation"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-risk">{error}</p> : null}
    </div>
  );
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

type ContentPackagePreviewValue = {
  platform: "wechat" | "x";
  ideaText: string;
  goal: string;
  persona: string;
};

function contentPackagePreviewValue(args: Record<string, unknown> | undefined): ContentPackagePreviewValue | null {
  if (!args || (args.platform !== "wechat" && args.platform !== "x")) return null;
  const ideaText = typeof args.ideaText === "string" ? args.ideaText.trim() : "";
  const goal = typeof args.goal === "string" ? args.goal.trim() : "";
  const persona = typeof args.persona === "string" ? args.persona.trim() : "";
  return ideaText && goal && persona ? { platform: args.platform, ideaText, goal, persona } : null;
}

function ContentPackagePreview({
  preview,
  locale
}: {
  preview: ContentPackagePreviewValue;
  locale: "zh" | "en";
}) {
  const zh = locale === "zh";
  const platformLabel = preview.platform === "wechat" ? (zh ? "公众号" : "WeChat") : "X";
  const deliverables = preview.platform === "wechat"
    ? (zh ? "长文结构、Markdown/HTML、封面摘要与发布交接包" : "long-form structure, Markdown/HTML, cover summary, and publishing handoff")
    : (zh ? "编号线程、媒体位置与发布交接包" : "numbered thread, media placements, and publishing handoff");
  return (
    <div className="mt-3 border-l-2 border-action/70 bg-surface-2/55 px-3 py-2.5">
      <p className="text-xs font-bold text-fg">{zh ? `${platformLabel} 内容包预览` : `${platformLabel} content package preview`}</p>
      <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-fg-muted">{preview.ideaText}</p>
      <p className="mt-2 text-[11px] leading-5 text-fg-muted">{zh ? `将生成：${deliverables}` : `Will generate: ${deliverables}`}</p>
      <p className="text-[11px] leading-5 text-fg-subtle">{zh ? `目标 ${preview.goal} · 受众 ${preview.persona}` : `Goal ${preview.goal} · Audience ${preview.persona}`}</p>
    </div>
  );
}

type ResearchMissionPreviewValue = {
  missionType: "category_opportunity" | "product_competitor";
  title: string;
  question: string;
  evidenceCount: number;
};

function researchMissionPreviewValue(args: Record<string, unknown> | undefined): ResearchMissionPreviewValue | null {
  if (!args || (args.missionType !== "category_opportunity" && args.missionType !== "product_competitor")) return null;
  const title = typeof args.title === "string" ? args.title.trim() : "";
  const question = typeof args.question === "string" ? args.question.trim() : "";
  const evidenceCount = Array.isArray(args.evidence) ? args.evidence.length : 0;
  return title && question && evidenceCount > 0
    ? { missionType: args.missionType, title, question, evidenceCount }
    : null;
}

function ResearchMissionPreview({ preview, locale }: { preview: ResearchMissionPreviewValue; locale: "zh" | "en" }) {
  const zh = locale === "zh";
  return (
    <div className="mt-3 rounded-lg border border-action/20 bg-surface-2/55 p-3">
      <p className="text-[11px] font-black uppercase tracking-wider text-action">
        {preview.missionType === "category_opportunity"
          ? (zh ? "品类机会研究" : "Category opportunity research")
          : (zh ? "竞品研究" : "Competitor research")}
      </p>
      <p className="mt-1 text-xs font-bold text-fg">{preview.title}</p>
      <p className="mt-1 text-[11px] leading-5 text-fg-muted">{preview.question}</p>
      <p className="mt-2 text-[10px] font-bold text-fg-subtle">
        {zh ? `${preview.evidenceCount} 条真实证据 · 确认后才生成并结算 Credits` : `${preview.evidenceCount} evidence items · generated and billed only after confirmation`}
      </p>
    </div>
  );
}

function CompletedResearchSummary({ mission, locale }: { mission: Record<string, unknown>; locale: "zh" | "en" }) {
  const decision = recordValue(mission.decision);
  const summary = typeof decision?.executiveSummary === "string" ? decision.executiveSummary : "";
  if (!summary) return null;
  return (
    <div className="mt-3 border-l-2 border-positive/70 bg-positive/[0.045] px-3 py-2.5">
      <p className="text-xs font-bold text-positive">{locale === "zh" ? "研究决策已生成" : "Research decision ready"}</p>
      <p className="mt-1 text-[11px] leading-5 text-fg-muted">{summary}</p>
    </div>
  );
}

export function describeBrandMemoryUpdate(args: Record<string, unknown> | undefined, locale: "zh" | "en"): string {
  if (!args) return "";
  const fields: Array<[string, string]> = locale === "en" ? [
    ["toneKeywords", "Tone words"],
    ["bannedPhrases", "Words to avoid"],
    ["approvedExamples", "Approved examples"],
    ["positioningStatement", "Positioning"],
    ["targetAudience", "Audience"]
  ] : [
    ["toneKeywords", "语气关键词"],
    ["bannedPhrases", "禁用表达"],
    ["approvedExamples", "认可范文"],
    ["positioningStatement", "定位"],
    ["targetAudience", "受众"]
  ];
  const updates = fields.flatMap(([key, label]) => {
    const value = args[key];
    if (Array.isArray(value)) {
      const entries = value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 2);
      return entries.length > 0 ? [`${label}：${entries.join("、")}`] : [];
    }
    return typeof value === "string" && value.trim() ? [`${label}：${value.trim().slice(0, 80)}`] : [];
  });
  return updates.join(locale === "en" ? "; " : "；") || (locale === "en" ? "Brand Memory update" : "品牌记忆更新");
}
