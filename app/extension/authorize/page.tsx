import Link from "next/link";
import { oauthAuthorizeSchema } from "@/lib/extension/oauth";
import { extensionAuthEnabled } from "@/lib/extension/usage";
import { getCurrentUserId } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ExtensionAuthorizePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const zh = scalar(params.ui_locale) === "zh";
  const parsed = oauthAuthorizeSchema.safeParse({
    redirectUri: scalar(params.redirect_uri),
    codeChallenge: scalar(params.code_challenge),
    state: scalar(params.state)
  });
  if (!extensionAuthEnabled() || !parsed.success) {
    return <AuthorizationMessage title={zh ? "暂时无法连接" : "This connection is unavailable"} body={zh ? "请返回 Finfold 扩展，稍后重试。" : "Return to the Finfold extension and try again later."} />;
  }

  try {
    await getCurrentUserId();
  } catch {
    const next = `/extension/authorize?${new URLSearchParams({
      redirect_uri: parsed.data.redirectUri,
      code_challenge: parsed.data.codeChallenge,
      state: parsed.data.state,
      ui_locale: zh ? "zh" : "en"
    }).toString()}`;
    return <SignInFirstMessage next={next} zh={zh} />;
  }

  return (
    <main className="min-h-screen bg-bg px-5 py-10 text-fg">
      <section className="mx-auto max-w-lg overflow-hidden rounded-[28px] border border-hairline bg-surface shadow-[0_28px_90px_rgba(28,30,24,0.12)]">
        <div className="border-b border-hairline bg-action-soft px-7 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em]">Finfold for Chrome</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">{zh ? "连接你的工作空间" : "Connect your workspace"}</h1>
        </div>
        <div className="space-y-6 px-7 py-7">
          <p className="text-sm leading-6 text-fg-muted">
            {zh ? "连接后，你可以生成适合各个平台的内容，也可以一键自动回复自己帖子下的评论。" : "Connect to create platform-ready content and to auto-reply to comments on your own posts after you confirm each one."}
          </p>
          <ul className="space-y-3 text-sm leading-6">
            <li>{zh ? "点击生成后，才会发送你选定的素材；回复模式会读取你在小红书、LinkedIn 或 X 帖子页上选定的评论与原帖文字。" : "Content is sent only after you press Generate. Reply mode reads the comment and post text you choose on a Xiaohongshu, LinkedIn, or X post page."}</li>
            <li>{zh ? "回复草稿经你确认后，由扩展自动填写到原平台并发送；定位失败时自动复制，由你手动粘贴。" : "After you confirm a reply, the extension types and sends it on the platform for you; if locating fails, the reply is copied for you to paste manually."}</li>
            <li>{zh ? "回复框定位失败时，会把当前页面截图发给 Finfold 视觉模型识别位置，即用即弃、不存档。" : "When the reply box cannot be found, a one-off screenshot of the current page is sent to Finfold's vision model and discarded after use."}</li>
            <li>{zh ? "扩展不会获取你的登录密码或浏览器 Cookie。" : "Your login password and browser cookies are never shared with the extension."}</li>
            <li>{zh ? "回复试用每次生成需要 3 Credits。" : "Each reply pilot generation costs 3 Credits."}</li>
          </ul>
          <form method="post" action="/api/extension/v1/oauth/authorize">
            <input type="hidden" name="redirectUri" value={parsed.data.redirectUri} />
            <input type="hidden" name="codeChallenge" value={parsed.data.codeChallenge} />
            <input type="hidden" name="state" value={parsed.data.state} />
            <button className="w-full rounded-full bg-action px-5 py-3.5 text-sm font-semibold text-on-action transition hover:bg-action-strong">
              {zh ? "连接 Finfold" : "Connect Finfold"}
            </button>
          </form>
          <Link href="/privacy" className="block text-center text-xs text-fg-muted underline underline-offset-4">
            {zh ? "隐私政策" : "Privacy policy"}
          </Link>
        </div>
      </section>
    </main>
  );
}

function scalar(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function AuthorizationMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-fg">
      <section className="max-w-md rounded-[28px] border border-hairline bg-surface p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-fg-muted">{body}</p>
      </section>
    </main>
  );
}

function SignInFirstMessage({ next, zh }: { next: string; zh: boolean }) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-fg">
      <section className="max-w-md rounded-[28px] border border-hairline bg-surface p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">{zh ? "先登录 Finfold" : "Sign in to Finfold first"}</h1>
        <p className="mt-3 text-sm leading-6 text-fg-muted">
          {zh
            ? "连接扩展需要 Finfold 账号。登录后你会回到这个连接页面，继续点击连接即可。"
            : "Connecting the extension needs a Finfold account. After signing in you will return to this page to finish connecting."}
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="mt-6 block w-full rounded-full bg-action px-5 py-3.5 text-sm font-semibold text-on-action transition hover:bg-action-strong"
        >
          {zh ? "登录 Finfold" : "Sign in to Finfold"}
        </Link>
      </section>
    </main>
  );
}
