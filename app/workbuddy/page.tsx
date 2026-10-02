import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, WandSparkles } from "@/components/ui/icons";
import { brand } from "@/lib/brand";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { MarketingLandingTracker } from "@/components/marketing/MarketingLandingTracker";

export const metadata: Metadata = {
  title: `为我的业务做一个 — ${brand.name} 获客搭子`,
  description:
    "把你的产品介绍变成客户愿意用、愿意转发的互动自测：来访者做完拿到对应的行动清单，最后自然走到你的咨询入口。"
};

const STEPS = [
  {
    title: "交一段业务介绍",
    body: "你是做什么的、给谁、解决什么问题。不用写提示词，也不用懂设计。"
  },
  {
    title: "拿到一个能用的成品",
    body: "五道题、带你的品牌、来访者做完得到一份对应的行动清单。每一题你都能改，改完你点头才发布。"
  },
  {
    title: "发给你想帮到的人",
    body: "链接发到客户群里、挂在公众号菜单里都行。有人打开、有人做完、有人点了你的咨询入口，你都能看到。"
  }
];

export default function WorkBuddyLandingPage() {
  return (
    <main className="min-h-screen bg-bg">
      <MarketingLandingTracker contentType="other" contentSlug="workbuddy" locale="zh" />

      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg">
            <FishLogo variant="app-icon" className="h-9 w-9 object-cover" />
          </span>
          <span className="leading-none">
            <span className="block text-base font-semibold text-fg">{brand.name}</span>
            <span className="brand-cn mt-0.5 block text-[10px] text-fg-muted">{brand.chineseName}</span>
          </span>
        </Link>
      </header>

      <div className="mx-auto max-w-3xl px-5 pb-20">
        <section className="panel p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">获客搭子</p>
          <h1 className="mt-2 text-2xl font-semibold leading-snug text-fg sm:text-3xl">
            刚才那个小工具，可以为你的业务做一个
          </h1>
          <p className="mt-4 text-sm leading-7 text-fg-muted">
            你刚做完的自测，是某位经营者用 {brand.name} 做的：他的品牌、他的题目、他的咨询入口。
            把你的业务介绍交过来，你也可以有一个——客户做完拿到真正有用的建议，顺手就走到你的门口。
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/signup?utm_source=workbuddy&utm_medium=landing"
              className="btn-primary focus-ring inline-flex items-center justify-center gap-2 px-5 py-3 text-sm"
            >
              为我的业务做一个 <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/operations/lead-tools"
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-hairline px-5 py-3 text-sm text-fg-muted hover:text-fg"
            >
              我已经有账号
            </Link>
          </div>
          <p className="mt-3 text-[11px] text-fg-muted">
            注册免费送 50 AI 点数，第一个工具的生成费用在内。你的来访者不需要注册任何东西。
          </p>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="panel p-5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-action/10 text-xs font-bold text-action">
                {index + 1}
              </span>
              <h2 className="mt-3 text-sm font-semibold text-fg">{step.title}</h2>
              <p className="mt-1.5 text-xs leading-5 text-fg-muted">{step.body}</p>
            </div>
          ))}
        </section>

        <section className="panel-inset mt-6 p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <WandSparkles className="h-4 w-4 text-fg-muted" /> 关于信任的三件事
          </h2>
          <ul className="mt-3 space-y-2.5">
            {[
              "来访者匿名作答，不注册、不留电话、不被记录个人答案——页面会明确告诉他们这一点。",
              "咨询入口是你自己的预约页或联系方式。先帮经营者留住客户，而不是替别人抢客户。",
              "打开、完成、点击入口只有聚合数字。有客户真的来找你，你自己回来记一笔成交。"
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-sm leading-6 text-fg-muted">
                <Check className="mt-1 h-4 w-4 shrink-0 text-positive" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 flex flex-col items-center gap-3 text-center">
          <BarChart3 className="h-5 w-5 text-fg-muted" />
          <p className="max-w-md text-sm leading-6 text-fg-muted">
            已经在发内容、却总差「下一步」？这个工具就是为这一步做的。
          </p>
          <Link
            href="/signup?utm_source=workbuddy&utm_medium=footer"
            className="btn-primary focus-ring inline-flex items-center gap-2 px-5 py-3 text-sm"
          >
            开始做我的第一个 <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </main>
  );
}
