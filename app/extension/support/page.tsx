import Link from "next/link";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { MarketingLandingTracker } from "@/components/marketing/MarketingLandingTracker";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { brand } from "@/lib/brand";

export const metadata = {
  title: "Finfold for Chrome Support",
  description: "Support, privacy, and troubleshooting for the Finfold Chrome extension."
};

export default async function ExtensionSupportPage({ searchParams }: { searchParams: Promise<{ ui_locale?: string }> }) {
  const zh = (await searchParams).ui_locale !== "en";
  const locale = zh ? "zh" : "en";
  const toggleHref = zh ? "/extension/support?ui_locale=en" : "/extension/support";
  return (
    <>
      <main className="relative min-h-screen bg-bg text-fg">
        <MarketingLandingTracker contentType="other" locale={locale} />
        <PublicSiteHeader locale={locale} localeHref={toggleHref} />
        <div className="px-5 pb-20 pt-10 sm:pt-14">
          <article className="mx-auto max-w-2xl rounded-[28px] border border-hairline bg-surface p-7 shadow-panel sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em]">Finfold for Chrome</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em]">{zh ? "帮助与支持" : "Support"}</h1>
            <div className="mt-8 space-y-7 text-sm leading-7 text-fg-muted">
              <section><h2 className="font-semibold text-fg">{zh ? "提示需要读取权限" : "It asks for page access"}</h2><p>{zh ? "Chrome 从 137 版起不再在安装时自动授予网站访问权限。看到「需要读取权限」时，点击侧栏里的「始终允许读取小红书 / LinkedIn / X」一次即可长期生效；也可以在目标标签页点击一次工具栏的 Finfold 图标，授权读取当前页。" : "Since Chrome 137, extensions do not receive site access automatically at install. When the panel says access is needed, click “Always allow on Xiaohongshu, LinkedIn & X” once in the side panel, or click the Finfold toolbar icon once on the tab you want to read."}</p></section>
              <section><h2 className="font-semibold text-fg">{zh ? "无法读取页面" : "A page cannot be read"}</h2><p>{zh ? "Chrome 不允许扩展读取浏览器内部页面、应用商店及部分 PDF 页面。请打开普通网页，选择需要的段落，再使用 Finfold。" : "Chrome blocks extensions on chrome:// pages, the Chrome Web Store, and some protected PDF viewers. Open a regular webpage, select the passage you want, and invoke Finfold again."}</p></section>
              <section><h2 className="font-semibold text-fg">{zh ? "登录与 Credits" : "Sign-in and Credits"}</h2><p>{zh ? "商店版 1.1.5 需要登录 Finfold，并使用可用 Credits：单平台 3 Credits，四平台内容包 24 Credits。安装、本地读取和复制不消耗 Credits。本版不提供匿名生成。免费账户若没有可用的已验证免费模型池，生成会停止，不会自动切换到付费模型。" : "Store version 1.1.5 requires Finfold sign-in and eligible Credits: 3 Credits for one platform or 24 Credits for a four-platform pack. Installation, local extraction and copying do not consume Credits. Anonymous generation is not offered. Free accounts stop when a verified free model pool is unavailable, without falling back to paid models."}</p></section>
              <section><h2 className="font-semibold text-fg">{zh ? "发布与回复" : "Publishing and replies"}</h2><p>{zh ? "当前版本支持生成和复制草稿。每条内容都由你审核并发送，不会后台自动发布、评论或监控页面。" : "V1 creates and copies drafts only. It does not publish, reply, comment, or monitor pages in the background. You remain in control of every message."}</p></section>
              <section><h2 className="font-semibold text-fg">{zh ? "回复草稿已在独立安装版开放公测" : "Reply drafts are in open beta (self-installed build)"}</h2><p>{zh ? "商店版 1.1.5 不包含回复草稿或自动评论。从本站安装的版本登录后即可使用：它会抓取你自己帖子下的评论并生成回复，每条 3 Credits、每天上限 30 条，每一条都由你确认后，才自动填写并发送。" : "Store version 1.1.5 does not include reply drafts or automatic comments. The build installed from this site offers them to every signed-in user: it captures comments on your own posts and drafts replies at 3 Credits each (30 replies per day); each one is typed and sent automatically only after you confirm it."}</p></section>
              <section><h2 className="font-semibold text-fg">{zh ? "联系我们" : "Contact"}</h2><p>{zh ? "请发送邮件至 " : "Email "}<a className="underline underline-offset-4" href={`mailto:${brand.legal.contactEmail}`}>{brand.legal.contactEmail}</a>{zh ? "，并附上扩展版本及显示的错误。请勿发送密码、Cookie 或私密页面内容。" : " and include the extension version plus the error shown in the side panel. Do not email passwords, cookies, or private page content."}</p></section>
            </div>
            <div className="mt-9 flex gap-5 text-sm"><Link className="underline underline-offset-4" href="/privacy">{zh ? "隐私政策" : "Privacy"}</Link><Link className="underline underline-offset-4" href="/terms">{zh ? "服务条款" : "Terms"}</Link></div>
          </article>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
