# Finfold for Chrome — Store listing source

## Single purpose

Help users create reviewable social drafts in Chrome: posts from chosen pages, and — in the private pilot — one-tap auto-replies to comments on the user's own Xiaohongshu or LinkedIn posts, sent only after the user confirms each reply.

## English listing

**Name:** Finfold — Social Drafts

**Short description:** Turn the page you choose into a native X, LinkedIn, Reddit, or RED post in Chrome's side panel.

**Detailed description:**

Finfold turns one webpage or selected passage into a complete, platform-native social draft.

Open Finfold on the page you want to use, choose X, LinkedIn, RED/Xiaohongshu, or Reddit, review exactly what will be sent, then generate. Your first anonymous result is complete and copyable. Sign in only if you want to save it or generate the complete four-platform pack with Finfold Credits.

Finfold reads only the page you actively choose. It does not monitor browsing in the background, read form values or cookies, or send anything without your action. Reply drafts are typed and sent on the platform only after you confirm each one; a one-off screenshot is sent for visual locating only when the reply box cannot be found automatically, and it is discarded after that single use.

Paid actions: signed-in single-platform generation costs 3 Finfold Credits; a four-platform pack costs 24 Credits. The free anonymous result is usable without payment.

Support: https://www.finfold.app/extension/support
Privacy: https://www.finfold.app/privacy

## 中文商店描述

**名称：** Finfold — 社交创作助手

**简短描述：** 把你主动选择的网页，转成 X、LinkedIn、小红书或 Reddit 原生帖子，在 Chrome 侧边栏完整交付。

**详细描述：**

Finfold 把一个网页或你选中的段落，转成可完整复制的平台原生帖子。

在目标网页打开 Finfold，选择 X、LinkedIn、小红书或 Reddit，确认将要发送的数据，然后生成。匿名首个结果完整可用；只有当你想保存结果或用 Finfold Credits 生成四平台内容包时，才需要登录。

Finfold 只读取你主动选择的当前页面。它不会后台监控浏览行为，不读取表单值或 Cookie，也不会在你没有操作的情况下发送任何内容。回复草稿在你逐条确认后，才会由扩展自动填写并代为发送；只有自动定位回复框失败时，才会发送一次当前页面截图用于视觉定位，用完即弃。

付费动作：登录后单平台生成消耗 3 Credits；四平台完整内容包消耗 24 Credits。匿名首个结果无需付费即可使用。

支持：https://www.finfold.app/extension/support
隐私：https://www.finfold.app/privacy

## Permission justifications

| Permission | Exact use |
| --- | --- |
| `activeTab` | Temporarily read the page the user opens Finfold on — post text for drafts, and comments on the user's own Xiaohongshu/LinkedIn post in the reply pilot; no persistent host-wide page access. |
| `scripting` | Run the packaged, local extraction and reply-automation functions (capture comments, type the confirmed reply, click send) in that user-activated tab. |
| `sidePanel` | Deliver the extension's only primary interface. |
| `contextMenus` | Let the user explicitly choose a passage and target platform. |
| `storage` | Store privacy confirmation and the installation abuse identifier; restore the latest result within the browser session; keep rotating extension tokens in trusted extension contexts. |
| `identity` | Open the Finfold PKCE authorization flow and receive its Chrome redirect. |
| `https://www.finfold.app/*` | Call only the Finfold API, authorization, privacy, and support pages. |

No `<all_urls>`, `tabs`, `history`, `cookies`, `webRequest`, `downloads`, or `clipboardWrite` permission is requested.

## Privacy Practices answers

- Website Content: **Yes** — selected or cleaned visible text, title, metadata, and current URL, only after Generate and disclosure confirmation; in the reply pilot also comments on the user's own post (captured when the panel opens) and, only if auto-locate fails, one one-off screenshot used for visual locating.
- Web History: **Yes** — the current URL chosen for the user-facing generation feature; no background or full-history collection.
- Authentication Information: **Yes** — extension access/refresh tokens; no password or Finfold web cookie.
- User Activity: **Yes** — generation and save operations are processed for service operation, abuse prevention, and cost measurement; the Copy action stays local and is not transmitted; never used for advertising profiles.
- Personally identifiable information: **Account email remains on Finfold's authenticated service; it is not collected from webpages by the extension.**
- Data sale: **No.**
- Advertising or creditworthiness use: **No.**
- Human review: **No**, except explicit support consent, security/abuse investigation, or legal obligation.
- Limited Use disclosure: https://www.finfold.app/privacy

## Category and language

- Category: Productivity
- Primary language: English
- Localized language: Chinese (Simplified)
- Do not list unimplemented automation, prospecting, monitoring, publishing, reply, or comment features.


## Version 1.1 reply draft pilot disclosure

The private pilot adds LinkedIn and RED reply assistance for signed-in, allowlisted users. Opening the panel on the user's own post page captures the visible comments locally through `chrome.scripting`; the user picks one (or pastes text), and the panel shows the reply identity, data disclosure and 3-Credit price before each generation. A result may be a draft or a request for missing facts; both are charged as one generation. The user edits the draft and presses "Confirm & send": the extension then locates that comment's reply box in the page, types the reply and clicks send — strictly user-initiated, one comment at a time. If the reply box cannot be found in the DOM, the panel may send one screenshot of the current page to Finfold's vision model to locate the input and send button (used once, never stored); if that also fails, the reply is copied for manual paste. Nothing is sent without an explicit user action, and Finfold never reports a draft as sent unless the automation completed.

Only generated results are cached server-side for 24-hour retry recovery and deleted on the next cleanup. Source comments are not archived. Editable drafts live in user-scoped Chrome session storage and expire after 24 hours of inactivity; sign-out clears them. No new Chrome permissions are requested. Include this disclosure in the detailed listing and reviewer notes before submitting this version; the pilot is not public availability.

中文补充：小范围试用账号在自己帖子页打开 Finfold 后，扩展会在本地抓取页面可见评论，用户点选一条（或手动粘贴），确认身份与披露说明后生成回复（每次 3 Credits，包括要求补充信息的结果）。点击「确认并发送」后，扩展在页面内定位该评论的回复框，自动输入并点击发送——每一条都由用户手动触发。若 DOM 定位失败，会把一次当前页面截图发给 Finfold 视觉模型识别输入框位置（即用即弃、不存档），仍失败则自动复制回复供手动粘贴。没有任何后台监控或未经用户操作的发送。生成结果在服务器保留 24 小时以支持重试，到期后随定时任务删除；源评论不保存为档案。浏览器会话中的编辑草稿按用户隔离，24 小时未编辑、退出登录或结束浏览器会话后清理。
