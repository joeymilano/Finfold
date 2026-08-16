import { sendRawPrompt } from "@/lib/llm";
import type { AgentToolContext, AgentToolDefinition } from "@/lib/agent/types";
import { runAgentProviderCall } from "@/lib/agent/provider-call";
import {
  createXhsPendingAction,
  loadXhsWorkflowState,
  type CreatorStrategyInput,
  type XhsArtifactConfidence,
  type XhsWorkflowArtifact
} from "@/lib/agent/xhs-workflow";
import { loadGrowthMetricSamples, type GrowthMetricSample } from "@/lib/agent/growth-briefing";
import {
  buildXhsAnalyticsReport,
  importedRowsToGrowthSamples,
  type ImportedXhsMetricRow
} from "@/lib/agent/xhs-data-import";

const UPGRADE_RESULT = {
  upgradeRequired: true,
  message: "完整的小红书 Agent 工作流需要 Starter 或以上套餐。你仍然可以查看当前卡点和基础下一步。"
};

type XhsCard = {
  kind: "positioning" | "campaign" | "topics" | "draft" | "titles" | "visual" | "review" | "next_action";
  eyebrow: string;
  title: string;
  summary: string;
  items?: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
};

export const XHS_AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: "inspect_xhs_workflow",
    description: "读取用户持久化的小红书运营阶段、已确认定位、关键产物、数据状态和唯一下一步。用户问现在卡在哪里、今天做什么或重新打开会话时调用。",
    parameters: {
      type: "object",
      properties: {
        locale: { type: "string", enum: ["zh", "en"], description: "返回语言，默认 zh" }
      }
    },
    mutates: false,
    requiresAgentTools: false,
    async execute(args, ctx) {
      const state = await loadXhsWorkflowState(ctx.admin, ctx.userId, args.locale === "en" ? "en" : "zh");
      return {
        state,
        xhsCard: nextActionCard(state.nextAction)
      };
    }
  },
  {
    name: "prepare_xhs_campaign",
    description: "为信息充分的小红书营销目标一次性准备选题研究、推荐方向、正文 brief、标题候选、3:4 视觉故事板和发布前检查。生成阶段自动连续执行，只返回一张整套方案待采用卡；不会直接发布。",
    parameters: {
      type: "object",
      properties: {
        objective: { type: "string", description: "这次内容要推广或达成的具体目标" },
        realDetails: { type: "string", description: "真实产品卖点、场景、步骤、数字、经历或限制；至少一段具体信息" },
        contentType: { type: "string", description: "经验、教程、清单、观点、测评、案例或新品推广" },
        preferredTitle: { type: "string", description: "希望保留的标题方向，可选" },
        accountGoal: { type: "string", description: "没有已确认账号定位时使用" },
        expertise: { type: "string", description: "没有已确认定位时，传入品牌或创作者真实能力与证明" },
        audience: { type: "string", description: "没有已确认定位时，传入目标受众" },
        sustainableTopics: { type: "string", description: "可持续内容方向，可选" },
        evidence: {
          type: "array",
          description: "来自真实搜索、连接器或用户提供的趋势样本。没有则留空，不得虚构。",
          items: {
            type: "object",
            properties: {
              source: { type: "string" },
              title: { type: "string" },
              metric: { type: "string" },
              observedAt: { type: "string" },
              url: { type: "string" }
            },
            required: ["source", "title"]
          }
        }
      },
      required: ["objective", "realDetails"]
    },
    mutates: false,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const objective = text(args.objective);
      const realDetails = text(args.realDetails);
      if (realDetails.length < 20) {
        return {
          needsInput: true,
          questions: [
            "这次要推广的产品、活动或观点具体是什么？",
            "有哪些真实卖点、价格、时间、场景或顾客反馈可以使用？"
          ],
          message: "先补一段真实素材。我可以自动完成后续流程，但不会替你编造卖点、数据或顾客反馈。"
        };
      }

      const state = await loadXhsWorkflowState(ctx.admin, ctx.userId, "zh");
      assertAgentActive(ctx);
      let strategy: CreatorStrategyInput;
      let strategyMode: "existing" | "generated";
      if (state.strategy) {
        strategy = {
          positioningStatement: state.strategy.positioningStatement,
          audienceLabels: state.strategy.audienceLabels,
          contentPillars: state.strategy.contentPillars,
          identityProofs: state.strategy.identityProofs,
          seriesPromises: state.strategy.seriesPromises,
          sustainableCadence: state.strategy.sustainableCadence,
          boundaries: state.strategy.boundaries
        };
        strategyMode = "existing";
      } else {
        const expertise = text(args.expertise);
        const audience = text(args.audience);
        if (expertise.length < 4 || audience.length < 2) {
          return {
            needsInput: true,
            questions: ["你的品牌或账号最真实的优势是什么？", "这篇内容最想影响哪一类具体的人？"],
            message: "只差这两项，我就能自动生成完整方案；没有真实定位时不会凭空替你设定人设。"
          };
        }
        strategy = await generatePositioning(ctx, {
          accountGoal: text(args.accountGoal) || objective,
          expertise,
          sustainableTopics: text(args.sustainableTopics) || objective,
          audience
        });
        assertAgentActive(ctx);
        strategyMode = "generated";
      }

      const evidence = Array.isArray(args.evidence) ? args.evidence.map(record) : [];
      const confidence: XhsArtifactConfidence = evidence.length > 0 || state.dataStatus.hasMeasuredData ? "inferred" : "hypothesis";
      const sourceLimitations = evidence.length > 0
        ? ["趋势样本来自已连接来源或用户提供内容，仍不代表平台全量趋势。"]
        : ["尚未接入实时小红书趋势样本；选题来自品牌定位与内容策略，不声称平台实时热度。"];
      const topics = await generateTopics(ctx, strategy, objective, evidence);
      assertAgentActive(ctx);
      const recommendedTopic = topics[0] ?? { id: "topic-1", title: objective };
      const brief = await generateNoteBrief(ctx, text(recommendedTopic.title) || objective, realDetails, text(args.contentType));
      assertAgentActive(ctx);
      const previewBrief: XhsWorkflowArtifact = {
        id: "preview-note-brief",
        workflowId: state.workflow?.id ?? "preview-workflow",
        kind: "note_brief",
        version: 1,
        status: "proposed",
        payload: brief,
        provenance: { source: "agent_campaign_preview" },
        confidence: "hypothesis",
        createdAt: new Date().toISOString()
      };
      const titles = await generateTitles(ctx, previewBrief, text(args.preferredTitle));
      assertAgentActive(ctx);
      const selectedTitle = titles[0] ?? { id: "title-1", title: objective.slice(0, 20), score: 0 };
      const visualPlan = await generateVisualPlan(ctx, text(selectedTitle.title), previewBrief);
      assertAgentActive(ctx);
      const pendingAction = await createXhsPendingAction(ctx.admin, {
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        actionKind: "confirm_campaign",
        payload: {
          strategy,
          strategyMode,
          topics,
          selectedTopicId: text(recommendedTopic.id),
          brief,
          titles,
          selectedTitleId: text(selectedTitle.id),
          visualPlan,
          confidence,
          provenance: { sources: evidence, strategyMode },
          sourceLimitations
        }
      });
      return {
        xhsCard: campaignCard({
          objective,
          recommendedTopic,
          brief,
          selectedTitle,
          visualPlan,
          sourceLimitations,
          confidence,
          href: `/workbench?workflowId=${encodeURIComponent(pendingAction.workflowId)}&platform=xiaohongshu&idea=${encodeURIComponent([
            text(recommendedTopic.title),
            text(selectedTitle.title),
            text(brief.coreMessage)
          ].filter(Boolean).join("\n").slice(0, 1800))}`
        }),
        pendingAction,
        package: { strategy, topics, brief, titles, visualPlan },
        executionProgress: { completedSteps: 5, totalSteps: 5 }
      };
    }
  },
  {
    name: "propose_xhs_positioning",
    description: "把用户的经验、目标、受众和可持续话题蒸馏为小红书账号定位、内容支柱与系列承诺。只生成待确认方案，不直接保存。",
    parameters: {
      type: "object",
      properties: {
        accountGoal: { type: "string", description: "用户希望账号带来的结果" },
        expertise: { type: "string", description: "用户真实拥有的经验、身份、案例或资源" },
        sustainableTopics: { type: "string", description: "用户愿意长期输出的话题" },
        audience: { type: "string", description: "最想影响的具体人群" }
      }
    },
    mutates: false,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const accountGoal = text(args.accountGoal);
      const expertise = text(args.expertise);
      const sustainableTopics = text(args.sustainableTopics);
      const audience = text(args.audience);
      if (![accountGoal, expertise, sustainableTopics, audience].filter(Boolean).length) {
        return {
          needsInput: true,
          questions: [
            "你已经真实做成、经历或长期研究过什么？",
            "你最想持续帮助哪一类具体的人？",
            "这个账号最终希望带来影响力、客户、产品转化，还是职业机会？"
          ],
          message: "先回答这三个问题。缺少真实经历时，我不会替你编造人设。"
        };
      }

      const strategy = await generatePositioning(ctx, { accountGoal, expertise, sustainableTopics, audience });
      const pendingAction = await createXhsPendingAction(ctx.admin, {
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        actionKind: "confirm_positioning",
        payload: { strategy }
      });
      return {
        xhsCard: positioningCard(strategy),
        pendingAction
      };
    }
  },
  {
    name: "research_xhs_topics",
    description: "基于已确认定位、用户给出的趋势证据和真实表现，生成三个小红书选题候选并标明来源与限制。没有外部证据时必须标为策略假设。",
    parameters: {
      type: "object",
      properties: {
        seed: { type: "string", description: "用户当前想做的话题、产品或问题，可选" },
        evidence: {
          type: "array",
          items: {
            type: "object",
            properties: {
              source: { type: "string" },
              title: { type: "string" },
              metric: { type: "string" },
              observedAt: { type: "string" },
              url: { type: "string" }
            },
            required: ["source", "title"]
          }
        }
      }
    },
    mutates: false,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const state = await loadXhsWorkflowState(ctx.admin, ctx.userId, "zh");
      if (!state.strategy) {
        return {
          needsPositioning: true,
          message: "先确认账号定位；否则热点只会带来与账号无关的流量。",
          state
        };
      }
      const evidence = Array.isArray(args.evidence) ? args.evidence.map(record) : [];
      const confidence: XhsArtifactConfidence = evidence.length > 0 || state.dataStatus.hasMeasuredData ? "inferred" : "hypothesis";
      const topics = await generateTopics(ctx, state.strategy, text(args.seed), evidence);
      const sourceLimitations = evidence.length > 0
        ? ["热点证据由用户提供，Finfold 未独立验证平台全量趋势。"]
        : ["没有接入实时小红书趋势数据；候选来自已确认定位和内容策略，不代表平台热度结论。"];
      const pendingAction = await createXhsPendingAction(ctx.admin, {
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        actionKind: "select_topic",
        payload: {
          topics,
          confidence,
          provenance: {
            sources: evidence,
            strategyProfileVersion: state.strategy.version
          },
          sourceLimitations
        }
      });
      return {
        xhsCard: topicsCard(topics, sourceLimitations, confidence),
        pendingAction
      };
    }
  },
  {
    name: "prepare_xhs_content_package",
    description: "按当前小红书工作流阶段准备内容产物：draft 阶段生成真实素材清单与正文 brief，title 阶段生成并评分标题候选，visual 阶段生成 3:4 多页视觉方案。每次只推进一个阶段。",
    parameters: {
      type: "object",
      properties: {
        realDetails: { type: "string", description: "用户提供的真实经历、步骤、数字、案例或观点" },
        contentType: { type: "string", description: "经验、教程、复盘、清单、观点、测评或案例" },
        preferredTitle: { type: "string", description: "用户希望保留的标题方向，可选" }
      }
    },
    mutates: false,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const state = await loadXhsWorkflowState(ctx.admin, ctx.userId, "zh");
      if (!state.workflow || state.workflow.stage === "positioning" || state.workflow.stage === "topic") {
        return {
          wrongStage: true,
          state,
          message: `当前先完成「${state.nextAction.title}」。`
        };
      }

      if (state.workflow.stage === "draft") {
        const realDetails = text(args.realDetails);
        if (realDetails.length < 20) {
          return {
            needsInput: true,
            questions: [
              "这件事具体发生在什么场景？",
              "你实际做了哪些步骤，哪些失败过？",
              "有哪些数字、截图或结果可以作为证据？"
            ],
            message: "请补至少一段真实细节；Agent 不会编造案例、数字或身份背书。"
          };
        }
        const topic = text(state.artifacts.topic_evidence?.payload.selectedTopic);
        const brief = await generateNoteBrief(ctx, topic, realDetails, text(args.contentType));
        const pendingAction = await createXhsPendingAction(ctx.admin, {
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          actionKind: "confirm_draft",
          payload: { brief }
        });
        return { xhsCard: draftCard(brief), pendingAction };
      }

      if (state.workflow.stage === "title") {
        const brief = state.artifacts.note_brief;
        if (!brief) return { needsDraft: true, message: "当前没有已确认的正文 brief，请先回到写作阶段。" };
        const candidates = await generateTitles(ctx, brief, text(args.preferredTitle));
        const pendingAction = await createXhsPendingAction(ctx.admin, {
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          actionKind: "select_title",
          payload: { candidates }
        });
        return { xhsCard: titlesCard(candidates), pendingAction };
      }

      if (state.workflow.stage === "visual") {
        const title = text(state.artifacts.title_matrix?.payload.selectedTitle);
        const brief = state.artifacts.note_brief;
        if (!title || !brief) return { needsTitle: true, message: "当前缺少已确认标题或正文 brief。" };
        const plan = await generateVisualPlan(ctx, title, brief);
        const pendingAction = await createXhsPendingAction(ctx.admin, {
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          actionKind: "confirm_visual",
          payload: { plan }
        });
        return { xhsCard: visualCard(plan), pendingAction };
      }

      return {
        state,
        xhsCard: nextActionCard(state.nextAction),
        message: state.workflow.stage === "publish"
          ? "方案已经确认，可以带着同一工作流进入创作台。"
          : "内容已经发布或进入复盘阶段，请先回流真实表现。"
      };
    }
  },
  {
    name: "review_xhs_performance",
    description: "读取真实小红书表现，按样本纪律定位曝光、点击、停留、互动或转化中的最上游断点。少于 5 篇不总结趋势，发布不足 7 天的数据不下成熟结论。",
    parameters: {
      type: "object",
      properties: {
        locale: { type: "string", enum: ["zh", "en"] }
      }
    },
    mutates: false,
    requiresAgentTools: false,
    async execute(args, ctx) {
      const locale = args.locale === "en" ? "en" : "zh";
      const state = await loadXhsWorkflowState(ctx.admin, ctx.userId, locale);
      const review = buildXhsAnalyticsReport(await loadReviewSamples(ctx), locale);
      if (!review.hasEnoughData) {
        return {
          needsMetrics: true,
          xhsCard: reviewCard(review),
          state,
          message: review.summary
        };
      }
      const pendingAction = state.workflow ? await createXhsPendingAction(ctx.admin, {
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        actionKind: "complete_review",
        payload: {
          report: review,
          bottleneck: review.bottleneck,
          primaryMetric: review.primaryMetric
        }
      }) : null;
      return {
        xhsCard: reviewCard(review),
        pendingAction,
        state
      };
    }
  },
  {
    name: "propose_xhs_next_action",
    description: "基于持久化工作流和真实数据返回唯一下一步。不会自动启动实验、发布内容或修改策略。",
    parameters: {
      type: "object",
      properties: {
        locale: { type: "string", enum: ["zh", "en"] }
      }
    },
    mutates: false,
    requiresAgentTools: false,
    async execute(args, ctx) {
      const state = await loadXhsWorkflowState(ctx.admin, ctx.userId, args.locale === "en" ? "en" : "zh");
      return {
        state,
        xhsCard: nextActionCard(state.nextAction)
      };
    }
  }
];

async function generatePositioning(ctx: AgentToolContext, input: {
  accountGoal: string;
  expertise: string;
  sustainableTopics: string;
  audience: string;
}): Promise<CreatorStrategyInput> {
  const fallbackAudience = input.audience || "正在解决这一具体问题的人";
  const fallbackTopic = input.sustainableTopics || input.expertise || "真实经验与可复用方法";
  const fallback: CreatorStrategyInput = {
    positioningStatement: `用真实经验帮助${fallbackAudience}解决${fallbackTopic}相关问题`,
    audienceLabels: [fallbackAudience],
    contentPillars: [
      `${fallbackTopic}的真实案例`,
      `${fallbackTopic}的可执行方法`,
      `${fallbackTopic}的常见误区`
    ],
    identityProofs: input.expertise ? [input.expertise] : [],
    seriesPromises: [`每周拆解一个${fallbackTopic}真实问题`],
    sustainableCadence: "每周 2-3 篇",
    boundaries: ["不编造经历、数据或客户结果", "不使用无法验证的绝对化承诺"]
  };
  const prompt = `你是小红书账号定位策略师。基于用户真实输入给出可持续定位，不编造身份、案例或成绩。

账号目标：${input.accountGoal || "未明确"}
真实经验：${input.expertise || "未明确"}
可持续话题：${input.sustainableTopics || "未明确"}
目标受众：${input.audience || "未明确"}

只返回 JSON：
{
  "positioningStatement": "一句话定位",
  "audienceLabels": ["受众自我标签"],
  "contentPillars": ["2-4个内容支柱"],
  "identityProofs": ["只使用输入中真实存在的证明"],
  "seriesPromises": ["1-3个可持续系列"],
  "sustainableCadence": "现实更新频率",
  "boundaries": ["不可越过的事实与表达边界"]
}`;
  return structuredPrompt(ctx, prompt, fallback);
}

async function generateTopics(
  ctx: AgentToolContext,
  strategy: { positioningStatement: string; contentPillars: string[]; audienceLabels: string[] },
  seed: string,
  evidence: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const fallback = strategy.contentPillars.slice(0, 3).map((pillar, index) => ({
    id: `topic-${index + 1}`,
    title: seed ? `${seed}：${pillar}里最容易被忽略的一步` : `${pillar}：最容易被忽略的一步`,
    pillar,
    audienceTension: `${strategy.audienceLabels[0] ?? "目标用户"}正在面对的具体卡点`,
    angle: index === 0 ? "真实经历" : index === 1 ? "可执行清单" : "反常识误区",
    evidence: evidence[index]?.title ?? "尚无实时趋势证据",
    whyNow: evidence.length > 0 ? "与用户提供的近期证据相关" : "来自长期内容支柱，不声称实时热度"
  }));
  const prompt = `你是小红书选题策略师。只能基于已确认定位与给定证据，不得虚构热搜、搜索量或平台指标。

定位：${strategy.positioningStatement}
内容支柱：${strategy.contentPillars.join(" / ")}
受众：${strategy.audienceLabels.join(" / ")}
用户种子：${seed || "无"}
证据：${JSON.stringify(evidence)}

返回恰好 3 个候选的 JSON 数组。字段：id,title,pillar,audienceTension,angle,evidence,whyNow。`;
  return structuredPrompt(ctx, prompt, fallback);
}

async function generateNoteBrief(ctx: AgentToolContext, topic: string, realDetails: string, contentType: string): Promise<Record<string, unknown>> {
  const fallback = {
    topic,
    contentType: contentType || "经验复盘",
    coreMessage: topic,
    opening: "先从一个具体发生过的场景开始，不先讲大道理。",
    structure: ["真实场景", "当时的错误判断", "实际采取的步骤", "结果与限制", "读者可以马上做的一步"],
    realDetails,
    evidenceGaps: ["检查涉及的数字、时间和结果是否有截图或记录支持"],
    cta: "邀请读者分享自己的具体卡点",
    lengthGuidance: "正文 300-800 字"
  };
  const prompt = `你是小红书笔记编辑。围绕选题和用户提供的真实素材生成结构化 brief；不得增加输入中不存在的数字、身份、客户或结果。

选题：${topic}
类型：${contentType || "自动判断"}
真实素材：${realDetails}

只返回 JSON，字段：topic,contentType,coreMessage,opening,structure(数组),realDetails,evidenceGaps(数组),cta,lengthGuidance。`;
  return structuredPrompt(ctx, prompt, fallback);
}

async function generateTitles(ctx: AgentToolContext, brief: XhsWorkflowArtifact, preferredTitle: string): Promise<Array<Record<string, unknown>>> {
  const payload = brief.payload;
  const topic = text(payload.topic) || text(payload.coreMessage);
  const stems = [
    `${topic}，我最后悔没早点知道的事`,
    `别急着做${topic}，先检查这3步`,
    `我用一次真实复盘，讲清${topic}`,
    `${topic}真正难的，不是你以为的那一步`,
    `如果重来一次，我会这样做${topic}`,
    `${topic}避坑清单：先别犯这几个错`
  ];
  const fallback = stems.map((title, index) => {
    const normalized = title.slice(0, 20);
    const score = scoreTitle(normalized, index);
    return {
      id: `title-${index + 1}`,
      title: normalized,
      method: ["经历反差", "行动清单", "真实复盘", "反常识", "重来一次", "避坑"][index],
      score,
      role: index === 0 ? "稳妥主标题" : index === 1 ? "点击实验" : "备选",
      rationale: "保持具体承诺，不添加无法验证的结果"
    };
  });
  const prompt = `你是小红书标题编辑。根据 brief 生成 6 个不重复的标题，至少使用 4 种不同结构。标题不超过 20 个中文字符，不得伪造数字、身份、结果或制造恐慌。

Brief：${JSON.stringify(payload)}
偏好方向：${preferredTitle || "无"}

只返回 JSON 数组，字段：id,title,method,score(0-100),role,rationale。候选按 score 降序。`;
  const generated = await structuredPrompt(ctx, prompt, fallback);
  return generated
    .map((candidate, index) => ({
      ...candidate,
      id: text(candidate.id) || `title-${index + 1}`,
      title: text(candidate.title).slice(0, 20),
      score: Math.max(0, Math.min(100, Number(candidate.score ?? 0)))
    }))
    .filter((candidate) => text(candidate.title))
    .slice(0, 6);
}

async function generateVisualPlan(ctx: AgentToolContext, title: string, brief: XhsWorkflowArtifact): Promise<Record<string, unknown>> {
  const fallback = {
    aspectRatio: "3:4",
    canvas: "1080x1440",
    theme: "使用品牌视觉记忆自动选择",
    cover: {
      headline: title,
      promise: text(brief.payload.coreMessage),
      focus: "单一视觉焦点"
    },
    pages: [
      { page: 1, role: "cover", headline: title },
      { page: 2, role: "context", headline: "先看真实场景" },
      { page: 3, role: "problem", headline: "问题发生在哪里" },
      { page: 4, role: "method", headline: "我实际做了什么" },
      { page: 5, role: "evidence", headline: "结果与限制" },
      { page: 6, role: "takeaway", headline: "你今天可以做的一步" }
    ],
    qa: ["所有页面保持同一字体层级", "截图必须裁切放大并标注", "不把横向完整截图缩进竖版白底", "导出前检查中文换行和安全边距"]
  };
  const prompt = `你是 Finfold 的小红书视觉编导。把已确认标题和 brief 编排为 6-9 页 3:4 图文方案。不要指定固定紫绿风格；视觉主题由用户品牌记忆决定。每页只表达一个结论。

标题：${title}
Brief：${JSON.stringify(brief.payload)}

只返回 JSON，字段：aspectRatio,canvas,theme,cover,pages(6-9项，含page/role/headline/bodyHint/assetSuggestion),qa。`;
  return structuredPrompt(ctx, prompt, fallback);
}

async function loadReviewSamples(ctx: AgentToolContext): Promise<GrowthMetricSample[]> {
  const persisted = await loadGrowthMetricSamples(ctx.admin, ctx.userId, "xiaohongshu");
  let query = ctx.admin
    .from("agent_data_imports")
    .select("id, normalized_rows")
    .eq("user_id", ctx.userId)
    .eq("platform", "xiaohongshu");
  if (ctx.dataImportIds?.length) {
    query = query.in("id", ctx.dataImportIds);
  } else {
    const { data: workflow } = await ctx.admin
      .from("xhs_workflows")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("status", "active")
      .maybeSingle();
    if (!workflow?.id) return persisted;
    query = query.eq("workflow_id", workflow.id);
  }
  const { data, error } = await query.order("created_at", { ascending: false }).limit(6);
  if (error) throw error;

  const imported = (data ?? []).flatMap((item) =>
    importedRowsToGrowthSamples(
      Array.isArray(item.normalized_rows) ? item.normalized_rows as ImportedXhsMetricRow[] : [],
      String(item.id)
    )
  );
  return [...imported, ...persisted];
}

function nextActionCard(action: {
  title: string;
  reason: string;
  evidence: string;
  targetMetric: string | null;
  href: string;
  prompt: string;
  confidence: string;
}): XhsCard {
  return {
    kind: "next_action",
    eyebrow: "小红书今日行动",
    title: action.title,
    summary: action.reason,
    items: [{ label: "判断依据", value: action.evidence }],
    meta: {
      targetMetric: action.targetMetric,
      href: action.href,
      prompt: action.prompt,
      confidence: action.confidence
    }
  };
}

function positioningCard(strategy: CreatorStrategyInput): XhsCard {
  return {
    kind: "positioning",
    eyebrow: "定位待确认",
    title: strategy.positioningStatement,
    summary: `围绕 ${strategy.contentPillars.length} 个内容支柱持续建立认知。`,
    items: strategy.contentPillars.map((pillar, index) => ({
      id: `pillar-${index + 1}`,
      label: `内容支柱 ${index + 1}`,
      value: pillar
    })),
    meta: {
      audienceLabels: strategy.audienceLabels,
      identityProofs: strategy.identityProofs,
      seriesPromises: strategy.seriesPromises,
      cadence: strategy.sustainableCadence,
      boundaries: strategy.boundaries
    }
  };
}

function campaignCard(input: {
  objective: string;
  recommendedTopic: Record<string, unknown>;
  brief: Record<string, unknown>;
  selectedTitle: Record<string, unknown>;
  visualPlan: Record<string, unknown>;
  sourceLimitations: string[];
  confidence: XhsArtifactConfidence;
  href: string;
}): XhsCard {
  const pages = Array.isArray(input.visualPlan.pages) ? input.visualPlan.pages : [];
  return {
    kind: "campaign",
    eyebrow: "整套方案 · 一次确认",
    title: text(input.selectedTitle.title) || input.objective,
    summary: "调研、正文方向、标题和 3:4 视觉故事板已经连续准备完成；采用后进入创作与发布预览，不会直接公开发布。",
    items: [
      {
        id: "campaign-topic",
        title: `推荐选题：${text(input.recommendedTopic.title)}`,
        rationale: text(input.recommendedTopic.whyNow) || text(input.recommendedTopic.angle)
      },
      {
        id: "campaign-draft",
        title: `正文主张：${text(input.brief.coreMessage)}`,
        rationale: text(input.brief.opening)
      },
      {
        id: "campaign-title",
        title: `主标题：${text(input.selectedTitle.title)}`,
        rationale: `标题评分 ${Number(input.selectedTitle.score ?? 0)} · ${text(input.selectedTitle.rationale)}`
      },
      {
        id: "campaign-visual",
        title: `视觉故事：${pages.length} 页 · 3:4`,
        rationale: text(input.visualPlan.theme)
      }
    ],
    meta: {
      limitations: input.sourceLimitations,
      qa: input.visualPlan.qa,
      confidence: input.confidence,
      targetMetric: "封面点击率",
      href: input.href
    }
  };
}

function topicsCard(topics: Array<Record<string, unknown>>, limitations: string[], confidence: string): XhsCard {
  return {
    kind: "topics",
    eyebrow: confidence === "hypothesis" ? "策略假设 · 请选择一个" : "证据辅助 · 请选择一个",
    title: "下一篇最值得验证的三个选题",
    summary: limitations[0] ?? "候选来自已确认定位。",
    items: topics,
    meta: { limitations, confidence }
  };
}

function draftCard(brief: Record<string, unknown>): XhsCard {
  return {
    kind: "draft",
    eyebrow: "正文方向待确认",
    title: text(brief.coreMessage) || text(brief.topic),
    summary: text(brief.opening),
    items: Array.isArray(brief.structure)
      ? brief.structure.map((item, index) => ({ id: `section-${index + 1}`, label: `第 ${index + 1} 段`, value: String(item) }))
      : [],
    meta: { evidenceGaps: brief.evidenceGaps, cta: brief.cta, lengthGuidance: brief.lengthGuidance }
  };
}

function titlesCard(candidates: Array<Record<string, unknown>>): XhsCard {
  return {
    kind: "titles",
    eyebrow: "标题实验 · 请选择一个",
    title: "只改变标题与首屏承诺",
    summary: "候选已按具体性、可信度、受众相关性和点击动机评分；不会加入无依据结果。",
    items: candidates,
    meta: { targetMetric: "封面点击率", singleVariable: true }
  };
}

function visualCard(plan: Record<string, unknown>): XhsCard {
  return {
    kind: "visual",
    eyebrow: "3:4 视觉方案待确认",
    title: text(record(plan.cover).headline) || "多页视觉故事",
    summary: `${Array.isArray(plan.pages) ? plan.pages.length : 0} 页，每页只表达一个结论。`,
    items: Array.isArray(plan.pages) ? plan.pages.map(record) : [],
    meta: { aspectRatio: plan.aspectRatio, canvas: plan.canvas, qa: plan.qa, theme: plan.theme }
  };
}

function reviewCard(review: Record<string, unknown>): XhsCard {
  const distributions = record(review.distributions);
  return {
    kind: "review",
    eyebrow: review.confidence === "measured" ? "真实数据复盘" : "等待真实数据",
    title: text(review.title),
    summary: text(review.summary),
    items: Object.entries(distributions).map(([label, value]) => {
      const values = record(value);
      return {
        id: label,
        label,
        value: `P25 ${values.p25 ?? "—"} · 中位数 ${values.median ?? "—"} · P75 ${values.p75 ?? "—"}`
      };
    }),
    meta: {
      sampleSize: review.sampleSize,
      bottleneck: review.bottleneck,
      primaryMetric: review.primaryMetric,
      limitations: review.limitations,
      action: review.action
    }
  };
}

async function structuredPrompt<T>(ctx: AgentToolContext, prompt: string, fallback: T): Promise<T> {
  try {
    const raw = await runAgentProviderCall(ctx, () => sendRawPrompt(prompt));
    const parsed = JSON.parse(extractJson(raw)) as T;
    return parsed;
  } catch {
    return fallback;
  }
}

function assertAgentActive(ctx: AgentToolContext): void {
  if (!ctx.signal?.aborted) return;
  const error = new Error("Agent execution paused.");
  error.name = "AbortError";
  throw error;
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const arrayStart = raw.indexOf("[");
  const objectStart = raw.indexOf("{");
  const start = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart) ? arrayStart : objectStart;
  if (start < 0) return raw.trim();
  const close = raw[start] === "[" ? raw.lastIndexOf("]") : raw.lastIndexOf("}");
  return close >= start ? raw.slice(start, close + 1) : raw.slice(start);
}

function scoreTitle(title: string, index: number): number {
  let score = 72 - index * 2;
  if (title.length <= 20) score += 8;
  if (/[你我]/.test(title)) score += 4;
  if (/[，：]/.test(title)) score += 3;
  if (/\d/.test(title)) score += 3;
  return Math.min(95, score);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
