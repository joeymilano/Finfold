export type Locale = "zh" | "en";

export const localeNames: Record<Locale, string> = {
  zh: "中文",
  en: "English"
};

export const dashboardCopy = {
  zh: {
    product: "Finfold",
    englishProduct: "Finfold",
    subtitle: "把一个想法转化成适配不同平台算法、语气和转化目标的内容资产。",
    workbench: "内容增长操作系统",
    osKicker: "Cross-platform Content OS",
    osHeadline: "跨平台内容增长操作系统",
    osSubtitle: "我们帮助创作者、独立开发者和小型品牌，把一个想法自动转化成适配不同平台算法、语气和转化目标的内容资产，并持续学习什么内容能带来流量、线索和收入。",
    positioningOneLine: "不是 AI 文案改写工具，而是小团队的 AI content marketer。",
    readyTitle: "生产区已就绪",
    readyDescription: "完成资产包后，可以继续复制、导出、保存历史，并把发布后的表现数据回流到下一轮迭代。",
    freeLimit: "免费：5 个内容包/月",
    generate: "生成增长资产包",
    openLatest: "打开最新内容包",
    language: "语言版本",
    inputStep: "产品资产",
    strategyStep: "目标与平台",
    outputStep: "内容输出",
    account: "账号",
    trialAccount: "试用用户",
    login: "登录",
    credits: "额度",
    ideaTitle: "产品资产 / 卖点 / 发布素材",
    ideaHint: "粘贴产品介绍、launch idea、文章草稿、创始人动态或咨询观点。尽量写清楚受众、价值、证明和希望用户做什么。",
    mediaTitle: "照片和视频素材",
    mediaUpload: "上传截图、产品图、活动图或视频",
    mediaNote: "素材会作为生成上下文保存；视频素材先用于理解产品和场景。",
    personaTitle: "目标客户",
    goalTitle: "增长目标",
    platformsTitle: "选择平台",
    selected: "已选择",
    outputTitle: "平台内容板",
    emptyTitle: "平台资产包会出现在这里",
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
    trialReady: "展示内容已生成",
    trialDescription: "展示模式已开放全文、复制、导出、历史预览和数据分析，方便完整体验产品能力。",
    body: "正文",
    cta: "CTA",
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
      "输入：产品更新、文章、创始人观点、launch 草稿、视频 transcript",
      "加工：目标、受众、品牌语气、平台机制、社区规则",
      "输出：平台原生 posts、hooks、CTA、标题、短视频脚本、分发 notes",
      "学习：记录复制、导出、平台表现和收入线索，持续优化下一次内容"
    ],
    moatTitle: "壁垒不是 prompt，是工作流和数据",
    moatItems: ["平台模板库", "行业 playbook", "品牌语气记忆", "历史内容资产库", "高转化内容结构", "多平台表现数据"],
    revenueTitle: "赚钱路径",
    revenueItems: [
      { name: "Creator", price: "$9-19/月", detail: "个人品牌、独立开发者，生成增长资产包和发布 playbook。" },
      { name: "Pro", price: "$29-99/月", detail: "多项目、品牌记忆、多语言、内容日历和实验记录。" },
      { name: "Team / Agency", price: "$199+/月 或 项目制", detail: "团队协作、审批、品牌规范、效果追踪和 done-for-you launch pack。" }
    ],
    readinessTitle: "资产包质检",
    readinessSubtitle: "这些状态直接影响生成质量，比展示抽象付费指标更有用。",
    readinessLabels: ["资产信息量", "平台覆盖", "素材上下文", "输出状态"],
    readinessStates: { ready: "已就绪", improve: "可补充", waiting: "待生成" }
  },
  en: {
    product: "Finfold",
    englishProduct: "Finfold",
    subtitle: "Turn one idea into platform-native content assets aligned with algorithms, voice, and conversion goals.",
    workbench: "Content OS",
    osKicker: "Cross-platform Content OS",
    osHeadline: "Cross-platform Content OS",
    osSubtitle: "We turn one idea into platform-native content assets across social, search, community, and launch channels — and learn what actually drives traffic, leads, and revenue.",
    positioningOneLine: "Not an AI copywriting tool. An AI content marketer for small teams.",
    readyTitle: "Workbench is ready",
    readyDescription: "After generation, you can copy, export, save history, and feed performance data into the next iteration.",
    freeLimit: "Free: 5 kits/month",
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
    mediaTitle: "Photos and video context",
    mediaUpload: "Upload screenshots, product images, event photos, or videos",
    mediaNote: "Media is saved as generation context. Video assets are used to understand the product and scene.",
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
    trialReady: "Showcase kit generated",
    trialDescription: "Showcase mode opens full copy, export, history preview, and analytics so reviewers can inspect the complete workflow.",
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
    revenueItems: [
      { name: "Creator", price: "$9-19/mo", detail: "Personal brands and indie builders generating kits and launch playbooks." },
      { name: "Pro", price: "$29-99/mo", detail: "Multi-project workspaces, brand memory, multilingual calendars, and experiment logs." },
      { name: "Team / Agency", price: "$199+/mo or project", detail: "Collaboration, approval, brand governance, performance tracking, and done-for-you launch packs." }
    ],
    readinessTitle: "Kit readiness",
    readinessSubtitle: "These states affect output quality more than abstract business metrics.",
    readinessLabels: ["Idea depth", "Platform coverage", "Media context", "Output state"],
    readinessStates: { ready: "Ready", improve: "Improve", waiting: "Waiting" }
  }
} as const;

export function nextLocale(locale: Locale): Locale {
  return locale === "zh" ? "en" : "zh";
}
