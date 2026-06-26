"use client";

import type { FormEvent } from "react";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  Bot,
  FileStack,
  Loader2,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  WandSparkles
} from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useLocale } from "@/hooks/useLocale";

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

const suggestionCopy = {
  zh: ["下一步该做哪个平台？", "把品牌记忆用于小红书", "哪些内容最该补齐？"],
  en: ["Which channel should I work on next?", "Use brand memory for RED", "What content gap matters most?"]
};

export function AgentAutomationCenter() {
  const locale = useLocale();
  const initialChatMessages = useMemo<ChatMessage[]>(
    () => locale === "en"
      ? [{ role: "assistant", content: "Tell me your product update or ask what to create next. I will use your brand memory, saved kits, and channel context to suggest the next useful draft." }]
      : [{ role: "assistant", content: "告诉我你的产品更新，或直接问下一步该创作什么。我会结合品牌记忆、已保存内容和平台上下文，给你一个可执行的建议。" }],
    [locale]
  );

  const copy = locale === "en" ? {
    title: "Content Agent",
    desc: "Ask what to create next — the Agent uses your brand memory, saved kits, and channel gaps.",
    chatTitle: "Agent chat",
    chatStatus: "Brand memory · Saved kits · Channel gaps",
    placeholder: "What should I create next?",
    send: "Send",
    thinking: "Thinking...",
    fallback: "The agent could not reply. Check login and Letta config.",
    runCreate: "Go to Workbench",
    memory: "Brand Memory",
    rules: "Brand Rules",
    contextTitle: "Agent reads",
    contextDesc: "Keep these updated for sharper advice.",
    contextItems: ["Product positioning", "Voice & examples", "Words to avoid"],
    nextTitle: "Try asking",
  } : {
    title: "内容 Agent",
    desc: "问下一步该做什么 — Agent 会读取品牌记忆、已保存内容和平台缺口。",
    chatTitle: "Agent 对话",
    chatStatus: "品牌记忆 · 内容库 · 平台缺口",
    placeholder: "下一步该创作什么？",
    send: "发送",
    thinking: "思考中...",
    fallback: "Agent 暂时无法回复，请检查登录和配置。",
    runCreate: "去创作台",
    memory: "品牌记忆",
    rules: "品牌规则",
    contextTitle: "Agent 会参考",
    contextDesc: "保持更新，建议更精准。",
    contextItems: ["产品定位", "语气和示例", "不要使用的表达"],
    nextTitle: "可以这样问",
  };

  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState(initialChatMessages);
  const [chatSending, setChatSending] = useState(false);

  useEffect(() => {
    setChatMessages(initialChatMessages);
  }, [initialChatMessages]);

  async function sendAgentMessage(event?: FormEvent, preset?: string) {
    event?.preventDefault();
    const message = (preset ?? chatInput).trim();
    if (!message || chatSending) return;

    setChatInput("");
    setChatSending(true);
    setChatMessages((current) => [...current, { role: "user", content: message }]);

    try {
      const response = await fetch("/api/letta/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      const data = (await response.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!response.ok || !data.reply) {
        throw new Error(data.error ?? copy.fallback);
      }
      setChatMessages((current) => [...current, { role: "assistant", content: data.reply! }]);
    } catch (error) {
      setChatMessages((current) => [
        ...current,
        { role: "assistant", content: error instanceof Error ? error.message : copy.fallback }
      ]);
    } finally {
      setChatSending(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto grid max-w-[1320px] gap-5 pb-10 lg:h-[calc(100dvh-3.75rem)] lg:pb-0">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] lg:h-full">
        <Panel command className="flex flex-col p-5 md:p-7 lg:h-full">
          <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-brand">
                <Bot className="h-4 w-4" />
                {copy.chatTitle}
              </div>
              <h1 className="mt-3 text-2xl font-bold leading-tight text-white md:text-3xl">
                {copy.title}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">
                {copy.desc}
              </p>
            </div>
            <span className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/50">
              {copy.chatStatus}
            </span>
          </div>

          <div className="mt-5 flex flex-1 flex-col gap-4 overflow-y-auto pr-1 min-h-0">
            {chatMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}-${message.content.slice(0, 18)}`}
                className={message.role === "user"
                  ? "ml-auto max-w-[78%] rounded-2xl border border-brand/35 bg-brand/18 p-4 text-base font-medium leading-7 text-white"
                  : "max-w-[82%] rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-base leading-7 text-white/78"}
              >
                {message.content}
              </div>
            ))}
            {chatSending ? (
              <div className="max-w-[82%] rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-base text-white/58">
                {copy.thinking}
              </div>
            ) : null}
          </div>

          <div className="mt-5 border-t border-white/10 pt-5">
            <div className="mb-3 flex flex-wrap gap-2">
              {suggestionCopy[locale].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => void sendAgentMessage(undefined, item)}
                  className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/58 transition hover:border-brand/40 hover:text-white"
                >
                  {item}
                </button>
              ))}
            </div>
            <form onSubmit={(event) => void sendAgentMessage(event)} className="flex gap-3">
              <input
                type="text"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder={copy.placeholder}
                className="min-h-14 min-w-0 flex-1 rounded-lg border border-brand/45 bg-white/[0.07] px-4 text-base font-medium text-white placeholder-white/35 focus:border-brand focus:outline-none"
              />
              <button type="submit" disabled={!chatInput.trim() || chatSending} className="btn-primary min-h-14 px-5 disabled:opacity-50" aria-label={copy.send}>
                {chatSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </form>
          </div>
        </Panel>

        <aside className="grid content-start gap-4">
          <Panel className="p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand/15 text-brand">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-fg">{copy.contextTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-fg-muted">{copy.contextDesc}</p>
            <div className="mt-4 grid gap-2">
              {copy.contextItems.map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-md border border-hairline bg-surface-2 px-3 py-2 text-sm font-semibold text-fg">
                  <ShieldCheck className="h-4 w-4 text-brand" />
                  {item}
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid gap-3">
            <Link href="/workbench" className="btn-primary justify-center">
              {copy.runCreate} <WandSparkles className="h-4 w-4" />
            </Link>
            <Link href="/brand-memory" className="btn-ghost justify-center">
              {copy.memory} <FileStack className="h-4 w-4" />
            </Link>
            <Link href="/guardrails" className="btn-ghost justify-center">
              {copy.rules} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <Panel className="p-4 opacity-70">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-muted">
              <MessageSquare className="h-4 w-4" />
              {copy.nextTitle}
            </div>
            <div className="mt-3 grid gap-2 text-sm leading-6 text-fg-muted">
              {suggestionCopy[locale].map((item) => <p key={item}>- {item}</p>)}
            </div>
          </Panel>
        </aside>
      </section>
    </motion.div>
  );
}
