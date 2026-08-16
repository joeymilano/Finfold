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
      labelZh: "Finfold Agent 工作区",
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
  get_duty_queue: "读取 Agent 值班队列",
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
  propose_xhs_next_action: "安排小红书下一步"
};

export function getAgentToolLabel(name: string, locale: "zh" | "en"): string {
  if (locale === "zh") return TOOL_LABELS_ZH[name] ?? name.replace(/_/g, " ");
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
