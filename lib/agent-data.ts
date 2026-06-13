import {
  CalendarCheck,
  CheckCircle2,
  FileCheck2,
  GitBranch,
  Radar,
  Route,
  ShieldCheck,
  Sparkles,
  type LucideIcon
} from "lucide-react";

export type AgentWorkflowStatus = "running" | "ready" | "review" | "paused";

export type AgentWorkflow = {
  id: string;
  name: string;
  nameEn: string;
  agent: string;
  status: AgentWorkflowStatus;
  icon: LucideIcon;
  trigger: string;
  triggerEn: string;
  automation: string[];
  automationEn: string[];
  output: string;
  outputEn: string;
  cadence: string;
  cadenceEn: string;
  owner: string;
  ownerEn: string;
  confidence: number;
};

export const agentMetrics = [
  { label: "活跃 Agent", labelEn: "Active Agents", value: "5", detail: "覆盖洞察、生产、审核、排期、交付", detailEn: "Covering insights, production, review, scheduling, delivery" },
  { label: "自动化流程", labelEn: "Automations", value: "12", detail: "本周已运行 38 次", detailEn: "38 runs this week" },
  { label: "节省操作时间", labelEn: "Time Saved", value: "14.5h", detail: "按人工整理、派单、导出估算", detailEn: "Estimated vs manual sorting, dispatch, export" },
  { label: "待人工确认", labelEn: "Awaiting Approval", value: "7", detail: "涉及品牌语气与发布风险", detailEn: "Brand voice and publish risk flagged" }
] as const;

export const agentWorkflows: AgentWorkflow[] = [
  {
    id: "agent-gap-scout",
    name: "平台缺口侦测",
    nameEn: "Gap Scout",
    agent: "运营侦察 Agent",
    status: "running",
    icon: Radar,
    trigger: "每天 09:00 读取 Dashboard 平台覆盖率、内容缺口和排期空窗",
    triggerEn: "Reads platform coverage, content gaps, and schedule windows daily at 09:00",
    automation: ["识别低覆盖平台", "合并近期表现信号", "生成优先级建议", "创建 Workbench 任务"],
    automationEn: ["Identify low-coverage platforms", "Merge recent performance signals", "Generate priority recommendations", "Create Workbench tasks"],
    output: "3 个高优先级增长动作",
    outputEn: "3 high-priority growth actions",
    cadence: "每日",
    cadenceEn: "Daily",
    owner: "增长运营",
    ownerEn: "Growth Ops",
    confidence: 91
  },
  {
    id: "agent-asset-builder",
    name: "增长资产包生产",
    nameEn: "Asset Builder",
    agent: "资产生产 Agent",
    status: "ready",
    icon: Sparkles,
    trigger: "当产品资产更新或 Dashboard 标记内容缺口",
    triggerEn: "When product assets are updated or Dashboard flags a content gap",
    automation: ["读取产品资产", "选择平台预设", "生成标题/正文/CTA/视觉 brief", "写入 Packages 待审核队列"],
    automationEn: ["Read product assets", "Select platform presets", "Generate title/body/CTA/visual brief", "Push to Packages review queue"],
    output: "跨平台增长资产包草稿",
    outputEn: "Cross-platform growth kit draft",
    cadence: "按需触发",
    cadenceEn: "On demand",
    owner: "内容团队",
    ownerEn: "Content Team",
    confidence: 86
  },
  {
    id: "agent-brand-review",
    name: "品牌与合规质检",
    nameEn: "Brand Guard",
    agent: "品牌质检 Agent",
    status: "review",
    icon: ShieldCheck,
    trigger: "任何资产包进入送审状态",
    triggerEn: "Any package entering review status",
    automation: ["扫描禁用表达", "检查平台限制", "评估 CTA 清晰度", "标记需要人工确认的风险"],
    automationEn: ["Scan prohibited expressions", "Check platform restrictions", "Assess CTA clarity", "Flag items needing human review"],
    output: "审核建议和风险标签",
    outputEn: "Review recommendations and risk tags",
    cadence: "每次送审",
    cadenceEn: "Per submission",
    owner: "品牌市场",
    ownerEn: "Brand & Marketing",
    confidence: 78
  },
  {
    id: "agent-scheduler",
    name: "发布排期编排",
    nameEn: "Calendar Scheduler",
    agent: "排期编排 Agent",
    status: "ready",
    icon: CalendarCheck,
    trigger: "资产包批准后自动匹配平台窗口",
    triggerEn: "Auto-matches platform windows after package approval",
    automation: ["读取平台节奏", "避开主题冲突", "分配发布时间", "同步排期状态"],
    automationEn: ["Read platform cadence", "Avoid topic conflicts", "Assign publish time", "Sync schedule status"],
    output: "7 天发布计划",
    outputEn: "7-day publish plan",
    cadence: "每周",
    cadenceEn: "Weekly",
    owner: "增长运营",
    ownerEn: "Growth Ops",
    confidence: 84
  },
  {
    id: "agent-export",
    name: "交付包整理",
    nameEn: "Delivery Packager",
    agent: "交付整理 Agent",
    status: "paused",
    icon: FileCheck2,
    trigger: "客户或团队需要导出交付包",
    triggerEn: "When client or team requests a delivery package",
    automation: ["整理平台内容", "附带视觉 brief", "生成 Markdown/CSV", "记录授权说明"],
    automationEn: ["Compile platform content", "Attach visual brief", "Generate Markdown/CSV", "Record authorization notes"],
    output: "可交付增长资产包",
    outputEn: "Deliverable growth kit",
    cadence: "批准后触发",
    cadenceEn: "On approval",
    owner: "客户成功",
    ownerEn: "Client Success",
    confidence: 72
  }
];

export const agentRunLog = [
  { time: "11:42", agent: "运营侦察 Agent", event: "发现小红书搜索资产缺口，已创建 Workbench 任务。", eventEn: "Xiaohongshu search asset gap found, Workbench task created.", state: "完成", stateEn: "Done" },
  { time: "11:28", agent: "品牌质检 Agent", event: "TikTok 首发脚本 CTA 风险偏高，等待品牌市场确认。", eventEn: "TikTok launch script CTA risk flagged, awaiting brand review.", state: "待确认", stateEn: "Pending" },
  { time: "10:55", agent: "排期编排 Agent", event: "将 LinkedIn 创始人动态安排到周四高互动窗口。", eventEn: "LinkedIn founder update scheduled for Thursday peak window.", state: "完成", stateEn: "Done" },
  { time: "10:21", agent: "资产生产 Agent", event: "基于产品资产生成 7 平台内容草稿。", eventEn: "Generated 7-platform content draft from product assets.", state: "完成", stateEn: "Done" }
] as const;

export const agentPipeline = [
  { label: "侦测", labelEn: "Detect", title: "读取运营信号", titleEn: "Read Operations Signals", detail: "平台覆盖、内容缺口、发布空窗、表现数据", detailEn: "Platform coverage, content gaps, schedule windows, performance data", icon: Radar },
  { label: "规划", labelEn: "Plan", title: "制定增长动作", titleEn: "Map Growth Actions", detail: "判断优先级、选择平台、生成任务", detailEn: "Prioritize, select platform, generate tasks", icon: GitBranch },
  { label: "生产", labelEn: "Produce", title: "生产平台资产", titleEn: "Create Platform Assets", detail: "标题、正文、CTA、视觉 brief、平台注意事项", detailEn: "Title, body, CTA, visual brief, platform notes", icon: Sparkles },
  { label: "质检", labelEn: "Review", title: "品牌规则质检", titleEn: "Brand QA", detail: "禁用词、平台限制、品牌语气、转化风险", detailEn: "Prohibited terms, platform limits, brand voice, conversion risk", icon: ShieldCheck },
  { label: "排期", labelEn: "Schedule", title: "排期与交付", titleEn: "Schedule & Deliver", detail: "送审、批准、发布窗口、导出交付包", detailEn: "Submit, approve, publish window, export delivery", icon: Route },
  { label: "回流", labelEn: "Learn", title: "表现回流", titleEn: "Performance Feedback", detail: "触达、点击、收藏、线索和收入信号进入下一轮", detailEn: "Reach, clicks, saves, leads, and revenue signals into the next cycle", icon: CheckCircle2 }
] as const;
