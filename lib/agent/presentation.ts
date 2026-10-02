export type AgentPageContext = {
  key: string;
  labelZh: string;
  labelEn: string;
  prompt: string;
};

export const OPEN_GLOBAL_AGENT_EVENT = "finfold-open-agent";

const PAGE_CONTEXTS: Array<{ matches: (pathname: string) => boolean; context: AgentPageContext }> = [
  {
    matches: (pathname) => pathname === "/dashboard",
    context: {
      key: "dashboard",
      labelZh: "Finfold智能体工作区",
      labelEn: "Finfold Agent workspace",
      prompt: "The user is in the primary Finfold Agent workspace. Keep them in the conversation, choose capabilities automatically, and surface detailed pages only when they need deeper execution or review."
    }
  },
  {
    matches: (pathname) => pathname.startsWith("/workbench"),
    context: {
      key: "workbench",
      labelZh: "创作台",
      labelEn: "Workbench",
      prompt: "The user is in the content workbench. Help them move the current content task toward an editable, publish-ready result."
    }
  },
  {
    matches: (pathname) => pathname.startsWith("/operations/account-health"),
    context: {
      key: "account-health",
      labelZh: "账号体检报告",
      labelEn: "Account Health report",
      prompt: "The user is reviewing an evidence-led social account diagnosis. Help them execute a report prescription, preserve the distinction between potential risky wording and confirmed enforcement, and never claim a shadowban without direct evidence."
    }
  },
  {
    matches: (pathname) => pathname.startsWith("/packages"),
    context: {
      key: "packages",
      labelZh: "内容库",
      labelEn: "Saved Kits",
      prompt: "The user is reviewing saved content. Help them inspect, reuse, improve, or prepare an existing content kit for publishing."
    }
  },
  {
    matches: (pathname) => pathname.startsWith("/brand-memory"),
    context: {
      key: "brand-memory",
      labelZh: "品牌记忆",
      labelEn: "Identity Memory",
      prompt: "The user is reviewing brand memory. Help them explain, check, refine, or safely update learned brand preferences."
    }
  },
  {
    matches: (pathname) => pathname.startsWith("/guardrails"),
    context: {
      key: "guardrails",
      labelZh: "品牌规则",
      labelEn: "Brand Rules",
      prompt: "The user is reviewing brand rules. Help them identify missing boundaries, conflicts, or wording rules before content generation."
    }
  },
  {
    matches: (pathname) => pathname.startsWith("/billing"),
    context: {
      key: "billing",
      labelZh: "订阅",
      labelEn: "Billing",
      prompt: "The user is viewing billing. Explain plan capabilities plainly and do not claim an upgrade or purchase has happened without confirmation."
    }
  }
];

const DEFAULT_CONTEXT: AgentPageContext = {
  key: "finfold",
  labelZh: "Finfold",
  labelEn: "Finfold",
  prompt: "The user is working inside Finfold. Help them complete the requested content or growth task with the shortest safe path."
};

/** Resolve a client pathname to a fixed prompt fragment. Raw paths never enter the model prompt. */
export function resolveAgentPageContext(pathname: string): AgentPageContext {
  return PAGE_CONTEXTS.find((item) => item.matches(pathname))?.context ?? DEFAULT_CONTEXT;
}

const TOOL_LABELS_ZH: Record<string, string> = {
  create_execution_plan: "制定任务计划",
  get_guardrails: "读取品牌规则",
  add_guardrail_rules: "新增品牌规则",
  remove_guardrail_rules: "删除品牌规则",
  list_industry_packs: "查看行业规则库",
  set_enabled_packs: "更新行业规则库",
  get_brand_brain: "读取品牌记忆",
  inspect_memory_conflicts: "检查记忆冲突",
  update_brand_brain: "更新品牌记忆",
  analyze_creator_style: "分析对标博主能力",
  save_creator_style_profile: "保存对标风格画像",
  learn_style: "学习写作风格（旧版）",
  list_research_missions: "读取研究历史",
  run_evidence_research: "生成证据型运营研究",
  rewrite_text: "按风格改写文案",
  investigate_social_account: "调查社交账号",
  diagnose_xiaohongshu: "诊断小红书账号",
  get_weekly_growth_report: "读取本周增长报告",
  get_duty_queue: "读取智能体值班队列",
  analyze_content_readiness: "审核草稿发布质量",
  get_recent_kits: "查看最近内容",
  prepare_platform_content_package: "准备平台内容包",
  analyze_account_performance: "分析账号表现",
  plan_next_content_experiment: "规划下一轮内容实验",
  start_growth_mission: "启动增长任务",
  inspect_xhs_workflow: "读取小红书工作流",
  prepare_xhs_campaign: "生成小红书整套方案",
  propose_xhs_positioning: "生成小红书定位方案",
  research_xhs_topics: "调研小红书选题",
  prepare_xhs_content_package: "准备小红书内容方案",
  review_xhs_performance: "复盘小红书表现",
  propose_xhs_next_action: "安排小红书下一步",
  research_public_demand_signals: "抓取公开需求信号",
  research_platform_hot_posts: "抓取平台热门内容",
  research_creator_posts: "抓取博主公开发帖",
  learn_creator_style_from_reddit: "学习博主可迁移风格",
  fetch_public_pages: "读取公开网页",
  ask_user: "向你确认"
};

export function getAgentToolLabel(name: string, locale: "zh" | "en"): string {
  if (locale === "zh") return TOOL_LABELS_ZH[name] ?? name.replace(/_/g, " ");
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

type PresentableToolEvent = {
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
};

/**
 * A model may repair a failed account investigation by calling the same tool
 * again with corrected attachment arguments. That recovery is useful
 * internally, but presenting both attempts makes one diagnosis look like two
 * separate tasks. Keep the strongest attempt for each investigated account.
 *
 * The same applies to creator style profiles: `analyze_creator_style` and the
 * confirmed `save_creator_style_profile` call both return the same profile,
 * which used to render two near-identical profile cards. Collapse them into
 * the latest event per profile (the save result replaces the analysis card).
 *
 * `ask_user` follows the same rule per question set: legacy runs could re-ask
 * the same question within one turn, rendering stacked duplicate cards. Keep
 * only the latest card per identical question set.
 */
export function collapseAgentToolEventsForDisplay<T extends PresentableToolEvent>(events: readonly T[]): T[] {
  const collapsed: T[] = [];
  const toolEventIndexes = new Map<string, number>();

  for (const event of events) {
    const key = toolEventDisplayKey(event);
    if (!key) {
      collapsed.push(event);
      continue;
    }

    const existingIndex = toolEventIndexes.get(key);
    if (existingIndex === undefined) {
      toolEventIndexes.set(key, collapsed.length);
      collapsed.push(event);
      continue;
    }

    const existing = collapsed[existingIndex];
    if (toolEventDisplayRank(event) >= toolEventDisplayRank(existing)) {
      collapsed[existingIndex] = event;
    }
  }

  return collapsed;
}

function toolEventDisplayKey(event: PresentableToolEvent): string | null {
  return accountInvestigationDisplayKey(event) ?? creatorStyleProfileDisplayKey(event) ?? askUserDisplayKey(event);
}

function accountInvestigationDisplayKey(event: PresentableToolEvent): string | null {
  if (event.name !== "investigate_social_account") return null;
  const result = objectValue(event.result);
  const investigation = objectValue(result?.investigation);
  const rawAccountUrl = stringValue(event.args?.accountUrl) ?? stringValue(investigation?.accountUrl);
  const platform = stringValue(event.args?.platform) ?? stringValue(investigation?.platform) ?? "current-evidence";
  return `${event.name}:${normalizeDisplayTarget(rawAccountUrl ?? platform)}`;
}

function creatorStyleProfileDisplayKey(event: PresentableToolEvent): string | null {
  const argsProfile = objectValue(event.args?.profile);
  const result = objectValue(event.result) ?? (argsProfile ? { creatorStyleProfile: argsProfile } : null);
  const profile = objectValue(result?.creatorStyleProfile);
  if (!profile) return null;
  const creator = stringValue(profile.creatorName);
  const url = stringValue(profile.profileUrl);
  if (!creator && !url) return null;
  return `creatorStyleProfile:${normalizeDisplayTarget(creator ?? "")}|${normalizeDisplayTarget(url ?? "")}`;
}

function askUserDisplayKey(event: PresentableToolEvent): string | null {
  if (event.name !== "ask_user") return null;
  const result = objectValue(event.result);
  if (!result || result.askedUser !== true || !Array.isArray(result.questions)) return null;
  const questionKeys = result.questions
    .map((question) => {
      const parsed = objectValue(question);
      const id = stringValue(parsed?.id) ?? "";
      const text = stringValue(parsed?.question) ?? "";
      return `${normalizeDisplayTarget(id)}|${normalizeDisplayTarget(text)}`;
    })
    .filter((key) => key !== "|");
  if (!questionKeys.length) return null;
  return `ask_user:${questionKeys.join("||")}`;
}

function toolEventDisplayRank(event: PresentableToolEvent): number {
  const result = objectValue(event.result);
  if (objectValue(result?.investigation)) return 4;
  if (result && typeof result.error !== "string") return 3;
  if (event.result === undefined) return 2;
  return 1;
}

function normalizeDisplayTarget(value: string): string {
  return value.trim().replace(/\/$/, "").toLowerCase();
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
