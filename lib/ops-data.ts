import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileStack,
  Gauge,
  Globe2,
  Library,
  MessageSquareText,
  PlaySquare,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  type LucideIcon
} from "lucide-react";

export type OpsPlatform = {
  id: string;
  name: string;
  region: "CN" | "Global";
  icon: LucideIcon;
  status: "healthy" | "attention" | "gap";
  coverage: number;
  readyAssets: number;
  pendingReview: number;
  scheduled: number;
  sevenDayReach: string;
  conversionSignal: string;
  conversionSignalEn: string;
  recommendedAction: string;
  recommendedActionEn: string;
  nextTask: string;
  nextTaskEn: string;
  href: string;
};

export type ContentPackage = {
  id: string;
  product: string;
  owner: string;
  status: "待审核" | "已批准" | "排期中" | "需补齐";
  platforms: string[];
  updatedAt: string;
  impact: string;
  impactEn: string;
};

export type ExecutiveMetric = {
  label: string;
  labelEn: string;
  value: string;
  detail: string;
  detailEn: string;
  tone: "neutral" | "good" | "warn" | "risk";
  delta?: string;
  trend?: number[];
};

export const executiveMetrics: ExecutiveMetric[] = [
  { label: "平台覆盖数", labelEn: "Platforms", value: "7", detail: "3 个渠道需要补齐资产", detailEn: "3 channels need assets", tone: "neutral", delta: "+2", trend: [4, 4, 5, 5, 6, 6, 7] },
  { label: "已批准资产", labelEn: "Approved", value: "42", detail: "可直接进入发布排期", detailEn: "Ready to schedule", tone: "good", delta: "+12%", trend: [22, 26, 29, 31, 36, 39, 42] },
  { label: "待审核资产", labelEn: "In Review", value: "11", detail: "TikTok 脚本优先处理", detailEn: "TikTok scripts are priority", tone: "warn", delta: "-3", trend: [18, 16, 15, 14, 13, 12, 11] },
  { label: "近 7 天计划发布", labelEn: "Planned (7d)", value: "18", detail: "覆盖 5 个平台窗口", detailEn: "Across 5 platforms", tone: "neutral", delta: "+5", trend: [9, 11, 12, 13, 15, 16, 18] },
  { label: "内容缺口", labelEn: "Content Gaps", value: "6", detail: "小红书、B站、Reddit 最高优先级", detailEn: "Xiaohongshu, Bilibili, Reddit are top priority", tone: "risk", delta: "-2", trend: [11, 10, 9, 8, 7, 7, 6] }
];

/** North-star: weekly cross-platform reach (k) — green primary line. */
export const northStarTrend = {
  label: "跨平台总触达",
  labelEn: "Cross-platform Reach",
  unit: "k",
  value: "208.6k",
  delta: "+23.4%",
  caption: "近 8 周自有渠道总触达，绿线为本产品表现、蓝线为同类基准。",
  captionEn: "8-week owned channel reach. Green = this product, Blue = benchmark.",
  labels: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"],
  series: [
    { label: "本产品", labelEn: "This product", tone: "brand" as const, values: [86, 94, 102, 119, 128, 150, 178, 209] },
    { label: "同类基准", labelEn: "Benchmark", tone: "accent" as const, dashed: true, values: [80, 83, 88, 92, 99, 104, 112, 121] }
  ]
};

export const platformOps: OpsPlatform[] = [
  {
    id: "xiaohongshu",
    name: "小红书",
    region: "CN",
    icon: Sparkles,
    status: "gap",
    coverage: 62,
    readyAssets: 5,
    pendingReview: 3,
    scheduled: 2,
    sevenDayReach: "18.4k",
    conversionSignal: "收藏率高于均值 31%",
    conversionSignalEn: "Save rate 31% above avg",
    recommendedAction: "补齐搜索型笔记与封面建议",
    recommendedActionEn: "Add search notes and cover guidance",
    nextTask: "补齐小红书资产",
    nextTaskEn: "Fill Xiaohongshu gap",
    href: "/workbench?platform=xiaohongshu"
  },
  {
    id: "douyin",
    name: "抖音",
    region: "CN",
    icon: PlaySquare,
    status: "attention",
    coverage: 71,
    readyAssets: 7,
    pendingReview: 2,
    scheduled: 3,
    sevenDayReach: "42.8k",
    conversionSignal: "完播率稳定，CTA 偏弱",
    conversionSignalEn: "Watch rate stable, CTA weak",
    recommendedAction: "重写前 3 秒钩子和结尾口播",
    recommendedActionEn: "Rewrite first 3s hook and closing CTA",
    nextTask: "优化短视频脚本",
    nextTaskEn: "Optimize video scripts",
    href: "/workbench?platform=douyin"
  },
  {
    id: "wechat-video",
    name: "视频号",
    region: "CN",
    icon: MessageSquareText,
    status: "healthy",
    coverage: 86,
    readyAssets: 9,
    pendingReview: 1,
    scheduled: 4,
    sevenDayReach: "26.1k",
    conversionSignal: "私域导流表现最好",
    conversionSignalEn: "Best private channel traffic",
    recommendedAction: "复用高互动选题做系列化",
    recommendedActionEn: "Finfold top topics into series",
    nextTask: "查看本周排期",
    nextTaskEn: "View schedule",
    href: "/calendar"
  },
  {
    id: "bilibili",
    name: "B站",
    region: "CN",
    icon: FileStack,
    status: "gap",
    coverage: 48,
    readyAssets: 3,
    pendingReview: 2,
    scheduled: 1,
    sevenDayReach: "9.7k",
    conversionSignal: "深度内容缺口明显",
    conversionSignalEn: "Long-form content gap",
    recommendedAction: "生成 6 分钟讲解脚本和章节标题",
    recommendedActionEn: "Generate 6-min explainer script",
    nextTask: "创建 B站长视频 brief",
    nextTaskEn: "Create Bilibili brief",
    href: "/workbench?platform=bilibili"
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    region: "Global",
    icon: BriefcaseBusiness,
    status: "healthy",
    coverage: 91,
    readyAssets: 10,
    pendingReview: 1,
    scheduled: 4,
    sevenDayReach: "31.5k",
    conversionSignal: "B2B 线索占比 44%",
    conversionSignalEn: "44% B2B lead share",
    recommendedAction: "把产品更新改成 founder narrative",
    recommendedActionEn: "Reframe update as founder narrative",
    nextTask: "审核 LinkedIn 资产",
    nextTaskEn: "Review LinkedIn assets",
    href: "/packages"
  },
  {
    id: "instagram",
    name: "Instagram",
    region: "Global",
    icon: Globe2,
    status: "attention",
    coverage: 67,
    readyAssets: 6,
    pendingReview: 1,
    scheduled: 2,
    sevenDayReach: "22.9k",
    conversionSignal: "轮播保存率高，简介点击低",
    conversionSignalEn: "Carousel saves high, bio clicks low",
    recommendedAction: "补强 carousel 末页 CTA",
    recommendedActionEn: "Strengthen carousel final CTA",
    nextTask: "调整视觉资产包",
    nextTaskEn: "Adjust visual assets",
    href: "/assets"
  },
  {
    id: "tiktok",
    name: "TikTok",
    region: "Global",
    icon: TrendingUp,
    status: "gap",
    coverage: 54,
    readyAssets: 4,
    pendingReview: 2,
    scheduled: 2,
    sevenDayReach: "57.3k",
    conversionSignal: "曝光高，转化路径断点多",
    conversionSignalEn: "High reach, conversion funnel broken",
    recommendedAction: "审核脚本 CTA 与 landing message",
    recommendedActionEn: "Review script CTA & landing message",
    nextTask: "审核 TikTok 视频脚本",
    nextTaskEn: "Review TikTok scripts",
    href: "/workbench?platform=tiktok"
  }
];

export const contentHealth = [
  { label: "品牌一致性", labelEn: "Brand Consistency", value: 88, icon: ShieldCheck },
  { label: "平台原生度", labelEn: "Platform Nativeness", value: 76, icon: Gauge },
  { label: "可发布资产", labelEn: "Ready to Publish", value: 69, icon: CheckCircle2 },
  { label: "复用效率", labelEn: "Finfold Rate", value: 81, icon: BarChart3 }
] as const;

export const reviewQueue = [
  { title: "TikTok 首发脚本", titleEn: "TikTok Launch Script", platform: "TikTok", owner: "Growth", due: "今天 16:00", dueEn: "Today 16:00", risk: "CTA 不清晰", riskEn: "CTA unclear" },
  { title: "小红书搜索笔记组", titleEn: "Xiaohongshu Search Notes", platform: "小红书", owner: "Content", due: "明天 10:00", dueEn: "Tomorrow 10:00", risk: "封面信息密度偏低", riskEn: "Cover density too low" },
  { title: "LinkedIn founder post", titleEn: "LinkedIn founder post", platform: "LinkedIn", owner: "PMM", due: "周三", dueEn: "Wednesday", risk: "案例证据待补", riskEn: "Case study missing" }
] as const;

export const weeklySchedule = [
  { day: "Mon", count: 3, focus: "产品教育", focusEn: "Product Education", platforms: ["LinkedIn", "视频号"] },
  { day: "Tue", count: 2, focus: "搜索种草", focusEn: "Search Seeding", platforms: ["小红书"] },
  { day: "Wed", count: 4, focus: "短视频转化", focusEn: "Short Video Conversion", platforms: ["抖音", "TikTok"] },
  { day: "Thu", count: 3, focus: "深度内容", focusEn: "Long-form Content", platforms: ["B站", "LinkedIn"] },
  { day: "Fri", count: 6, focus: "发布复盘", focusEn: "Publish Review", platforms: ["Instagram", "视频号"] }
] as const;

export const growthOpportunities = [
  { title: "小红书内容缺口", titleEn: "Xiaohongshu Content Gap", detail: "搜索流量增长，但产品对比类笔记不足。", detailEn: "Search traffic growing but product comparison notes lacking.", impact: "+18% 收藏机会", action: "生成对比笔记", actionEn: "Generate comparison notes" },
  { title: "TikTok CTA 断点", titleEn: "TikTok CTA Gap", detail: "视频曝光高，落地页承接语和脚本结尾不一致。", detailEn: "High video reach but landing page message and script ending are misaligned.", impact: "+9% 点击潜力", action: "审核脚本", actionEn: "Review scripts" },
  { title: "B站长内容空窗", titleEn: "Bilibili Long-form Gap", detail: "近 14 天没有深度解释型内容，影响信任资产沉淀。", detailEn: "No long-form explainer content in 14 days, hurting trust asset depth.", impact: "补齐 2 条长视频", action: "创建 brief", actionEn: "Create brief" }
] as const;

export const assetLibrary = [
  { name: "Launch OS 产品资产", nameEn: "Launch OS Assets", type: "核心产品", typeEn: "Core Product", freshness: "今天更新", freshnessEn: "Updated today", guardrail: "已通过品牌语气检查", guardrailEn: "Passed brand voice check" },
  { name: "Founder narrative 素材组", nameEn: "Founder Narrative Set", type: "创始人内容", typeEn: "Founder Content", freshness: "2 天前", freshnessEn: "2 days ago", guardrail: "待补充客户证据", guardrailEn: "Needs case study" },
  { name: "Q3 增长案例库", nameEn: "Q3 Growth Cases", type: "案例资产", typeEn: "Case Assets", freshness: "5 天前", freshnessEn: "5 days ago", guardrail: "可用于 B2B 平台", guardrailEn: "Ready for B2B channels" }
] as const;

export const packages: ContentPackage[] = [
  { id: "PKG-2048", product: "Launch OS", owner: "PMM", status: "待审核", platforms: ["小红书", "TikTok", "LinkedIn"], updatedAt: "今天 11:20", impact: "覆盖首发和搜索种草", impactEn: "Covers launch and search seeding" },
  { id: "PKG-2039", product: "Founder Letter", owner: "Growth", status: "已批准", platforms: ["公众号", "视频号", "LinkedIn"], updatedAt: "昨天 18:10", impact: "进入本周发布排期", impactEn: "Entering this week's schedule" },
  { id: "PKG-2027", product: "Feature Update", owner: "Content", status: "需补齐", platforms: ["B站", "Instagram"], updatedAt: "周一 09:45", impact: "缺少视觉 brief", impactEn: "Missing visual brief" }
] as const;

export const packageStatusLabels: Record<ContentPackage["status"], { zh: string; en: string }> = {
  "待审核": { zh: "待审核", en: "Pending Review" },
  "已批准": { zh: "已批准", en: "Approved" },
  "排期中": { zh: "排期中", en: "Scheduled" },
  "需补齐": { zh: "需补齐", en: "Incomplete" },
};

export const guardrails = [
  { title: "品牌语气", detail: "清晰、专业、像产品营销负责人，不使用夸张营销词。", icon: ShieldCheck },
  { title: "禁用表达", detail: "避免革命性、颠覆性、躺赚、保证增长等低信任表达。", icon: CheckCircle2 },
  { title: "平台限制", detail: "按平台控制链接、标签、标题长度和直接销售语气。", icon: Globe2 },
  { title: "视觉规范", detail: "封面信息层级清晰，数据和主张必须有证据来源。", icon: Library }
] as const;

export const assetSourceNotes = [
  { source: "Lucide", use: "基础界面与状态图标", license: "ISC", href: "https://lucide.dev/license" },
  { source: "Iconoir", use: "营销、内容、平台类图标候选库", license: "MIT / open source", href: "https://iconoir.com" },
  { source: "Reicon", use: "商业 SaaS 图标候选库", license: "MIT", href: "https://reicon.dev" },
  { source: "unDraw", use: "空状态与说明插画候选库", license: "可商用，无需署名", href: "https://undraw.co/license" },
  { source: "SketchValley", use: "运营状态插画候选库", license: "可商用，无需署名", href: "https://sketchvalley.com/about/" },
  { source: "Motion", use: "React 页面与卡片动效", license: "MIT", href: "https://motion.dev" }
] as const;

export const navStats = [
  { label: "待发布", labelEn: "Ready", value: "42", icon: CheckCircle2 },
  { label: "待审核", labelEn: "In Review", value: "11", icon: Clock3 },
  { label: "已排期", labelEn: "Scheduled", value: "18", icon: CalendarDays }
] as const;
