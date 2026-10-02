import Link from "next/link";
import type { ReactNode } from "react";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { MarketingLandingTracker } from "@/components/marketing/MarketingLandingTracker";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { ExtensionDownloadButton } from "@/components/extension/ExtensionDownloadButton";
import {
  Download,
  Eye,
  LayoutTemplate,
  PanelRight,
  Settings,
  ShieldCheck
} from "@/components/ui/icons";
import { brand } from "@/lib/brand";

/**
 * Chrome extension install guide, written the way the person who built it
 * would explain it. The extension ships as a developer-mode unpacked build
 * for now (no Chrome Web Store listing yet), so this page carries the zip,
 * the four-step walkthrough, and a plain-language account of what the
 * extension can and cannot touch. When the store listing goes live, the
 * store-style card at the top swaps its button for a store URL.
 */

const EXTENSION_VERSION = "1.1.7";
const ZIP_HREF = `/downloads/finfold-chrome-extension-v${EXTENSION_VERSION}.zip`;

/** Hand-drawn Chrome mark in pure CSS. Three 120° segments + the blue core
 *  with a white ring, same geometry as the official logo. No position class
 *  baked in — the caller pins it (e.g. `absolute -bottom-1 -right-2`); a
 *  baked-in `relative` would out-cascade it because Tailwind emits
 *  `.relative` after `.absolute`. */
function ChromeLogoMark({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-block aspect-square ${className}`}>
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 60deg, #34A853 0deg 120deg, #FBBC04 120deg 240deg, #EA4335 240deg 360deg)"
        }}
      />
      <span className="absolute left-1/2 top-1/2 h-[54%] w-[54%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      <span className="absolute left-1/2 top-1/2 h-[40%] w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4285F4]" />
    </span>
  );
}

export const metadata = {
  title: "把 Finfold 装进 Chrome · 下载安装指引",
  description:
    "Finfold Chrome 插件下载。在自己帖子页自动抓取评论、确认后自动发送回复；任意网页一键变成 X / LinkedIn / 小红书 / Reddit 原生发布稿。"
};

export default async function ExtensionDownloadPage({
  searchParams
}: {
  searchParams: Promise<{ ui_locale?: string }>;
}) {
  const zh = (await searchParams).ui_locale !== "en";
  const locale = zh ? "zh" : "en";
  const toggleHref = zh ? "/extension/download?ui_locale=en" : "/extension/download?ui_locale=zh";

  const steps: { icon: typeof Download; title: string; body: ReactNode }[] = zh
    ? [
        {
          icon: Download,
          title: "下载并解压",
          body: "点上面的按钮拿到 zip，200 KB，比一张头像图还小。解压到随便哪个之后还找得到的文件夹。"
        },
        {
          icon: Settings,
          title: "打开扩展管理页",
          body: (
            <>
              地址栏输入{" "}
              <code className="rounded border border-hairline bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-brand">
                chrome://extensions
              </code>{" "}
              回车，把右上角的「开发者模式」打开。
            </>
          )
        },
        {
          icon: LayoutTemplate,
          title: "加载文件夹",
          body: "点「加载已解压的扩展程序」，选刚解压出来的文件夹。里面有 manifest.json 的那个就是它。"
        },
        {
          icon: PanelRight,
          title: "固定到工具栏",
          body: "在地址栏旁的拼图图标里找到 Finfold，点旁边的图钉。以后在任何网页点它，侧栏就出来了。"
        }
      ]
    : [
        {
          icon: Download,
          title: "Download and unzip",
          body: "Grab the zip above. 200 KB, smaller than most profile pictures. Unzip it to a folder you can find again."
        },
        {
          icon: Settings,
          title: "Open the extensions page",
          body: (
            <>
              Type{" "}
              <code className="rounded border border-hairline bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-brand">
                chrome://extensions
              </code>{" "}
              in the address bar, hit enter, and flip on Developer mode at the top right.
            </>
          )
        },
        {
          icon: LayoutTemplate,
          title: "Load the folder",
          body: "Click Load unpacked and pick the folder you just unzipped. The one with manifest.json inside."
        },
        {
          icon: PanelRight,
          title: "Pin it to the toolbar",
          body: "Find Finfold under the puzzle icon next to the address bar and click its pin. One click opens the side panel on any page."
        }
      ];

  const firstRun = zh
    ? [
        "第一次用，在侧栏里登录 Finfold 账号。新账号自带免费点数，第一篇帖子不花钱。",
        "之后写帖子是单平台 3 个 Credits，四个平台打包 24 个。",
        "回复评论已开放公测：登录后就能在小红书、LinkedIn 或 X 自己的帖子页抓取评论、生成回复，每条 3 个 Credits，每天最多 30 条。"
      ]
    : [
        "First time out, sign in to Finfold from the side panel. New accounts come with free credits, so the first post costs nothing.",
        "After that it's 3 Credits per platform and 24 for the four-platform pack.",
        "Comment replies are now in open beta: sign in and capture comments on your own Xiaohongshu, LinkedIn, or X posts. 3 Credits per reply, up to 30 replies a day."
      ];

  const permissions = zh
    ? [
        {
          icon: Eye,
          title: "只在你喊它的时候看一眼",
          body: "你在侧栏点了生成，或者右键选了 Finfold，它才读当前这个标签页。其余时间它在浏览器里没有任何动作。"
        },
        {
          icon: ShieldCheck,
          title: "没有常驻脚本",
          body: "manifest 里翻不到 content_scripts 这一栏，装完你可以自己查。它不盯你的浏览记录，也不会在后台偷偷跑。"
        },
        {
          icon: PanelRight,
          title: "内容只发给 finfold.app",
          body: "页面内容只用来生成你的草稿，不经过第三方，也不挪作他用。"
        }
      ]
    : [
        {
          icon: Eye,
          title: "Reads a page only when you call it",
          body: "Open the panel or pick Finfold from the right-click menu, and it reads that tab. The rest of the time it sits there doing nothing."
        },
        {
          icon: ShieldCheck,
          title: "No resident scripts",
          body: "You won't find a content_scripts entry in the manifest. Feel free to check. It keeps no eye on your browsing and never runs in the background."
        },
        {
          icon: PanelRight,
          title: "Content goes to finfold.app, period",
          body: "Page content is used to generate your drafts and nothing else. No third parties, no other uses."
        }
      ];

  return (
    <>
      <main className="relative min-h-screen bg-bg text-fg">
        <MarketingLandingTracker contentType="other" locale={locale} />
        <PublicSiteHeader locale={locale} localeHref={toggleHref} />

        <div className="relative overflow-hidden px-5 pb-20 pt-10 sm:pt-14">
          {/* Chrome's four colors as a hairline at the very top of the page */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent_8%,#EA4335,#FBBC04,#34A853,#4285F4,transparent_92%)] opacity-60"
          />
          {/* the studio's warm pool of light behind the hero */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[26rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(var(--brand)/0.09),transparent)]"
          />

          <article className="relative mx-auto max-w-3xl">
            {/* ---------- hero ---------- */}
            <header>
              <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
                Finfold for Chrome · v{EXTENSION_VERSION}
              </p>

              <div className="relative mx-auto mt-8 h-24 w-24">
                <span
                  aria-hidden
                  className="absolute -inset-7 rounded-full bg-[radial-gradient(closest-side,rgb(var(--brand)/0.22),transparent)]"
                />
                <FishLogo variant="app-icon" className="relative h-24 w-24" />
                <ChromeLogoMark className="absolute -bottom-1 -right-2 h-10 w-10 rounded-full ring-[5px] ring-bg" />
              </div>

              <h1 className="font-display mt-7 text-center text-4xl font-semibold tracking-tight sm:text-[2.75rem]">
                {zh ? "把 Finfold 装进 Chrome" : "Put Finfold in Chrome"}
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-7 text-fg-muted">
                {zh
                  ? `现在的 v${EXTENSION_VERSION} 能做两件事。打开自己帖子的页面，侧栏会把评论抓下来，一条条写好回复，你点过确认，它才替你发出去。在别的网页上，选中一段话右键叫出 Finfold，就能改成 X、LinkedIn、小红书或 Reddit 的帖子。`
                  : `Version ${EXTENSION_VERSION} does two things. Open the side panel on your own post and it pulls the comments in, drafts a reply to each, and sends nothing until you click confirm. Anywhere on the web, select a passage, right-click, and Finfold rewrites it as a post for X, LinkedIn, RED, or Reddit.`}
              </p>
            </header>

            {/* ---------- store-style download card ---------- */}
            <div className="panel mt-10 rounded-2xl p-5 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
                <FishLogo variant="app-icon" className="h-14 w-14 shrink-0 rounded-[22%]" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold leading-snug">
                    {zh ? "Finfold — 社交创作助手" : "Finfold — Social Drafts"}
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] text-fg-muted">
                    finfold.app · v{EXTENSION_VERSION} · 200 KB · Manifest V3
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <span className="tag tag-brand !text-[11px]">{zh ? "免费" : "Free"}</span>
                    <span className="tag tag-neutral !text-[11px]">Chrome 114+</span>
                    <span className="tag tag-neutral !text-[11px]">
                      {zh ? "商店上架准备中" : "Store listing in the works"}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                  <ExtensionDownloadButton
                    href={ZIP_HREF}
                    version={EXTENSION_VERSION}
                    locale={locale}
                    label={zh ? `下载安装包` : `Download the zip`}
                    className="btn-primary h-11 justify-center px-6 text-sm"
                  />
                  <p className="text-center font-mono text-[10.5px] text-fg-muted sm:text-right">
                    {zh ? "安装不花钱 · 首次生成也免费" : "Free to install · first generation free"}
                  </p>
                </div>
              </div>
              <p className="mt-4 border-t border-hairline pt-3.5 text-xs leading-6 text-fg-muted">
                {zh
                  ? "插件还没上 Chrome 应用商店。现在用 Chrome 自带的开发者模式装，解压、三次点击，两分钟以内，装完的插件和将来的商店版没有区别。哪天这行字变成“去商店安装”，就是上架了。"
                  : "Not on the Chrome Web Store yet. Chrome's own developer mode does the job for now. Unzip, three clicks, under two minutes, and you end up with the same extension the store will ship. When this note turns into a store link, we're live."}
              </p>
            </div>

            {/* ---------- install steps ---------- */}
            <section className="mt-10">
              <h2 className="text-lg font-semibold tracking-tight">
                {zh ? "四步装好" : "Four steps to install"}
              </h2>
              <ol className="mt-4 grid gap-3 sm:grid-cols-2">
                {steps.map((step, i) => (
                  <li key={step.title} className="panel relative overflow-hidden rounded-2xl p-5">
                    <span className="font-display pointer-events-none absolute right-4 top-3 text-4xl font-semibold text-brand/[0.12]">
                      0{i + 1}
                    </span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/12 text-brand">
                      <step.icon className="h-4.5 w-4.5" />
                    </span>
                    <h3 className="mt-3.5 text-sm font-semibold">{step.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-6 text-fg-muted">{step.body}</p>
                  </li>
                ))}
              </ol>
            </section>

            {/* ---------- first run + permissions ---------- */}
            <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-start">
              <section className="panel rounded-2xl p-5 sm:p-6">
                <h2 className="text-lg font-semibold tracking-tight">
                  {zh ? "装好之后" : "After you install"}
                </h2>
                <ul className="mt-3.5 space-y-3 text-sm leading-6 text-fg-muted">
                  {firstRun.map((line) => (
                    <li key={line.slice(0, 12)} className="flex items-start gap-2.5">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      {line}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold tracking-tight">
                  {zh ? "它什么时候读你的页面" : "When it reads your pages"}
                </h2>
                <ul className="mt-4 space-y-3">
                  {permissions.map((row) => (
                    <li key={row.title} className="flex items-start gap-3.5 rounded-xl border border-hairline bg-surface/40 p-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-positive/12 text-positive">
                        <row.icon className="h-4.5 w-4.5" />
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold">{row.title}</h3>
                        <p className="mt-1 text-[13px] leading-6 text-fg-muted">{row.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

          <footer className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-6 text-sm">
            <span className="text-fg-muted">
              {zh ? "装的时候卡住了？" : "Stuck on a step?"}{" "}
              <Link href="/extension/support" className="text-brand underline underline-offset-4">
                {zh ? "看看支持页" : "Check the support page"}
              </Link>
            </span>
            <Link href="/privacy" className="text-fg-muted underline underline-offset-4">
              {zh ? "隐私政策" : "Privacy"}
            </Link>
            <Link href="/terms" className="text-fg-muted underline underline-offset-4">
              {zh ? "服务条款" : "Terms"}
            </Link>
            <a href={`mailto:${brand.legal.contactEmail}`} className="text-fg-muted underline underline-offset-4">
              {brand.legal.contactEmail}
            </a>
          </footer>
          </article>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
