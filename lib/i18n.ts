import { PRICING_PLAN_ORDER, PRICING_PLANS, formatPlanPrice, marketForLocale } from "@/lib/pricing";

export type Locale = "zh" | "en";

function pricingRevenueItems(locale: Locale) {
  const market = marketForLocale(locale);
  return PRICING_PLAN_ORDER.map((key) => {
    const plan = PRICING_PLANS[key];
    const copy = plan.copy[locale];
    return {
      name: copy.name,
      price: `${formatPlanPrice(plan, market)}/${locale === "en" ? "month" : "月"}`,
      detail: `${copy.allowance}${locale === "en" ? ". " : "。"}${copy.description}`
    };
  });
}

export const localeNames: Record<Locale, string> = {
  zh: "中文",
  en: "English"
};

/**
 * Finfold intentionally keeps the product chrome bilingual. Chinese browser
 * locales use the Chinese UI; every other locale gets the English UI as the
 * most broadly readable fallback. This does not constrain the language of AI
 * replies or generated content.
 */
export function localeFromLanguageTag(language: string | null | undefined): Locale {
  const normalized = language?.trim().toLowerCase() ?? "";
  return normalized === "zh" || normalized.startsWith("zh-") ? "zh" : "en";
}

export const dashboardCopy = {
  zh: {
    product: "Finfold",
    englishProduct: "Finfold",
    subtitle: "把一个想法，变成各平台能直接发的内容",
    workbench: "内容创作工作台",
    osKicker: "Finfold AI",
    osHeadline: "跨平台内容增长操作系统",
    osSubtitle: "我们帮助创作者、独立开发者和小型品牌，把一个想法自动转化成适配不同平台算法、语气和转化目标的内容资产，并持续学习什么内容能带来流量、线索和收入",
    positioningOneLine: "不是 AI 文案改写工具，而是小团队的 AI 内容市场专员",
    readyTitle: "生产区已就绪",
    readyDescription: "生成后可以复制、导出、保存历史，还能把发布后的效果记下来，让下一次更准。",
    freeLimit: "免费：每月 50 创作点数",
    generate: "生成各平台内容",
    openLatest: "打开最新内容包",
    language: "语言版本",
    inputStep: "要发的内容",
    strategyStep: "目标与平台",
    outputStep: "内容输出",
    account: "账号",
    trialAccount: "试用用户",
    login: "登录",
    credits: "创作点数",
    ideaTitle: "产品动态 / 卖点 / 发布素材",
    ideaHint: "粘贴产品介绍、发布想法、文章草稿、创始人动态或咨询观点。尽量写清楚受众、价值、证明和希望用户做什么。",
    mediaTitle: "图片素材",
    mediaUpload: "上传截图、产品图或活动图",
    mediaNote: "仅支持 JPEG、PNG、WebP；单张不超过 25MB 和 2000 万像素。AI 会读取图片中可见的内容，让文案与视觉保持一致。",
    personaTitle: "目标客户",
    goalTitle: "你想要什么效果",
    platformsTitle: "选择平台",
    selected: "已选择",
    outputTitle: "平台内容板",
    emptyTitle: "各平台文案会出现在这里",
    emptyBody: "每个平台都会形成标题、正文、CTA、视觉建议、注意事项和平台策略。",
    copy: "复制",
    copied: "已复制",
    copyAll: "复制全部",
    unlockToCopy: "复制内容",
    unlockCopy: "复制全文",
    unlockToExport: "导出内容",
    lockedCtaPreview: "展示模式已开放完整转化动作和链接策略。",
    lockedNotesPreview: "展示模式已开放平台禁忌、发布时间和风控提醒。",
    copiedKit: "已复制整包",
    markdown: "导出 MD",
    designCover: "设计封面",
    trialReady: "试用内容已生成",
    trialDescription: "免费注册后，每月获赠 50 创作点数，可完整生成、复制、导出并复盘内容。",
    body: "正文",
    cta: "转化动作",
    notes: "注意事项",
    strategy: "平台策略",
    whyNowTitle: "为什么现在",
    osPillars: [
      {
        title: "平台碎片化",
        body: "同一个产品更新要变成公众号、小红书、朋友圈、X、LinkedIn、Reddit、Product Hunt、Newsletter 和短视频脚本。小团队没有能力维护这么多套表达。"
      },
      {
        title: "AI 内容同质化",
        body: "AI 让内容生产变便宜，也让普通文案失去差异。真正稀缺的是平台语感、品牌一致性、转化目标和内容实验。"
      },
      {
        title: "发现入口重排",
        body: "用户会在 ChatGPT、搜索、Reddit、小红书、YouTube、X 上发现产品。未来内容不是发帖，而是在训练互联网理解你是谁。"
      }
    ],
    systemTitle: "从单次生成到内容操作系统",
    systemSteps: [
      "输入：产品更新、文章、创始人观点、发布草稿、视频转写",
      "加工：目标、受众、品牌语气、平台机制、社区规则",
      "输出：平台原生帖子、开头钩子、转化动作、标题、短视频脚本、分发备注",
      "学习：记录复制、导出、平台表现和收入线索，持续优化下一次内容"
    ],
    moatTitle: "壁垒不是 prompt，是工作流和数据",
    moatItems: ["平台模板库", "行业打法库", "品牌语气记忆", "历史内容资产库", "高转化内容结构", "多平台表现数据"],
    revenueTitle: "赚钱路径",
    revenueItems: pricingRevenueItems("zh"),
    readinessTitle: "内容质量检查",
    readinessSubtitle: "这些状态直接影响生成质量，比展示抽象付费指标更有用",
    readinessLabels: ["信息量", "平台覆盖", "素材上下文", "输出状态"],
    readinessStates: { ready: "已就绪", improve: "可补充", waiting: "待生成" }
  },
  en: {
    product: "Finfold",
    englishProduct: "Finfold",
    subtitle: "Turn one idea into platform-native content assets aligned with algorithms, voice, and conversion goals",
    workbench: "Finfold",
    osKicker: "Finfold AI",
    osHeadline: "Finfold AI",
    osSubtitle: "We turn one idea into platform-native content assets across social, search, community, and launch channels — and learn what actually drives traffic, leads, and revenue",
    positioningOneLine: "Not an AI copywriting tool — an AI content marketer for small teams",
    readyTitle: "Workbench is ready",
    readyDescription: "After generation, you can copy, export, save history, and feed performance data into the next iteration.",
    freeLimit: "Free: 50 AI Credits/month",
    generate: "Generate kit",
    openLatest: "Open latest kit",
    language: "Language",
    inputStep: "Your idea",
    strategyStep: "Goal and platforms",
    outputStep: "Content outputs",
    account: "Account",
    trialAccount: "Trial user",
    login: "Log in",
    credits: "Credits",
    ideaTitle: "Product / idea / draft",
    ideaHint: "Paste a product intro, launch idea, article draft, founder update, or consulting insight. Add audience, value, proof, and desired action.",
    mediaTitle: "Image context",
    mediaUpload: "Upload screenshots, product images, or event photos",
    mediaNote: "JPEG, PNG, or WebP only; each image must be no more than 25MB and 20 megapixels. Finfold uses what is visibly shown as generation context.",
    personaTitle: "Buyer context",
    goalTitle: "Growth goal",
    platformsTitle: "Select platforms",
    selected: "selected",
    outputTitle: "Platform output board",
    emptyTitle: "Your content kit will appear here",
    emptyBody: "Each platform gets a title, body, CTA, caution notes, and strategic rationale.",
    copy: "Copy",
    copied: "Copied",
    copyAll: "Copy all",
    unlockToCopy: "Copy content",
    unlockCopy: "Copy full copy",
    unlockToExport: "Export content",
    lockedCtaPreview: "Showcase mode includes the full conversion action and link strategy.",
    lockedNotesPreview: "Showcase mode includes platform caveats, timing, and risk notes.",
    copiedKit: "Copied kit",
    markdown: "Markdown",
    designCover: "Design cover",
    trialReady: "Trial kit generated",
    trialDescription: "Sign up free to get 50 AI Credits/month — generate, copy, export, and review content across platforms.",
    body: "Body",
    cta: "CTA",
    notes: "Notes",
    strategy: "Strategy",
    whyNowTitle: "Why now",
    osPillars: [
      {
        title: "Platform fragmentation",
        body: "One product update now needs WeChat, Xiaohongshu, X, LinkedIn, Reddit, Product Hunt, newsletters, blogs, and short video scripts. Small teams cannot maintain every language manually."
      },
      {
        title: "AI content sameness",
        body: "AI made content cheap, which makes generic writing less defensible. The scarce layer is platform voice, brand consistency, conversion intent, and experimentation."
      },
      {
        title: "Discovery is shifting",
        body: "Users discover products through ChatGPT, search, Reddit, Xiaohongshu, YouTube, and X. Content is no longer posting. It is training the internet to understand who you are."
      }
    ],
    systemTitle: "From one-off generation to content operations",
    systemSteps: [
      "Input: product update, essay, founder thought, launch draft, video transcript",
      "Processing: goal, audience, brand voice, platform mechanics, community rules",
      "Output: platform-native posts, hooks, CTAs, titles, scripts, distribution notes",
      "Learning: track copy, export, platform performance, and revenue signals to improve the next kit"
    ],
    moatTitle: "The moat is workflow and data, not prompts",
    moatItems: ["Platform template library", "Industry playbooks", "Brand voice memory", "Historical content library", "High-converting structures", "Cross-platform performance data"],
    revenueTitle: "Revenue paths",
    revenueItems: pricingRevenueItems("en"),
    readinessTitle: "Kit readiness",
    readinessSubtitle: "These states affect output quality more than abstract business metrics",
    readinessLabels: ["Idea depth", "Platform coverage", "Media context", "Output state"],
    readinessStates: { ready: "Ready", improve: "Improve", waiting: "Waiting" }
  }
} as const;

export function nextLocale(locale: Locale): Locale {
  return locale === "zh" ? "en" : "zh";
}

/**
 * API 路由错误文案：按请求头判定语言（cookie finfold-locale →
 * Accept-Language → 默认中文），返回对应语言的 message，前端可直接渲染。
 */
export function apiError(h: Headers, zh: string, en: string): string {
  return detectLocaleFromHeaders(h) === "en" ? en : zh;
}

/**
 * 服务端 locale 检测（share 等公开页用）：先读 finfold-locale cookie（客户端
 * applyLocale 写入），再回退 Accept-Language，默认中文。edge runtime 兼容。
 */
export function detectLocaleFromHeaders(h: Headers): Locale {
  const cookieMatch = (h.get?.("cookie") ?? "").match(/finfold-locale=(zh|en)/);
  if (cookieMatch) return cookieMatch[1] as Locale;
  const accept = (h.get?.("accept-language") ?? "").split(",")[0]?.trim();
  return accept ? localeFromLanguageTag(accept) : "zh";
}

/** share 公开页文案（P1-4 i18n）。 */
export const sharePageCopy = {
  zh: {
    tryFree: "免费试用",
    tryYourself: "无需登录即可浏览完整创作台；真正生成内容时，再登录免费账户。",
    madeWith: "用 Finfold 生成 —— 一条产品更新，自动产出各平台原生内容。",
    nPlatforms: (n: number) => `${n} 个平台`,
    ogPlatforms: (n: number) => `${n} 个平台 · 每个渠道的原生文案`,
    ogFallback: "一条产品更新，每个平台都有原生内容"
  },
  en: {
    tryFree: "Try it free",
    tryYourself: "Preview the full workbench without an account. Sign in with a free account only when you are ready to generate.",
    madeWith: "Made with Finfold — one product update, native posts for every platform.",
    nPlatforms: (n: number) => `${n} platforms`,
    ogPlatforms: (n: number) => `${n} platforms · native posts for every channel`,
    ogFallback: "One product update, native posts for every platform"
  }
};
