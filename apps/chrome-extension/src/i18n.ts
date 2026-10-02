import { useSyncExternalStore } from "react";
export type UiLocale = "zh" | "en";
const listeners = new Set<() => void>();
export let uiLocale: UiLocale = typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
export let isChinese = uiLocale === "zh";

const strings = {
  en: {
    productLine: "PAGE → NATIVE POST",
    signedIn: "Signed in",
    source: "SOURCE",
    selection: "Selected text",
    page: "Page text",
    workflowSource: "Source",
    workflowShape: "Shape",
    workflowReady: "Ready",
    localReady: "Extracted locally · nothing sent",
    sentOnRequest: "Sent only when you requested it",
    whatSent: "What is sent?",
    recommended: "Recommended",
    words: "words",
    characters: "characters",
    loading: "Reading this page…",
    choose: "Choose an output",
    description: "Choose a platform for this content.",
    xTone: "Sharp, concise, timely",
    linkedinTone: "Credible, professional",
    xiaohongshuTone: "Useful, discoverable",
    redditTone: "Human, discussion-led",
    generate: "Generate",
    generating: "Writing your post…",
    generatingAll: "Writing all 4 posts…",
    generatingHint: "A single request is in progress. Closing and reopening the panel will not charge it twice.",
    signinContinue: "Sign in to continue",
    singlePrice: "1 platform · 3 Credits",
    freeUsed: "Free result used · no automatic charge",
    privacyTitle: "Before Finfold sends this page",
    privacyBody: "When you press Continue, this page's URL, title, site name, description, language, and selected or visible text will be sent to Finfold and its disclosed AI processor. Images, form values, cookies, and browsing history are not sent.",
    privacyIncluded: "URL, page title and site metadata",
    privacyText: "Your selected text or cleaned page text",
    privacyExcluded: "Never included: images, forms, cookies or browsing history",
    privacyConfirm: "Continue & generate",
    privacyDone: "Got it",
    privacyCancel: "Not now",
    copy: "Copy full post",
    copied: "Copied",
    save: "Save this result",
    saving: "Saving without regenerating…",
    saved: "Saved to Finfold",
    openKit: "Open saved content",
    all: "Generate all 4 platforms",
    draftReady: "Draft ready",
    completePost: "Complete post",
    resultCharacters: "characters",
    rationale: "View writing rationale",
    signin: "Sign in to Finfold",
    signout: "Sign out",
    websiteLoginNeeded: "Sign in to finfold.app first",
    websiteLoginHint: "Connecting the extension needs a Finfold account. Sign in on the Finfold website, then come back here to connect.",
    openWebsiteLogin: "Open finfold.app to sign in",
    retryConnect: "I'm signed in — connect now",
    free: "One free result on this browser",
    review: "Replies are typed and sent automatically, only after you confirm each one.",
    notes: "WHY THIS WORKS",
    strategy: "ANGLE",
    restricted: "This page cannot be read",
    restrictedHeading: "Open a readable webpage, then try again.",
    permissionEyebrow: "Access needed",
    permissionHeading: "Click the Finfold icon in Chrome's toolbar to grant access to this tab, then read the page again.",
    noContentEyebrow: "Not enough text",
    noContentHeading: "Almost no readable text was found. Select a passage on the page, then read it again.",
    grantAlways: "Always allow on Xiaohongshu, LinkedIn & X",
    retry: "Read page again",
    credits: "credits left"
  },
  zh: {
    productLine: "网页 → 平台原生内容",
    signedIn: "已登录",
    source: "当前素材",
    selection: "已选文字",
    page: "网页正文",
    workflowSource: "素材",
    workflowShape: "适配",
    workflowReady: "成稿",
    localReady: "已在本地提取 · 尚未发送",
    sentOnRequest: "仅在你主动生成时发送",
    whatSent: "会发送什么？",
    recommended: "推荐",
    words: "词",
    characters: "字",
    loading: "正在读取当前网页…",
    choose: "选择输出平台",
    description: "为当前内容选择一个平台",
    xTone: "短促、有观点、及时",
    linkedinTone: "可信、专业、有洞察",
    xiaohongshuTone: "实用、好读、可发现",
    redditTone: "真实、具体、能讨论",
    generate: "生成",
    generating: "正在写你的帖子…",
    generatingAll: "正在生成 4 个平台内容…",
    generatingHint: "当前只有一个请求在处理；关闭再打开侧边栏也不会重复扣费。",
    signinContinue: "登录后继续",
    singlePrice: "单平台 · 3 Credits",
    freeUsed: "免费结果已使用 · 不会自动扣费",
    privacyTitle: "发送网页前，请确认",
    privacyBody: "点击继续后，当前页 URL、标题、站点名、描述、语言，以及你选中或页面可见的文字，会发送给 Finfold 和已披露的 AI 处理商。不会发送图片、表单内容、Cookie 或浏览记录。",
    privacyIncluded: "当前 URL、网页标题与站点信息",
    privacyText: "你选中的文字或清洗后的网页正文",
    privacyExcluded: "始终排除：图片、表单、Cookie 与浏览记录",
    privacyConfirm: "确认并生成",
    privacyDone: "我知道了",
    privacyCancel: "暂不发送",
    copy: "复制完整帖子",
    copied: "已复制",
    save: "保存这个结果",
    saving: "正在保存，不会重新生成…",
    saved: "已保存到 Finfold",
    openKit: "打开已保存内容",
    all: "生成全部 4 个平台",
    draftReady: "内容已就绪",
    completePost: "完整帖子",
    resultCharacters: "字符",
    rationale: "查看写作依据",
    signin: "登录 Finfold",
    signout: "退出登录",
    websiteLoginNeeded: "请先在浏览器登录 Finfold 官网",
    websiteLoginHint: "连接扩展需要 Finfold 账号。先登录 finfold.app，完成后回到这里重新连接。",
    openWebsiteLogin: "打开 Finfold 登录页",
    retryConnect: "我已登录，重新连接",
    free: "本浏览器可免费生成 1 个完整结果",
    review: "每条回复经你确认后，由 Finfold 自动填写并发送。",
    notes: "为什么这样写",
    strategy: "内容角度",
    restricted: "无法读取这个页面",
    restrictedHeading: "请打开一篇可读取的网页，再试一次。",
    permissionEyebrow: "需要读取权限",
    permissionHeading: "点击 Chrome 工具栏上的 Finfold 图标，授权读取当前标签页，然后重新读取。",
    noContentEyebrow: "没有读到足够文字",
    noContentHeading: "这个页面几乎没有可读文字。先在页面里选中一段文字，再重新读取。",
    grantAlways: "始终允许读取小红书 / LinkedIn / X",
    retry: "重新读取",
    credits: "Credits 剩余"
  }
} as const;

export let t = isChinese ? strings.zh : strings.en;
export function applyUiLocale(locale: UiLocale) {
  uiLocale = locale;
  isChinese = locale === "zh";
  t = isChinese ? strings.zh : strings.en;
  if (typeof document !== "undefined") document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  listeners.forEach((notify) => notify());
}
export async function initializeUiLocale() {
  const stored = await chrome.storage.local.get("finfoldUiLocale");
  applyUiLocale(stored.finfoldUiLocale === "zh" || stored.finfoldUiLocale === "en" ? stored.finfoldUiLocale : uiLocale);
}
export async function setUiLocale(locale: UiLocale) {
  // Switching updates subscribed components without remounting the draft editor.
  await chrome.storage.local.set({ finfoldUiLocale: locale });
  applyUiLocale(locale);
}
export function useUiLocale() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => uiLocale, () => uiLocale);
}
