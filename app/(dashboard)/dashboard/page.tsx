import type { Metadata } from "next";
import { AgentAutomationCenter } from "@/components/app-shell/AgentAutomationCenter";

export const metadata: Metadata = {
  title: "Finfold Agent | Finfold",
  description: "从一个对话完成账号诊断、内容实验、创作与复盘。"
};

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
