"use client";

import Link from "next/link";
import type { LucideIcon } from "@/components/ui/icons";
import { ArrowRight, Bot, Braces, KeyRound, ShieldCheck, Sparkles } from "@/components/ui/icons";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { LocaleToggle } from "@/components/theme/LocaleToggle";
import { useLocale } from "@/hooks/useLocale";
import { brand } from "@/lib/brand";

const endpoint = `${brand.siteUrl}/api/mcp`;

const copy = {
  zh: {
    badge: "面向 Agent",
    connect: "连接你的 Agent",
    hero: "让你的 Agent 写得像你的品牌，也知道该发到哪里。",
    intro: "Finfold 是 Agent 的内容运营层。只需连接一次，Claude、GPT 或你的自建工作流就能读取私有品牌记忆，应用 Finfold 的平台规则，并把待发布的内容包保存回你的工作区。",
    createToken: "创建 MCP Token",
    tools: "查看工具",
    features: [
      ["默认私密", "Agent 获得的是可撤销、受限的 Token。品牌数据始终留在服务端；Finfold 不会暴露你的密码或数据库凭据。"],
      ["不是通用提示词，而是平台规则", "每次生成都会应用 Finfold 的平台语气、限制和避坑项，以及你的禁用表达和合规规则包。"],
      ["内容仍然落在你的工作区", "生成结果会作为内容包保存到 Finfold，使用与应用内创作相同的创作点数和历史记录。"]
    ],
    setupTitle: "几分钟完成接入",
    steps: [
      ["创建 Token", "在 Finfold 打开「AI 助手 → Agent 接入」，创建一个 Token 并立即复制。"],
      ["添加服务器", "在支持 MCP 的客户端或你的 Agent 运行环境中，填入下方远程 MCP 地址。"],
      ["让 Agent 生成内容", "Agent 会先读取你的上下文，再生成并保存一个多平台内容包。"]
    ],
    configTitle: "远程 MCP 配置",
    configHint: "请把 Token 存在客户端的密钥库或环境变量中。不要把它写进公开仓库、提示词或浏览器代码。",
    toolsTitle: "三个专注工具",
    toolDescriptions: [
      "读取已连接工作区的品牌记忆、品牌规则和行业规则包，供 Agent 在策划前理解你的上下文。",
      "返回一个或多个平台的原生写作约束、字符限制和常见误区。",
      "在服务端使用品牌记忆和规则，生成并保存平台原生内容。每次调用按生成的平台数消耗创作点数。"
    ],
    promptLabel: "建议给 Agent 的第一句指令",
    prompt: "“使用 Finfold 读取我的品牌上下文，以及 X 和 LinkedIn 的平台规则。然后把这条产品更新做成一份发布内容包。保留品牌规则，并将结果保存到 Finfold。”"
  },
  en: {
    badge: "FOR AGENTS",
    connect: "Connect your agent",
    hero: "Make your agent sound like your brand — and know where it is publishing.",
    intro: "Finfold is a content operating layer for agents. Connect once and Claude, GPT, or your own workflow can load your private Brand Memory, apply Finfold's channel rules, and save ready-to-publish content kits to your workspace.",
    createToken: "Create an MCP token",
    tools: "See the tools",
    features: [
      ["Private by default", "Your agent receives a revocable, scoped token. Brand data stays server-side; Finfold never exposes your password or database credentials."],
      ["Rules, not generic prompts", "Every generation uses Finfold's platform-specific voice, limits, and anti-patterns — plus your own prohibited phrases and compliance packs."],
      ["Saved where work happens", "Generated outputs are saved as content kits in Finfold, with the same AI Credits allowance and history as work created in the app."]
    ],
    setupTitle: "Connect in a few minutes",
    steps: [
      ["Create a token", "In Finfold, open AI Agent → Agent Access. Create a token and copy it once."],
      ["Add the server", "Use the remote MCP endpoint below in an MCP-capable client or your agent runtime."],
      ["Ask for a campaign", "Your agent can inspect your context first, then generate a saved multi-platform kit."]
    ],
    configTitle: "Remote MCP configuration",
    configHint: "Keep the token in your client's secret store or environment variables. Do not put it in a public repository, prompt, or browser code.",
    toolsTitle: "Three focused tools",
    toolDescriptions: [
      "Reads the connected workspace's Brand Memory, guardrails, and industry packs before planning copy.",
      "Returns native writing constraints, character limits, and common mistakes for one or more platforms.",
      "Generates and saves platform-native posts using server-side Brand Memory and rules. Each call consumes AI Credits based on the number of platforms generated."
    ],
    promptLabel: "A useful first instruction",
    prompt: "“Use Finfold to inspect my brand context and the rules for X and LinkedIn. Then turn this product update into a launch kit. Keep the brand rules intact and save the outputs to Finfold.”"
  }
} as const;

const featureIcons = [ShieldCheck, Braces, Sparkles] as const;
const toolNames = ["finfold_get_brand_context", "finfold_get_platform_rules", "finfold_generate_content"] as const;

export function ForAgentsGuide() {
  const locale = useLocale();
  const c = copy[locale];

  return <div className="flex min-h-screen flex-col bg-bg text-fg">
    <header className="border-b border-hairline bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">
        <Link href="/" className="focus-ring flex min-w-0 items-center gap-2 rounded-md"><FishLogo className="h-7 w-7" /><span className="text-sm font-bold">Finfold</span><span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">{c.badge}</span></Link>
        <div className="flex shrink-0 items-center gap-2"><LocaleToggle /><Link href="/dashboard" className="btn-primary focus-ring px-3 py-2 text-xs">{c.connect} <ArrowRight className="h-3.5 w-3.5" /></Link></div>
      </div>
    </header>
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-16 md:py-24">
      <p className="eyebrow inline-flex items-center gap-2"><Bot className="h-4 w-4 text-brand" />MCP · STREAMABLE HTTP</p>
      <h1 className="mt-5 max-w-4xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">{c.hero}</h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-fg-muted">{c.intro}</p>
      <div className="mt-8 flex flex-wrap gap-3"><Link href="/dashboard" className="btn-primary focus-ring px-5 py-3 text-sm">{c.createToken} <ArrowRight className="h-4 w-4" /></Link><a href="#tools" className="btn-ghost focus-ring px-5 py-3 text-sm">{c.tools}</a></div>

      <section className="mt-16 grid gap-4 md:grid-cols-3">
        {c.features.map(([title, body], index) => <Feature key={title} icon={featureIcons[index]} title={title} body={body} />)}
      </section>

      <section className="mt-20" id="setup"><h2 className="text-2xl font-bold">{c.setupTitle}</h2><div className="mt-6 grid gap-5 md:grid-cols-3">{c.steps.map(([title, body], index) => <Step key={title} n={`0${index + 1}`} title={title} body={body} />)}</div></section>

      <section className="mt-16 rounded-2xl border border-hairline bg-surface p-5 md:p-7"><div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-brand" />{c.configTitle}</div><pre className="mt-4 overflow-x-auto rounded-xl bg-black/35 p-4 text-xs leading-6 text-slate-200"><code>{`{
  "mcpServers": {
    "finfold": {
      "url": "${endpoint}",
      "headers": {
        "Authorization": "Bearer ff_mcp_your_token"
      }
    }
  }
}`}</code></pre><p className="mt-3 text-xs leading-5 text-fg-muted">{c.configHint}</p></section>

      <section className="mt-20" id="tools"><h2 className="text-2xl font-bold">{c.toolsTitle}</h2><div className="mt-6 divide-y divide-hairline rounded-2xl border border-hairline bg-surface">{toolNames.map((name, index) => <Tool key={name} name={name} text={c.toolDescriptions[index]} />)}</div></section>

      <section className="mt-16 rounded-2xl border border-brand/25 bg-brand/10 p-6"><p className="text-sm font-bold text-brand">{c.promptLabel}</p><p className="mt-3 max-w-3xl text-sm leading-7 text-fg">{c.prompt}</p></section>
    </main>
    <SiteFooter />
  </div>;
}

function Feature({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) { return <div className="rounded-2xl border border-hairline bg-surface p-5"><Icon className="h-5 w-5 text-brand" /><h2 className="mt-4 font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-fg-muted">{body}</p></div>; }
function Step({ n, title, body }: { n: string; title: string; body: string }) { return <div className="rounded-2xl border border-hairline p-5"><p className="font-mono text-xs text-brand">{n}</p><h3 className="mt-3 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-fg-muted">{body}</p></div>; }
function Tool({ name, text }: { name: string; text: string }) { return <div className="p-5"><code className="text-sm font-semibold text-brand">{name}</code><p className="mt-2 text-sm leading-6 text-fg-muted">{text}</p></div>; }
