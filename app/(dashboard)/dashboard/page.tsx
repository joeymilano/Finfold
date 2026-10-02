import type { Metadata } from "next";
import { headers } from "next/headers";
import { AgentAutomationCenter } from "@/components/app-shell/AgentAutomationCenter";
import { detectLocaleFromHeaders } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = detectLocaleFromHeaders(await headers());
  return locale === "en"
    ? {
        title: "Finfold Agent | Finfold",
        description: "Diagnose accounts, run content experiments, create, and review — all from one conversation."
      }
    : {
        title: "Finfold智能体 | Finfold",
        description: "从一个对话完成账号诊断、内容实验、创作与复盘。"
      };
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ intent?: string; prompt?: string }>;
}) {
  const { intent, prompt } = await searchParams;
  return <AgentAutomationCenter
    initialIntent={intent === "research" ? "research" : undefined}
    initialPrompt={typeof prompt === "string" ? prompt.slice(0, 4000) : undefined}
  />;
}
