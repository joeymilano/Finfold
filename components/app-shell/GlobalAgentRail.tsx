"use client";

import React, {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  Bot,
  CheckCircle2,
  Expand,
  History,
  Loader2,
  Plus,
  Sparkles,
  X
} from "@/components/ui/icons";
import { AgentComposer } from "@/components/app-shell/AgentComposer";
import { AgentThinkingTrace } from "@/components/app-shell/AgentThinkingTrace";
import { CreatorStyleProfileCard } from "@/components/app-shell/CreatorStyleProfileCard";
import { XhsToolResultCard } from "@/components/app-shell/XhsAgentWorkflowCard";
import { BorderBeam } from "@/components/ui/BorderBeam";
import { addToast } from "@/components/ui/Toast";
import { useLocale } from "@/hooks/useLocale";
import { getAgentToolLabel, OPEN_GLOBAL_AGENT_EVENT, resolveAgentPageContext } from "@/lib/agent/presentation";
import { captureEvent } from "@/lib/posthog";
import { consumeSSEStream } from "@/lib/sse-client";
import type { AgentAttachment } from "@/lib/agent/attachments";
import { creatorStyleProfileSchema } from "@/lib/agent/style-profile";
import {
  isAgentChatOutcome,
  isPendingAgentConfirmation,
  resolveAgentTerminalContent,
  type AgentChatOutcome
} from "@/lib/agent/chat-outcome";
import {
  advanceAgentStatus,
  completeAgentStatuses,
  isAgentStatusStage,
  type AgentStatusEvent
} from "@/lib/agent/status";

type ToolEvent = {
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
  completed?: boolean;
};
type RailMessage = {
  role: "assistant" | "user";
  content: string;
  pending?: boolean;
  toolEvents?: ToolEvent[];
  statusEvents?: AgentStatusEvent[];
  paused?: boolean;
  attachments?: AgentAttachment[];
};

type AgentSession = {
  id: string;
  title: string;
  updated_at: string;
};

type GlobalAgentRailProps = {
  previewPathname?: string;
  previewMode?: boolean;
};

const RAIL_SESSION_KEY = "finfold-global-agent-session-v1";

const PREVIEW_SESSIONS: AgentSession[] = [
  { id: "preview-current", title: "奶茶新品小红书整套方案", updated_at: "2026-08-04T03:02:00.000Z" },
  { id: "preview-brand", title: "梳理品牌语气与禁用表达", updated_at: "2026-08-03T08:40:00.000Z" },
  { id: "preview-review", title: "复盘上周内容表现", updated_at: "2026-08-01T02:20:00.000Z" }
];

const SUGGESTIONS: Record<string, { zh: string[]; en: string[] }> = {
  dashboard: {
    zh: ["分析今天最值得先做的任务", "看看本周增长哪里不对劲"],
    en: ["Find today's highest-value task", "Check what changed in growth this week"]
  },
  workbench: {
    zh: ["检查这批内容，告诉我先改哪条", "把这个想法做成小红书发布方案"],
    en: ["Review this content and tell me what to fix first", "Turn this idea into a Xiaohongshu publishing plan"]
  },
  packages: {
    zh: ["从最近内容中找出可复用的风格", "检查哪些内容已经可以发布"],
    en: ["Find reusable styles in recent content", "Check which content is ready to publish"]
  },
  "brand-memory": {
    zh: ["检查品牌记忆有没有冲突", "总结 Finfold 最近学会了什么"],
    en: ["Check brand memory for conflicts", "Summarize what Finfold learned recently"]
  },
  guardrails: {
    zh: ["检查还缺哪些品牌表达边界", "找出会影响内容质量的规则冲突"],
    en: ["Find missing brand boundaries", "Find rules that conflict with content quality"]
  },
  billing: {
    zh: ["解释哪种套餐最适合我", "我当前可以使用哪些 Agent 能力"],
    en: ["Explain which plan fits me", "What Agent capabilities can I use now?"]
  },
  finfold: {
    zh: ["告诉我现在最值得做什么", "帮我把营销想法变成可发布内容"],
    en: ["Tell me the best next step", "Turn a marketing idea into publish-ready content"]
  }
};

const PREVIEW_MESSAGES: RailMessage[] = [
  { role: "user", content: "帮我把今天的奶茶新品做成一篇小红书爆款图文" },
  {
    role: "assistant",
    content: "我会先结合你的品牌语气和近期热门结构，整理 3 个选题方向，再给你一份可以直接修改的图文方案。发布前会先让你确认。",
    toolEvents: [
      {
        name: "create_execution_plan",
        completed: true,
        result: {
          steps: [
            { title: "读取品牌与真实素材", outcome: "确认事实边界" },
            { title: "调研选题方向", outcome: "给出推荐方向" },
            { title: "生成正文与标题", outcome: "完成可编辑初稿" },
            { title: "编排视觉故事", outcome: "生成 3:4 故事板" },
            { title: "发布前检查", outcome: "等待最终确认" }
          ]
        }
      },
      { name: "get_brand_brain", completed: true },
      {
        name: "prepare_xhs_campaign",
        completed: true,
        result: {
          xhsCard: {
            kind: "campaign",
            eyebrow: "整套方案 · 一次确认",
            title: "写字楼下的新奶茶，怎么让人一眼记住",
            summary: "调研、正文方向、标题和 3:4 视觉故事板已经连续准备完成；采用后进入创作与发布预览，不会直接公开发布。",
            items: [
              { id: "topic", title: "推荐选题：午休 10 分钟，也值得喝一杯有记忆点的奶茶", rationale: "从真实办公场景切入，不虚构平台热度" },
              { id: "title", title: "主标题：楼下这杯奶茶，凭什么被记住", rationale: "具体场景 + 好奇缺口 · 标题评分 88" },
              { id: "visual", title: "视觉故事：6 页 · 3:4", rationale: "封面单焦点，逐页展示场景、差异和行动" }
            ],
            meta: {
              limitations: ["尚未接入实时小红书趋势样本；当前选题属于品牌策略判断。"],
              targetMetric: "封面点击率",
              href: "/workbench?platform=xiaohongshu"
            }
          },
          pendingAction: { id: "preview-action", actionKind: "confirm_campaign" },
          executionProgress: { completedSteps: 5, totalSteps: 5 }
        }
      }
    ],
    statusEvents: [
      { stage: "understanding_request", completed: true },
      { stage: "connecting_workspace", completed: true },
      { stage: "preparing_context", completed: true },
      { stage: "choosing_capabilities", completed: true },
      { stage: "reviewing_results", completed: true },
      { stage: "composing_response", completed: true }
    ]
  }
];

function TaskProgress({ events, locale }: { events: ToolEvent[]; locale: "zh" | "en" }) {
  const planEvent = events.find((event) => event.name === "create_execution_plan");
  const planValue = planEvent?.result && typeof planEvent.result === "object"
    ? planEvent.result as { steps?: Array<{ title?: string; outcome?: string }> }
    : planEvent?.args as { steps?: Array<{ title?: string; outcome?: string }> } | undefined;
  const plannedSteps = (planValue?.steps ?? []).filter((step) => typeof step.title === "string" && step.title.trim());
  const executionEvents = events.filter((event) => event.name !== "create_execution_plan");
  const fallbackEvents = executionEvents.length > 0 ? executionEvents : events;
  const explicitProgress = executionEvents
    .map((event) => event.result && typeof event.result === "object" && "executionProgress" in event.result
      ? (event.result as { executionProgress?: { completedSteps?: number; totalSteps?: number } }).executionProgress
      : undefined)
    .find(Boolean);
  const completed = explicitProgress?.completedSteps ?? executionEvents.filter((event) => event.completed).length;
  const total = plannedSteps.length || explicitProgress?.totalSteps || fallbackEvents.length;
  const currentIndex = Math.min(completed, Math.max(total - 1, 0));
  const activeTitle = plannedSteps[currentIndex]?.title
    ?? getAgentToolLabel(fallbackEvents.find((event) => !event.completed)?.name ?? fallbackEvents.at(-1)?.name ?? "create_execution_plan", locale);
  const finished = total > 0 && completed >= total;

  return (
    <details className="group mb-3">
      <summary className="focus-ring inline-flex max-w-full cursor-pointer list-none items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-fg-muted shadow-raised transition hover:border-action/35 [&::-webkit-details-marker]:hidden">
        {finished
          ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-positive" />
          : <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-action/25 border-t-action motion-safe:animate-spin" />}
        <span className="truncate">
          {locale === "zh" ? `步骤 ${Math.min(completed + 1, total)} / ${total}` : `Step ${Math.min(completed + 1, total)} / ${total}`}
          {activeTitle ? ` · ${activeTitle}` : ""}
        </span>
      </summary>
      <div className="mt-2 space-y-1.5 rounded-xl border border-hairline bg-surface/75 p-2">
        {(plannedSteps.length > 0 ? plannedSteps : fallbackEvents).map((item, index) => {
          const label = "name" in item ? getAgentToolLabel(item.name, locale) : item.title ?? "";
          const itemCompleted = plannedSteps.length > 0 ? index < completed : "completed" in item && Boolean(item.completed);
          const itemActive = !itemCompleted && index === currentIndex;
          return (
          <div key={`${label}-${index}`} className="flex items-center gap-2 px-1.5 py-1 text-[11px] font-semibold text-fg-muted">
            {itemCompleted
              ? <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
              : itemActive
                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-action" />
                : <span className="h-3.5 w-3.5 rounded-full border border-hairline" />}
            <span className="flex-1">{label}</span>
            <span className="text-[10px] text-fg-subtle">
              {itemCompleted
                ? (locale === "zh" ? "已完成" : "Done")
                : itemActive
                  ? (locale === "zh" ? "进行中" : "Working")
                  : (locale === "zh" ? "待执行" : "Queued")}
            </span>
          </div>
        );})}
      </div>
    </details>
  );
}

function PendingMutationConfirmCard({
  result,
  toolName,
  locale
}: {
  result: Record<string, unknown>;
  toolName: string;
  locale: "zh" | "en";
}) {
  const pending = result.pendingAction && typeof result.pendingAction === "object"
    ? result.pendingAction as { id?: string; toolName?: string; args?: Record<string, unknown> }
    : null;
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState<Record<string, unknown> | null>(null);
  const [undone, setUndone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zh = locale === "zh";

  async function confirm() {
    if (!pending?.id || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent/actions/${pending.id}/confirm`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        executed?: boolean;
        result?: Record<string, unknown>;
        error?: string;
      };
      if (!response.ok || !data.executed) {
        throw new Error(data.error ?? (zh ? "确认失败，请重试。" : "Unable to confirm this change."));
      }
      setConfirmed(data.result ?? {});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (zh ? "确认失败，请重试。" : "Unable to confirm this change."));
    } finally {
      setConfirming(false);
    }
  }

  async function undo() {
    const auditId = confirmed && typeof confirmed.auditId === "string" ? confirmed.auditId : null;
    if (!auditId || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent/actions/${auditId}/undo`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { undone?: boolean; error?: string };
      if (!response.ok || !data.undone) {
        throw new Error(data.error ?? (zh ? "撤销失败。" : "Undo failed."));
      }
      setUndone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (zh ? "撤销失败。" : "Undo failed."));
    } finally {
      setConfirming(false);
    }
  }

  if (!pending?.id) return null;
  const label = getAgentToolLabel(toolName, locale);
  const creatorStylePreview = pending.toolName === "save_creator_style_profile"
    ? creatorStyleProfileSchema.safeParse(pending.args?.profile)
    : null;
  return (
    <div className="mt-3 rounded-xl border border-action/25 bg-action/[0.06] p-3">
      <p className="text-xs font-bold text-fg">
        {undone
          ? (zh ? "已撤销更改" : "Change undone")
          : confirmed
            ? (zh ? "更改已确认并执行" : "Change confirmed and applied")
            : (zh ? "等待你确认" : "Waiting for confirmation")}
      </p>
      {creatorStylePreview?.success ? (
        <CreatorStyleProfileCard
          profile={creatorStylePreview.data}
          locale={locale}
          variant="surface"
          compact
        />
      ) : null}
      <p className="mt-1 text-[11px] leading-5 text-fg-muted">
        {undone
          ? (zh ? "本次更改已恢复到执行前状态。" : "This change has been restored to its previous state.")
          : confirmed
            ? (zh ? "服务端已校验并记录这次操作。" : "The server validated and recorded this action.")
          : (zh
            ? `Agent 尚未写入任何内容。点击确认后才会真正执行「${label}」。`
            : `The Agent hasn't written anything yet. "${label}" runs only after you confirm.`)}
      </p>
      {error ? <p className="mt-2 text-[11px] text-risk">{error}</p> : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {!confirmed && !undone ? (
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={confirming}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-action px-3 py-1.5 text-xs font-bold text-on-action transition hover:bg-action-strong disabled:opacity-50"
          >
            {confirming
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <CheckCircle2 className="h-3.5 w-3.5" />}
            {confirming ? (zh ? "确认中…" : "Confirming…") : (zh ? "确认执行" : "Confirm")}
          </button>
        ) : null}
        {confirmed && !undone && typeof confirmed.auditId === "string" ? (
          <button
            type="button"
            onClick={() => void undo()}
            disabled={confirming}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-bold text-fg-muted transition hover:text-fg disabled:opacity-50"
          >
            {zh ? "撤销" : "Undo"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function GlobalAgentRail({ previewPathname, previewMode = false }: GlobalAgentRailProps) {
  const actualPathname = usePathname();
  const pathname = previewPathname ?? actualPathname ?? "/";
  const locale = useLocale();
  const [open, setOpen] = useState(previewMode);
  const [sessionId, setSessionId] = useState<string | null>(previewMode ? "preview-current" : null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<AgentAttachment[]>([]);
  const [messages, setMessages] = useState<RailMessage[]>(previewMode ? PREVIEW_MESSAGES : []);
  const [sessions, setSessions] = useState<AgentSession[]>(previewMode ? PREVIEW_SESSIONS : []);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const activeRunRef = useRef(0);
  const context = useMemo(() => resolveAgentPageContext(pathname), [pathname]);
  const suggestions = SUGGESTIONS[context.key]?.[locale] ?? SUGGESTIONS.finfold[locale];
  const isFullAgentPage = !previewPathname && (
    actualPathname === "/dashboard" || actualPathname?.startsWith("/agents") === true
  );

  const copy = locale === "en" ? {
    launcher: "Ask Finfold",
    auto: "Auto-selects capabilities",
    title: "Finfold Agent",
    subtitle: "Tell me the outcome. I’ll choose the right capabilities.",
    viewing: "Viewing",
    newChat: "New conversation",
    history: "History",
    historyTitle: "Conversation history",
    noHistory: "No previous conversations yet",
    current: "Current",
    full: "Full workspace",
    close: "Close Agent",
    greeting: `I know you are viewing ${context.labelEn}. Tell me the outcome and I’ll start with the right capabilities.`,
    placeholder: "Do anything",
    send: "Send",
    pause: "Pause",
    paused: "Paused. You can continue whenever you’re ready.",
    resume: "Continue this task",
    thinking: "Choosing the best way to help…",
    uploadFail: "Could not upload this attachment."
  } : {
    launcher: "问 Finfold",
    auto: "自动选能力",
    title: "Finfold Agent",
    subtitle: "说目标就行，我会自动选择能力",
    viewing: "正在看",
    newChat: "新对话",
    history: "历史对话",
    historyTitle: "历史对话",
    noHistory: "还没有历史对话",
    current: "当前",
    full: "完整工作台",
    close: "关闭 Agent",
    greeting: `我知道你正在看${context.labelZh}。告诉我想完成什么，我会直接选择合适的能力开始做。`,
    placeholder: "想做什么都可以",
    send: "发送",
    pause: "暂停",
    paused: "已暂停。你可以随时从这里继续。",
    resume: "继续这个任务",
    thinking: "正在选择最合适的做法…",
    uploadFail: "附件上传失败，请重试。"
  };

  useEffect(() => {
    if (previewMode) return;
    let cancelled = false;
    let storedSessionId = "";
    try {
      storedSessionId = window.localStorage.getItem(RAIL_SESSION_KEY) ?? "";
    } catch {
      return;
    }
    if (!storedSessionId) return;

    void fetch(`/api/agent/sessions/${encodeURIComponent(storedSessionId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to restore Agent session.");
        return response.json() as Promise<{ messages?: Array<{ role?: string; content?: unknown }> }>;
      })
      .then((data) => {
        if (cancelled) return;
        setSessionId(storedSessionId);
        setMessages(mapStoredMessages(data.messages ?? []));
      })
      .catch(() => {
        try {
          window.localStorage.removeItem(RAIL_SESSION_KEY);
        } catch {
          // Session restore is best-effort and must never block a new chat.
        }
      });
    return () => {
      cancelled = true;
    };
  }, [previewMode]);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setOpen((current) => {
          const next = !current;
          if (next) captureEvent("global_agent_opened", { surface: context.key, method: "shortcut" });
          return next;
        });
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [context.key]);

  useEffect(() => {
    function openFromProductSurface() {
      setOpen(true);
      captureEvent("global_agent_opened", {
        surface: context.key,
        method: "workbench_card"
      });
    }
    window.addEventListener(OPEN_GLOBAL_AGENT_EVENT, openFromProductSurface);
    return () => window.removeEventListener(OPEN_GLOBAL_AGENT_EVENT, openFromProductSurface);
  }, [context.key]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
  }, []);

  function openRail(method: "launcher" | "suggestion") {
    setOpen(true);
    captureEvent("global_agent_opened", { surface: context.key, method });
  }

  async function loadSessions() {
    if (previewMode) {
      setSessions(PREVIEW_SESSIONS);
      return;
    }
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/agent/sessions", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { sessions?: AgentSession[] };
      if (!response.ok) throw new Error("Unable to load Agent history.");
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleHistory() {
    setHistoryOpen((current) => {
      const next = !current;
      if (next) void loadSessions();
      return next;
    });
  }

  async function selectSession(nextSession: AgentSession) {
    if (sending) stopAgent();
    if (previewMode) {
      setSessionId(nextSession.id);
      setMessages(nextSession.id === "preview-current" ? PREVIEW_MESSAGES : [
        { role: "user", content: nextSession.title },
        {
          role: "assistant",
          content: nextSession.id === "preview-brand"
            ? "我已经整理了品牌语气、可复用表达和需要避免的说法。"
            : "我已经按真实表现找出最上游的内容断点，并保留了下一步建议。"
        }
      ]);
      setHistoryOpen(false);
      return;
    }
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/agent/sessions/${encodeURIComponent(nextSession.id)}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { messages?: Array<{ role?: string; content?: unknown }> };
      if (!response.ok) throw new Error("Unable to load Agent session.");
      setSessionId(nextSession.id);
      setMessages(mapStoredMessages(data.messages ?? []));
      setHistoryOpen(false);
      try {
        window.localStorage.setItem(RAIL_SESSION_KEY, nextSession.id);
      } catch {
        // History still works for this page when storage is unavailable.
      }
    } finally {
      setHistoryLoading(false);
    }
  }

  function stopAgent() {
    if (!sending) return;
    activeRunRef.current += 1;
    abortRef.current?.abort();
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setMessages((current) => {
      const next = [...current];
      const last = next.at(-1);
      if (last?.role === "assistant") {
        next[next.length - 1] = {
          ...last,
          content: last.content ? `${last.content}\n\n${copy.paused}` : copy.paused,
          pending: false,
          paused: true
        };
      }
      return next;
    });
    setSending(false);
    captureEvent("global_agent_paused", { surface: context.key, has_session: Boolean(sessionId) });
  }

  function resetConversation() {
    if (sending) stopAgent();
    setSessionId(null);
    setMessages([]);
    setInput("");
    setPendingAttachments([]);
    setHistoryOpen(false);
    try {
      window.localStorage.removeItem(RAIL_SESSION_KEY);
    } catch {
      // A storage failure should not block starting a new conversation.
    }
    inputRef.current?.focus();
  }

  async function uploadAttachments(files: FileList | File[] | null) {
    if (!files?.length || uploading) return;
    const remainingSlots = Math.max(0, 6 - pendingAttachments.length);
    if (!remainingSlots) {
      addToast("error", locale === "zh" ? "每次最多添加 6 个附件。" : "Add up to 6 attachments at a time.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).slice(0, remainingSlots).forEach((file) => formData.append("files", file));
      const response = await fetch("/api/agent/attachments", { method: "POST", body: formData });
      const data = (await response.json().catch(() => ({}))) as { attachments?: AgentAttachment[]; error?: string };
      if (!response.ok || !data.attachments) throw new Error(data.error ?? copy.uploadFail);
      setPendingAttachments((current) => [...current, ...data.attachments!]);
      captureEvent("global_agent_attachments_added", { surface: context.key, count: data.attachments.length });
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : copy.uploadFail);
    } finally {
      setUploading(false);
    }
  }

  async function sendMessage(event?: FormEvent, preset?: string) {
    event?.preventDefault();
    const attachments = [...pendingAttachments];
    const message = (preset ?? input).trim() || (attachments.length
      ? (locale === "zh" ? "请分析这些附件。" : "Please analyze these attachments.")
      : "");
    if (!message || sending || uploading) return;
    const runId = activeRunRef.current + 1;
    activeRunRef.current = runId;

    setInput("");
    setPendingAttachments([]);
    setHistoryOpen(false);
    setSending(true);
    setMessages((current) => [
      ...current,
      { role: "user", content: message, ...(attachments.length ? { attachments } : {}) },
      {
        role: "assistant",
        content: "",
        pending: true,
        toolEvents: [],
        statusEvents: [{ stage: "understanding_request", completed: false }]
      }
    ]);
    captureEvent("global_agent_message_sent", { surface: context.key, has_session: Boolean(sessionId) });

    if (previewMode) {
      previewTimerRef.current = window.setTimeout(() => {
        if (activeRunRef.current !== runId) return;
        setMessages((current) => {
          const next = [...current];
          next[next.length - 1] = {
            role: "assistant",
            content: locale === "en"
              ? "I’ve mapped a short workflow. I’ll show you the draft before any publishing action."
              : "我已经把它拆成一条短工作流。任何发布动作前，我都会先把成品给你确认。",
            toolEvents: [
              { name: "get_brand_brain", completed: true },
              { name: "analyze_content_readiness", completed: false }
            ],
            statusEvents: [
              { stage: "understanding_request", completed: true },
              { stage: "connecting_workspace", completed: true },
              { stage: "preparing_context", completed: true },
              { stage: "choosing_capabilities", completed: true },
              { stage: "reviewing_results", completed: true },
              { stage: "composing_response", completed: true }
            ]
          };
          return next;
        });
        setSending(false);
        previewTimerRef.current = null;
      }, 5000);
      return;
    }

    let assistantText = "";
    const toolEvents: ToolEvent[] = [];
    let statusEvents: AgentStatusEvent[] = [{ stage: "understanding_request", completed: false }];
    let terminalOutcome: AgentChatOutcome | null = null;
    const fallback = locale === "en" ? "The Agent could not reply. Please try again." : "Agent 暂时无法回复，请重试。";
    let controller: AbortController | null = null;

    function updateAssistant(pending = true) {
      if (activeRunRef.current !== runId) return;
      setMessages((current) => {
        const next = [...current];
        next[next.length - 1] = {
          role: "assistant",
          content: assistantText,
          pending,
          toolEvents: [...toolEvents],
          statusEvents: pending ? [...statusEvents] : completeAgentStatuses(statusEvents)
        };
        return next;
      });
    }

    try {
      controller = new AbortController();
      abortRef.current = controller;
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId ?? undefined,
          message,
          attachments: attachments.length ? attachments : undefined,
          pageContext: { pathname }
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? fallback);
      }

      let streamError: string | null = null;
      await consumeSSEStream(response, (eventName, data) => {
        if (activeRunRef.current !== runId) return;
        if (eventName === "session") {
          const newSessionId = (data as { sessionId: string }).sessionId;
          setSessionId((current) => current ?? newSessionId);
          try {
            window.localStorage.setItem(RAIL_SESSION_KEY, newSessionId);
          } catch {
            // The active page still retains the session when storage is unavailable.
          }
        } else if (eventName === "text") {
          assistantText += (data as { text: string }).text;
          updateAssistant();
        } else if (eventName === "status") {
          const { stage } = data as { stage?: unknown };
          if (isAgentStatusStage(stage)) {
            statusEvents = advanceAgentStatus(statusEvents, stage);
            updateAssistant();
          }
        } else if (eventName === "tool_call") {
          const { name, args } = data as { name: string; args?: Record<string, unknown> };
          toolEvents.push({ name, args });
          updateAssistant();
        } else if (eventName === "tool_result") {
          const { name, result } = data as { name: string; result?: unknown };
          const item = toolEvents.find((tool) => tool.name === name && !tool.completed);
          if (item) {
            item.completed = true;
            item.result = result;
          }
          updateAssistant();
        } else if (eventName === "error") {
          streamError = (data as { error?: string }).error ?? fallback;
        } else if (eventName === "done") {
          const { outcome } = data as { outcome?: unknown };
          if (isAgentChatOutcome(outcome)) terminalOutcome = outcome;
        }
      });

      assistantText = resolveAgentTerminalContent({
        assistantText,
        streamError,
        outcome: terminalOutcome,
        hasPendingConfirmation: toolEvents.some((tool) => isPendingAgentConfirmation(tool.result)),
        fallback
      });
      updateAssistant(false);
      void loadSessions();
    } catch (error) {
      if (activeRunRef.current === runId) {
        assistantText = error instanceof Error ? error.message : fallback;
        updateAssistant(false);
      }
    } finally {
      if (controller && abortRef.current === controller) abortRef.current = null;
      if (activeRunRef.current === runId) setSending(false);
    }
  }

  if (isFullAgentPage) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => openRail("launcher")}
        className="focus-ring group fixed bottom-[calc(8.5rem+env(safe-area-inset-bottom))] right-3 z-40 flex items-center gap-2 rounded-full border border-action/55 bg-action px-3.5 py-2.5 text-sm font-bold text-on-action shadow-[0_16px_44px_rgb(var(--action)/0.26)] transition hover:-translate-y-0.5 hover:bg-action-strong lg:bottom-20 lg:right-6"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Sparkles className="h-4 w-4 transition-transform group-hover:rotate-6" />
        <span>{copy.launcher}</span>
          <span className="hidden rounded-full bg-on-action/10 px-2 py-0.5 text-[10px] font-semibold text-on-action/[0.85] sm:inline">{copy.auto}</span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.aside
            role="dialog"
            aria-label={copy.title}
            aria-modal="false"
            aria-busy={sending}
            initial={{ opacity: 0, x: 28, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 22, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={`fixed inset-x-2 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] top-14 z-[90] flex min-h-0 flex-col overflow-hidden rounded-[24px] border bg-surface/98 text-fg backdrop-blur-2xl transition-[border-color,box-shadow] duration-500 sm:left-auto sm:right-4 sm:top-16 sm:w-[430px] lg:bottom-5 lg:right-6 lg:top-5 ${sending
              ? "border-action/35 shadow-[0_24px_80px_rgb(0_0_0/0.3),0_0_46px_rgb(var(--action)/0.1)]"
              : "border-hairline shadow-[0_24px_80px_rgb(0_0_0/0.28)]"}`}
          >
            {sending ? (
              <>
                <BorderBeam size={170} duration={6.4} borderWidth={1.5} initialOffset={8} />
                <BorderBeam
                  size={105}
                  duration={8.6}
                  delay={3.2}
                  borderWidth={1}
                  colorFrom="#f0c275"
                  colorTo="#2dd4bf"
                  reverse
                  className="opacity-70"
                />
              </>
            ) : null}
            <header className="shrink-0 border-b border-hairline bg-surface/92 px-4 pb-3 pt-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-action/[0.11] text-action-strong dark:text-action">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-extrabold tracking-tight text-fg">{copy.title}</h2>
                    <span className="rounded-full border border-action/25 bg-action/[0.08] px-2 py-0.5 text-[10px] font-bold text-action-strong dark:text-action">{copy.auto}</span>
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-fg-muted">{copy.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="focus-ring relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-2/80 text-fg-muted transition after:absolute after:-inset-1.5 after:content-[''] hover:border-action/35 hover:bg-action/[0.07] hover:text-action-strong dark:hover:text-action"
                  aria-label={copy.close}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2/75 px-2.5 py-1 text-[11px] font-semibold text-fg-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                  {copy.viewing}: {locale === "en" ? context.labelEn : context.labelZh}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={resetConversation} className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition hover:bg-surface-2 hover:text-fg" title={copy.newChat} aria-label={copy.newChat}>
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleHistory}
                    className={`focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${historyOpen ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"}`}
                    aria-expanded={historyOpen}
                    aria-label={copy.history}
                  >
                    <History className="h-3.5 w-3.5" />
                    <span>{copy.history}</span>
                  </button>
                  <Link href="/dashboard" onClick={() => setOpen(false)} className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-fg-muted transition hover:bg-surface-2 hover:text-fg">
                    <Expand className="h-3.5 w-3.5" />
                    {copy.full}
                  </Link>
                </div>
              </div>
            </header>

            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {historyOpen ? (
                <section aria-label={copy.historyTitle}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-fg">{copy.historyTitle}</p>
                      <p className="mt-0.5 text-[11px] text-fg-muted">{locale === "zh" ? "选择一段对话继续，不会丢失当前任务。" : "Choose a conversation to continue without losing the current task."}</p>
                    </div>
                    {historyLoading ? <Loader2 className="h-4 w-4 animate-spin text-action" /> : null}
                  </div>
                  <div className="space-y-2">
                    {!historyLoading && sessions.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-hairline px-3 py-8 text-center text-xs text-fg-muted">{copy.noHistory}</div>
                    ) : null}
                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => void selectSession(session)}
                        className="focus-ring group flex w-full items-start gap-3 rounded-xl border border-hairline bg-surface px-3 py-3 text-left transition hover:border-action/35 hover:bg-action/[0.035]"
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted group-hover:text-action-strong dark:group-hover:text-action">
                          <History className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-fg">{session.title || (locale === "zh" ? "未命名对话" : "Untitled conversation")}</span>
                          <span className="mt-1 block text-[10px] text-fg-subtle">{formatSessionTime(session.updated_at, locale)}</span>
                        </span>
                        {session.id === sessionId ? (
                          <span className="rounded-full bg-action/[0.1] px-2 py-0.5 text-[10px] font-bold text-action-strong dark:text-action">{copy.current}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {!historyOpen ? <>
              {messages.length === 0 ? (
                <div className="rounded-2xl border border-action/20 bg-action/[0.055] p-4">
                  <p className="text-sm leading-6 text-fg">{copy.greeting}</p>
                  <div className="mt-3 grid gap-2">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          openRail("suggestion");
                          void sendMessage(undefined, suggestion);
                        }}
                        className="focus-ring rounded-xl border border-hairline bg-surface px-3 py-2.5 text-left text-xs font-semibold leading-5 text-fg transition hover:border-action/35 hover:bg-action/[0.04]"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-auto max-w-[84%]" : "max-w-[94%]"}>
                  <div className={message.role === "user"
                    ? "rounded-2xl rounded-br-md bg-action px-3.5 py-2.5 text-sm leading-6 text-on-action"
                    : "rounded-2xl rounded-bl-md border border-hairline bg-surface-2/72 px-3.5 py-3 text-sm leading-6 text-fg"}
                  >
                    {message.attachments?.length ? (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {message.attachments.map((attachment) => (
                          <span key={attachment.id} className="max-w-full truncate rounded-lg border border-current/15 bg-black/[0.05] px-2 py-1 text-[10px] font-semibold opacity-85">
                            {attachment.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {message.statusEvents?.length ? (
                      <AgentThinkingTrace
                        events={message.statusEvents}
                        active={Boolean(message.pending)}
                        locale={locale}
                      />
                    ) : null}
                    {message.toolEvents?.length ? <TaskProgress events={message.toolEvents} locale={locale} /> : null}
                    {message.content ? <p className="whitespace-pre-wrap">{message.content}</p> : null}
                    {message.toolEvents?.map((tool, toolIndex) => {
                      const result = tool.result && typeof tool.result === "object"
                        ? tool.result as Record<string, unknown>
                        : null;
                      if (!result) return null;
                      const creatorStyleProfile = "creatorStyleProfile" in result
                        ? creatorStyleProfileSchema.safeParse(result.creatorStyleProfile)
                        : null;
                      if (creatorStyleProfile?.success) {
                        return (
                          <CreatorStyleProfileCard
                            key={`${tool.name}-creator-style-${toolIndex}`}
                            profile={creatorStyleProfile.data}
                            locale={locale}
                            variant="surface"
                            compact
                            onAskAgent={(prompt) => void sendMessage(undefined, prompt)}
                          />
                        );
                      }
                      if (result.pendingAction && typeof result.pendingAction === "object") {
                        return (
                          <PendingMutationConfirmCard
                            key={`${tool.name}-pending-${toolIndex}`}
                            result={result}
                            toolName={tool.name}
                            locale={locale}
                          />
                        );
                      }
                      if ("xhsCard" in result) {
                        return (
                          <XhsToolResultCard
                            key={`${tool.name}-result-${toolIndex}`}
                            result={result}
                            locale={locale}
                            demoMode={previewMode}
                          />
                        );
                      }
                      return null;
                    })}
                    {message.pending && !message.content && !message.toolEvents?.length && !message.statusEvents?.length ? (
                      <span className="inline-flex items-center gap-2 text-fg-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {copy.thinking}
                      </span>
                    ) : null}
                    {message.paused ? (
                      <button
                        type="button"
                        onClick={() => void sendMessage(undefined, locale === "zh" ? "继续刚才暂停的任务。" : "Continue the task I paused.")}
                        className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-full border border-action/30 bg-action/[0.08] px-3 py-1.5 text-xs font-bold text-action-strong transition hover:bg-action/[0.14] dark:text-action"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                        {copy.resume}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              </> : null}
            </div>

            <div className="shrink-0 border-t border-hairline bg-surface/95 p-3">
              <AgentComposer
                locale={locale}
                value={input}
                onChange={setInput}
                onSubmit={() => void sendMessage()}
                sending={sending}
                onStop={stopAgent}
                attachments={pendingAttachments}
                onFiles={(files) => void uploadAttachments(files)}
                onRemoveAttachment={(index) => setPendingAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                uploading={uploading}
                placeholder={copy.placeholder}
                textareaRef={inputRef}
                compact
              />
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function mapStoredMessages(rows: Array<{ role?: string; content?: unknown }>): RailMessage[] {
  return rows.flatMap((row): RailMessage[] => {
    if (row.role !== "user" && row.role !== "assistant") return [];
    const content = row.content && typeof row.content === "object" && !Array.isArray(row.content)
      ? row.content as {
          text?: string;
          toolCalls?: Array<{ name?: string; args?: Record<string, unknown> }>;
          toolResults?: Array<{ name?: string; result?: unknown }>;
          attachments?: AgentAttachment[];
        }
      : {};
    const toolEvents = row.role === "assistant"
      ? (content.toolCalls ?? []).flatMap((call, index): ToolEvent[] => call.name ? [{
          name: call.name,
          args: call.args,
          result: content.toolResults?.[index]?.result,
          completed: true
        }] : [])
      : undefined;
    return [{
      role: row.role,
      content: content.text ?? "",
      ...(toolEvents?.length ? { toolEvents } : {}),
      ...(content.attachments?.length ? { attachments: content.attachments } : {})
    }];
  });
}

function formatSessionTime(value: string, locale: "zh" | "en"): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return locale === "zh" ? "最近更新" : "Recently updated";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return locale === "zh" ? "刚刚" : "Just now";
  if (minutes < 60) return locale === "zh" ? `${minutes} 分钟前` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return locale === "zh" ? `${hours} 小时前` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return locale === "zh" ? `${days} 天前` : `${days}d ago`;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" }).format(new Date(timestamp));
}
