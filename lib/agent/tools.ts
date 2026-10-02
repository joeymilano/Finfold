import { guardrailRuleSchema, customGuardrailsSchema, type GuardrailRule } from "@/lib/guardrails";
import { brandBrainSchema } from "@/lib/brand-brain";
import { BRAND_BRAIN_COLUMNS, mapBrandBrainFromRow, mapBrandBrainToRow } from "@/lib/brand-brain-persistence";
import { mergeLearnedStyle } from "@/lib/style-learning";
import { INDUSTRY_PACKS, industryPackIdSchema } from "@/lib/industry-rules";
import {
  analyzeCreatorStyleProfile,
  creatorStyleAnalysisInputSchema,
  creatorStyleProfileSchema,
  distillStyleProfile
} from "@/lib/agent/style-profile";
import { diagnoseXiaohongshuAccount, normalizeXhsAccountMetrics } from "@/lib/agent/xhs-diagnosis";
import { loadGrowthBriefing } from "@/lib/agent/growth-briefing";
import {
  buildBriefingEvidence,
  buildInvestigationEvidence,
  buildWeeklyReportEvidence
} from "@/lib/report/chart-spec";
import { createGrowthMission, listGrowthMissions } from "@/lib/agent/growth-missions";
import { getOpenPatrolItem, listPatrolItems } from "@/lib/agent/patrol";
import { loadWeeklyGrowthReport } from "@/lib/agent/weekly-growth-report";
import { sendRawPrompt } from "@/lib/llm";
import type { AgentToolContext, AgentToolDefinition } from "@/lib/agent/types";
import { runAgentProviderCall } from "@/lib/agent/provider-call";
import { recordAgentMutation } from "@/lib/agent/audit";
import { platformIdSchema } from "@/lib/content-schema";
import { assessContentReadiness } from "@/lib/content-readiness";
import { inspectMemoryConflicts } from "@/lib/memory-governance";
import {
  agentContentWorkflowRequestSchema,
  buildAgentContentWorkflowGenerationRequest,
  createAgentContentWorkflow
} from "@/lib/agent/content-workflow";
import { growthGoals } from "@/lib/goals";
import { personas } from "@/lib/personas";
import { XHS_AGENT_TOOLS } from "@/lib/agent/xhs-tools";
import { SOCIAL_INTELLIGENCE_TOOLS } from "@/lib/agent/social-intelligence-tools";
import {
  accountInvestigationInputSchema,
  investigateSocialAccount
} from "@/lib/agent/account-investigation";
import {
  agentResearchMissionInputSchema,
  mapResearchMission,
  RESEARCH_MISSION_FIELDS
} from "@/lib/operations/research";
import { generateResearchDecisionForMission } from "@/lib/operations/research-service";
import {
  executeDelegateParallelTool,
  isSubagentDelegationEnabled,
  SUBAGENT_KINDS
} from "@/lib/agent/subagents";
import { askUserRequestSchema } from "@/lib/agent/ask-user";
import { OPPORTUNITY_RADAR_TOOLS } from "@/lib/agent/opportunity-tools";
import type { PlanId } from "@/lib/payment/types";

const UPGRADE_RESULT = {
  upgradeRequired: true,
  message: "此功能需要付费套餐才能使用工具调用能力，请引导用户升级套餐（starter 及以上）。"
};

export function normalizeAgentImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (typeof candidate !== "string") return [];
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? [parsed.toString()] : [];
    } catch {
      return [];
    }
  }).slice(0, 6);
}

async function getGuardrailsRow(ctx: AgentToolContext): Promise<{ rules: GuardrailRule[]; enabledPacks: string[] }> {
  const { data } = await ctx.admin
    .from("custom_guardrails")
    .select("rules, enabled_packs")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return {
    rules: customGuardrailsSchema.parse(data?.rules ?? []),
    enabledPacks: (data?.enabled_packs ?? []) as string[]
  };
}

async function saveGuardrailsRow(ctx: AgentToolContext, rules: GuardrailRule[], enabledPacks: string[]): Promise<void> {
  const { error } = await ctx.admin
    .from("custom_guardrails")
    .upsert(
      { user_id: ctx.userId, rules, enabled_packs: enabledPacks, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) throw error;
}

const CORE_AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: "create_execution_plan",
    description: "为需要两个以上能力或产物的复杂请求建立一份 3-6 步、面向用户的短执行计划。简单问答不要调用。步骤必须描述业务结果，不得暴露内部 Skill、函数名或模型术语。",
    parameters: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "用户能理解的步骤名称，建议 4-12 个中文字符" },
              outcome: { type: "string", description: "这一步将交付或确认什么" }
            },
            required: ["title", "outcome"]
          }
        }
      },
      required: ["steps"]
    },
    mutates: false,
    requiresAgentTools: false,
    async execute(args) {
      const rawSteps = Array.isArray(args.steps) ? args.steps : [];
      const steps = rawSteps
        .slice(0, 6)
        .map((item) => {
          const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
          return {
            title: String(value.title ?? "").trim().slice(0, 40),
            outcome: String(value.outcome ?? "").trim().slice(0, 160)
          };
        })
        .filter((item) => item.title && item.outcome);
      if (steps.length < 3) return { error: "A multi-step execution plan needs at least 3 clear steps." };
      return { steps, total: steps.length };
    }
  },
  {
    name: "get_guardrails",
    description: "读取用户当前的品牌规则(guardrails)列表和已启用的行业规则包 id。在修改规则前应先调用此工具了解现状。",
    parameters: { type: "object", properties: {} },
    mutates: false,
    requiresAgentTools: false,
    async execute(_args, ctx) {
      return getGuardrailsRow(ctx);
    }
  },
  {
    name: "add_guardrail_rules",
    description: "向用户的品牌规则库追加新规则（不会覆盖已有规则）。每条规则需要 title/detail/type，可选中英双语字段。",
    parameters: {
      type: "object",
      properties: {
        rules: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              titleEn: { type: "string" },
              detail: { type: "string" },
              detailEn: { type: "string" },
              type: { type: "string", enum: ["avoid", "required", "tone", "legal"] }
            },
            required: ["title", "detail", "type"]
          }
        }
      },
      required: ["rules"]
    },
    mutates: true,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const newRules = (args.rules as unknown[]).map((r) => guardrailRuleSchema.parse(r));
      const current = await getGuardrailsRow(ctx);
      const merged = customGuardrailsSchema.parse([...current.rules, ...newRules]);
      await saveGuardrailsRow(ctx, merged, current.enabledPacks);
      const auditId = await recordAgentMutation(ctx, {
        toolName: "add_guardrail_rules",
        targetType: "guardrails",
        args,
        beforeState: current,
        afterState: { rules: merged, enabledPacks: current.enabledPacks }
      });
      return { added: newRules.length, totalRules: merged.length, auditId, reversible: Boolean(auditId) };
    }
  },
  {
    name: "remove_guardrail_rules",
    description: "从品牌规则库删除指定标题的规则。删除前必须先在对话中把要删除的规则标题列给用户并获得确认，这是破坏性操作。",
    parameters: {
      type: "object",
      properties: {
        titles: { type: "array", items: { type: "string" }, description: "要删除的规则 title 列表" }
      },
      required: ["titles"]
    },
    mutates: true,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const titles = new Set(args.titles as string[]);
      const current = await getGuardrailsRow(ctx);
      const remaining = current.rules.filter((r) => !titles.has(r.title));
      await saveGuardrailsRow(ctx, remaining, current.enabledPacks);
      const auditId = await recordAgentMutation(ctx, {
        toolName: "remove_guardrail_rules",
        targetType: "guardrails",
        args,
        beforeState: current,
        afterState: { rules: remaining, enabledPacks: current.enabledPacks }
      });
      return { removed: current.rules.length - remaining.length, totalRules: remaining.length, auditId, reversible: Boolean(auditId) };
    }
  },
  {
    name: "list_industry_packs",
    description: "列出所有内置行业规则包（医疗健康/法律服务/广告电商/金融理财）及其是否已启用，附规则条数。",
    parameters: { type: "object", properties: {} },
    mutates: false,
    requiresAgentTools: false,
    async execute(_args, ctx) {
      const current = await getGuardrailsRow(ctx);
      return {
        packs: INDUSTRY_PACKS.map((pack) => ({
          id: pack.id,
          label: pack.label,
          description: pack.description,
          ruleCount: pack.rules.length,
          enabled: current.enabledPacks.includes(pack.id)
        }))
      };
    }
  },
  {
    name: "set_enabled_packs",
    description: "开启或关闭指定的行业规则包 id 列表（覆盖式设置，传入完整的期望启用列表）。",
    parameters: {
      type: "object",
      properties: {
        packIds: { type: "array", items: { type: "string", enum: ["medical", "legal", "advertising", "finance"] } }
      },
      required: ["packIds"]
    },
    mutates: true,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const packIds = (args.packIds as unknown[]).map((id) => industryPackIdSchema.parse(id));
      const current = await getGuardrailsRow(ctx);
      await saveGuardrailsRow(ctx, current.rules, packIds);
      const auditId = await recordAgentMutation(ctx, {
        toolName: "set_enabled_packs",
        targetType: "guardrails",
        args,
        beforeState: current,
        afterState: { rules: current.rules, enabledPacks: packIds }
      });
      return { enabledPacks: packIds, auditId, reversible: Boolean(auditId) };
    }
  },
  {
    name: "get_brand_brain",
    description: "读取用户的身份记忆（个人 IP、品牌或混合身份，以及定位、受众、语气、禁用词、公开社交主页和已学习风格）。",
    parameters: { type: "object", properties: {} },
    mutates: false,
    requiresAgentTools: false,
    async execute(_args, ctx) {
      const { data } = await ctx.admin.from("brand_brains").select(BRAND_BRAIN_COLUMNS).eq("user_id", ctx.userId).maybeSingle();
      return mapBrandBrainFromRow(data);
    }
  },
  {
    name: "inspect_memory_conflicts",
    description: "检查品牌记忆中可以确定的直接冲突，例如同一表达既被偏好又被禁止、认可范文包含禁用词、同平台存在相互矛盾的视觉偏好。只返回可验证问题，不猜测语义冲突，也不会写入记忆。",
    parameters: { type: "object", properties: {} },
    mutates: false,
    requiresAgentTools: false,
    async execute(_args, ctx) {
      const { data } = await ctx.admin.from("brand_brains").select(BRAND_BRAIN_COLUMNS).eq("user_id", ctx.userId).maybeSingle();
      return { memoryGovernance: inspectMemoryConflicts(mapBrandBrainFromRow(data)) };
    }
  },
  {
    name: "update_brand_brain",
    description: "更新身份记忆的用户可编辑字段（identityType/brandName/productDescription/targetAudience/toneKeywords/bannedPhrases/approvedExamples/competitors/positioningStatement）。字段名保持向后兼容：personal 时 brandName 表示个人/IP 名称，productDescription 表示专长与价值。传入字段与现有值合并，不传则保持不变。",
    parameters: {
      type: "object",
      properties: {
        identityType: { type: "string", enum: ["personal", "brand", "hybrid"] },
        brandName: { type: "string" },
        productDescription: { type: "string" },
        targetAudience: { type: "string" },
        toneKeywords: { type: "array", items: { type: "string" } },
        bannedPhrases: { type: "array", items: { type: "string" } },
        approvedExamples: { type: "array", items: { type: "string" } },
        competitors: { type: "array", items: { type: "string" } },
        positioningStatement: { type: "string" }
      }
    },
    mutates: true,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const { data: existing } = await ctx.admin.from("brand_brains").select(BRAND_BRAIN_COLUMNS).eq("user_id", ctx.userId).maybeSingle();
      const current = mapBrandBrainFromRow(existing);

      const dedupeAppend = (base: string[], extra?: string[]) =>
        extra ? Array.from(new Set([...base, ...extra])) : base;

      const next = brandBrainSchema.parse({
        ...current,
        identityType: (args.identityType as "personal" | "brand" | "hybrid") ?? current.identityType,
        brandName: (args.brandName as string) ?? current.brandName,
        productDescription: (args.productDescription as string) ?? current.productDescription,
        targetAudience: (args.targetAudience as string) ?? current.targetAudience,
        positioningStatement: (args.positioningStatement as string) ?? current.positioningStatement,
        toneKeywords: dedupeAppend(current.toneKeywords, args.toneKeywords as string[] | undefined).slice(0, 10),
        bannedPhrases: dedupeAppend(current.bannedPhrases, args.bannedPhrases as string[] | undefined).slice(0, 20),
        approvedExamples: dedupeAppend(current.approvedExamples, args.approvedExamples as string[] | undefined).slice(0, 5),
        competitors: dedupeAppend(current.competitors, args.competitors as string[] | undefined).slice(0, 10)
      });

      const row = mapBrandBrainToRow(next);
      // learnedStyle/learnedNegative/performanceRules are system-managed —
      // preserve them exactly like app/api/brand-brain/route.ts PUT does.
      row.learned_style = current.learnedStyle;
      row.learned_negative = current.learnedNegative;
      row.performance_rules = current.performanceRules;

      const { error } = await ctx.admin
        .from("brand_brains")
        .upsert({ user_id: ctx.userId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;

      const auditId = await recordAgentMutation(ctx, {
        toolName: "update_brand_brain",
        targetType: "brand_brain",
        args,
        beforeState: current,
        afterState: next
      });
      return { updated: true, brandName: next.brandName, auditId, reversible: Boolean(auditId) };
    }
  },
  {
    name: "analyze_creator_style",
    description: "基于一个公开主页链接和至少 3 篇用户提供的代表内容，分析对标博主可迁移的选题、包装、结构、信任和转化能力。只返回带证据引用的画像，不写入品牌记忆；没有表现指标时不得称为爆款。截图必须先由当前视觉会话归纳成带来源的文本观察，视觉不可用时要求用户补文本。",
    parameters: {
      type: "object",
      properties: {
        creatorName: { type: "string", description: "博主或账号名称" },
        profileUrl: { type: "string", description: "公开主页 URL，必填" },
        samples: {
          type: "array",
          minItems: 3,
          maxItems: 12,
          description: "至少 3 篇用户提供的代表内容。不得从模型常识补造样本。",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "稳定证据编号，例如 S1" },
              title: { type: "string" },
              sourceType: { type: "string", enum: ["pasted_text", "screenshot", "public_post", "performance_export"] },
              text: { type: "string", description: "原文或从截图中明确观察到的内容与视觉结构，至少 20 字" },
              url: { type: "string" },
              metrics: {
                type: "object",
                properties: {
                  views: { type: "number" },
                  likes: { type: "number" },
                  saves: { type: "number" },
                  comments: { type: "number" },
                  shares: { type: "number" }
                }
              }
            },
            required: ["id", "title", "sourceType", "text"]
          }
        }
      },
      required: ["creatorName", "profileUrl", "samples"]
    },
    mutates: false,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const input = creatorStyleAnalysisInputSchema.parse(args);
      const profile = await analyzeCreatorStyleProfile(ctx, input);
      return {
        creatorStyleProfile: profile,
        nextActions: [
          "用于下一篇内容",
          "生成 3 个选题实验",
          "加入 14 天陪跑计划"
        ]
      };
    }
  },
  {
    name: "save_creator_style_profile",
    description: "把 analyze_creator_style 刚刚返回、且用户已经看过的同一份可迁移画像写入品牌记忆。必须原样传入工具结果中的 creatorStyleProfile；此写操作会生成确认卡，用户点击确认前不得执行。",
    parameters: {
      type: "object",
      properties: {
        profile: {
          type: "object",
          description: "原样传入 analyze_creator_style 返回的 creatorStyleProfile，禁止自行补写或改写证据。"
        }
      },
      required: ["profile"]
    },
    mutates: true,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const profile = creatorStyleProfileSchema.parse(args.profile);
      const { data: existing } = await ctx.admin
        .from("brand_brains")
        .select(BRAND_BRAIN_COLUMNS)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      const current = mapBrandBrainFromRow(existing);
      const mergedToneKeywords = Array.from(new Set([
        ...current.toneKeywords,
        ...profile.toneKeywords
      ])).slice(0, 10);
      let mergedLearnedStyle = current.learnedStyle;
      for (const rule of profile.transferableRules) {
        mergedLearnedStyle = mergeLearnedStyle(
          mergedLearnedStyle,
          `对标 ${profile.creatorName}：${rule.finding}`
        );
      }

      const next = brandBrainSchema.parse({
        ...current,
        toneKeywords: mergedToneKeywords,
        learnedStyle: mergedLearnedStyle
      });
      const row = mapBrandBrainToRow(next);
      row.learned_negative = current.learnedNegative;
      row.performance_rules = current.performanceRules;

      const { error } = await ctx.admin
        .from("brand_brains")
        .upsert({ user_id: ctx.userId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;

      const auditId = await recordAgentMutation(ctx, {
        toolName: "save_creator_style_profile",
        targetType: "brand_brain",
        args: {
          creatorName: profile.creatorName,
          profileUrl: profile.profileUrl,
          evidenceIds: Array.from(new Set(profile.transferableRules.flatMap((rule) => rule.evidenceIds)))
        },
        beforeState: current,
        afterState: next
      });
      return {
        creatorStyleProfile: profile,
        learnedStyleCount: mergedLearnedStyle.length,
        auditId,
        reversible: Boolean(auditId)
      };
    }
  },
  {
    name: "learn_style",
    description: "兼容旧会话的写作风格学习工具。新会话必须使用 analyze_creator_style 和 save_creator_style_profile。",
    exposedToModel: false,
    parameters: {
      type: "object",
      properties: {
        personName: { type: "string", description: "要模仿的公众人物姓名，例如 张雪峰。sampleTexts 为空时必填。" },
        sampleTexts: { type: "array", items: { type: "string" }, description: "用户粘贴的该风格样本文本，优先于 personName 使用。" }
      }
    },
    mutates: true,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const personName = args.personName as string | undefined;
      const sampleTexts = (args.sampleTexts as string[] | undefined) ?? [];
      if (!personName && sampleTexts.length === 0) {
        throw new Error("Need either personName or sampleTexts to learn a style.");
      }

      const profile = await distillStyleProfile(ctx, personName, sampleTexts);

      const { data: existing } = await ctx.admin.from("brand_brains").select(BRAND_BRAIN_COLUMNS).eq("user_id", ctx.userId).maybeSingle();
      const current = mapBrandBrainFromRow(existing);

      const mergedToneKeywords = Array.from(new Set([...current.toneKeywords, ...profile.toneKeywords])).slice(0, 10);
      let mergedLearnedStyle = current.learnedStyle;
      for (const rule of profile.styleRules) {
        mergedLearnedStyle = mergeLearnedStyle(mergedLearnedStyle, rule);
      }

      const row = mapBrandBrainToRow(brandBrainSchema.parse({ ...current, toneKeywords: mergedToneKeywords }));
      row.learned_style = mergedLearnedStyle;
      row.learned_negative = current.learnedNegative;
      row.performance_rules = current.performanceRules;

      const { error } = await ctx.admin
        .from("brand_brains")
        .upsert({ user_id: ctx.userId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;

      const afterState = brandBrainSchema.parse({
        ...current,
        toneKeywords: mergedToneKeywords,
        learnedStyle: mergedLearnedStyle
      });
      const auditId = await recordAgentMutation(ctx, {
        toolName: "learn_style",
        targetType: "brand_brain",
        args: { personName, sampleCount: sampleTexts.length },
        beforeState: current,
        afterState
      });
      return { profile, learnedStyleCount: mergedLearnedStyle.length, auditId, reversible: Boolean(auditId) };
    }
  },
  {
    name: "rewrite_text",
    description: "按照品牌记忆中已学习的风格规则和语气关键词，改写一段文案。用于演示风格学习效果或临时改写。",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "要改写的原始文案" },
        instructions: { type: "string", description: "额外的改写要求，可选" }
      },
      required: ["text"]
    },
    mutates: false,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const text = args.text as string;
      const instructions = (args.instructions as string) ?? "";

      const { data } = await ctx.admin.from("brand_brains").select(BRAND_BRAIN_COLUMNS).eq("user_id", ctx.userId).maybeSingle();
      const brain = mapBrandBrainFromRow(data);

      const styleSection = brain.learnedStyle.length > 0
        ? `Follow these style rules strictly:\n${brain.learnedStyle.map((r) => `- ${r}`).join("\n")}`
        : "No specific learned style rules — write naturally.";
      const toneSection = brain.toneKeywords.length > 0 ? `Tone keywords: ${brain.toneKeywords.join(", ")}` : "";

      const prompt = `Rewrite the following copy applying the requested style. Keep the same core message and language (Chinese stays Chinese, English stays English). Return ONLY the rewritten text, no explanation, no quotes.

${styleSection}
${toneSection}
${instructions ? `Additional instructions: ${instructions}` : ""}

=== ORIGINAL TEXT ===
${text}`;

      const rewritten = (await runAgentProviderCall(ctx, () => sendRawPrompt(prompt))).trim();
      return { rewritten };
    }
  },
  {
    name: "list_research_missions",
    description: "读取最近的品类、竞品和历史研究结果，用于避免重复调研。历史 creator_scout 只读展示，不能继续创建或分析。",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "返回条数，默认 8，最多 20" }
      }
    },
    mutates: false,
    requiresAgentTools: false,
    async execute(args, ctx) {
      const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 20);
      const { data, error } = await ctx.admin
        .from("research_missions")
        .select(RESEARCH_MISSION_FIELDS)
        .eq("user_id", ctx.userId)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return {
        missions: (data ?? []).map((row) => {
          const mission = mapResearchMission(row as never);
          return {
            id: mission.id,
            missionType: mission.missionType,
            title: mission.title,
            question: mission.question,
            status: mission.status,
            evidenceCount: mission.evidence.length,
            executiveSummary: mission.decision?.executiveSummary ?? null,
            legacyReadOnly: mission.missionType === "creator_scout",
            updatedAt: mission.updatedAt
          };
        })
      };
    }
  },
  {
    name: "run_evidence_research",
    description: "用用户提供的真实证据生成品类机会或竞品研究，并保存证据链和 14 天策略。只接受 category_opportunity 或 product_competitor；没有证据不能运行。该写入和 Credits 操作必须先展示确认卡。",
    parameters: {
      type: "object",
      properties: {
        missionType: { type: "string", enum: ["category_opportunity", "product_competitor"] },
        title: { type: "string" },
        question: { type: "string" },
        subjects: { type: "array", minItems: 1, maxItems: 20, items: { type: "string" } },
        evidence: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              sourceType: { type: "string", enum: ["first_party_analytics", "licensed_provider", "public_web", "manual_observation"] },
              title: { type: "string" },
              url: { type: "string" },
              observedAt: { type: "string" },
              excerpt: { type: "string" },
              reliability: { type: "string", enum: ["measured", "reported", "observed"] }
            },
            required: ["id", "sourceType", "title", "excerpt", "reliability"]
          }
        },
        locale: { type: "string", enum: ["zh", "en"] }
      },
      required: ["missionType", "title", "question", "subjects", "evidence"]
    },
    mutates: true,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const parsed = agentResearchMissionInputSchema.parse(args);
      const { locale, ...researchInput } = parsed;
      const { data: program, error: programError } = await ctx.admin
        .from("operating_programs")
        .select("id, offer, audience, objective, qualified_lead_rule, watchlist, baseline")
        .eq("user_id", ctx.userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (programError) throw programError;

      const missionId = crypto.randomUUID();
      const mission = {
        ...researchInput,
        operatingProgramId: program?.id ?? null
      };
      const { error: insertError } = await ctx.admin.from("research_missions").insert({
        id: missionId,
        user_id: ctx.userId,
        operating_program_id: mission.operatingProgramId,
        platform: "xiaohongshu",
        mission_type: mission.missionType,
        title: mission.title,
        question: mission.question,
        subjects: mission.subjects,
        evidence: mission.evidence,
        status: "collecting"
      });
      if (insertError) throw insertError;

      const ready = await generateResearchDecisionForMission({
        admin: ctx.admin,
        userId: ctx.userId,
        plan: ctx.plan,
        missionId,
        mission,
        program: program as Record<string, unknown> | null,
        locale,
        billingSource: "agent_research"
      });
      return {
        researchMission: ready,
        workbenchUrl: "/workbench"
      };
    }
  },
  {
    name: "investigate_social_account",
    description: "像资深营销专家一样调查小红书、X/Twitter、Reddit 或 LinkedIn 账号为什么低阅读、疑似限流、内容被移除或账号被封。用户提供账号主页、Post 原文、后台数据、平台通知或截图时优先调用：输出证据等级、四层健康扫描、Post 限流词/高风险表达、可证伪根因、立即行动与 Workbench 执行处方。低阅读本身不得判定为限流；命中风险词也不等于限流；没有明确平台通知不得确认封禁。小红书分享短链会由服务端解析出账号主页；若返回「分享链接无效或已过期」或「链接指向笔记」，引导用户重新复制主页分享链接。",
    parameters: {
      type: "object",
      properties: {
        accountUrl: { type: "string", description: "小红书、X/Twitter、Reddit 或 LinkedIn 的账号主页链接；小红书 xhslink 分享短链也可以；有账号截图时可不填" },
        platform: { type: "string", enum: ["xiaohongshu", "x", "reddit", "linkedin"], description: "已知的平台；截图可识别时可不填" },
        concern: {
          type: "string",
          enum: ["general", "low_reach", "suspected_restriction", "suspended", "content_removed"],
          description: "用户最关心的问题，默认 general"
        },
        accountContext: { type: "string", description: "账号定位、近期操作或异常发生时间等用户补充背景，可选" },
        analyticsText: { type: "string", description: "用户从创作中心/Analytics/账号通知中粘贴的原文，可选" },
        posts: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "Post 链接，可选" },
              title: { type: "string", description: "Post 标题，可选" },
              text: { type: "string", description: "需要扫描限流词与高风险表达的 Post 原文" }
            },
            required: ["text"]
          },
          description: "最多 5 条需要逐条诊断的 Post 原文"
        },
        imageUrls: { type: "array", items: { type: "string" }, description: "本轮上传的主页、数据后台或处罚通知截图 URL，可选" },
        locale: { type: "string", enum: ["zh", "en"], description: "报告语言，默认 zh" }
      },
      required: []
    },
    mutates: false,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const input = accountInvestigationInputSchema.parse({
        accountUrl: args.accountUrl,
        platform: args.platform,
        concern: args.concern ?? "general",
        accountContext: args.accountContext,
        analyticsText: args.analyticsText,
        posts: args.posts ?? [],
        // Models can occasionally place a private attachment UUID in this
        // URL-only field. Ignore that unusable reference when a profile link
        // or transcribed screenshot evidence is already available, instead of
        // failing the entire diagnosis and forcing a duplicate retry.
        imageUrls: normalizeAgentImageUrls(args.imageUrls),
        locale: args.locale ?? "zh"
      });
      const investigation = await investigateSocialAccount(input, ctx);
      const { error } = await ctx.admin.from("account_investigations").insert({
        user_id: ctx.userId,
        platform: investigation.platform,
        account_url: investigation.accountUrl,
        concern: input.concern,
        case_state: investigation.report.caseState,
        confidence: investigation.report.confidence,
        evidence_level: investigation.evidenceLevel,
        collection_method: investigation.collectionMethod,
        evidence_summary: {
          publicEvidence: investigation.publicEvidence,
          browserHandoff: investigation.browserHandoff
        },
        report: investigation.report,
        measured_at: investigation.publicEvidence.capturedAt
      });
      if (error) {
        console.error("[agent] Failed to persist account investigation:", JSON.stringify(error));
      }
      return {
        investigation,
        snapshotSaved: !error,
        evidence: [buildInvestigationEvidence(investigation)]
      };
    }
  },
  {
    name: "diagnose_xiaohongshu",
    description: "对用户的小红书账号进行诊断，基于用户粘贴的创作中心数据文本和/或上传的截图 URL，产出结构化诊断报告（评分、问题、行动建议、内容建议）。小红书无公开 API，必须依赖用户粘贴/截图。",
    parameters: {
      type: "object",
      properties: {
        pastedData: { type: "string", description: "用户从小红书创作中心粘贴的原始文本" },
        imageUrls: { type: "array", items: { type: "string" }, description: "用户上传的截图公网 URL 列表" },
        accountDescription: { type: "string", description: "用户对账号定位/领域的简单描述，可选" }
      }
    },
    mutates: false,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const pastedData = args.pastedData as string | undefined;
      const imageUrls = (args.imageUrls as string[] | undefined) ?? [];
      const accountDescription = args.accountDescription as string | undefined;
      if (!pastedData && imageUrls.length === 0) {
        return {
          needsInput: true,
          message: "请粘贴小红书创作中心的数据文本，或上传主页/笔记数据的截图，我才能给出诊断。"
        };
      }
      const report = await diagnoseXiaohongshuAccount({ pastedData, imageUrls, accountDescription }, ctx);
      const metrics = normalizeXhsAccountMetrics(report.metrics);
      const { error: snapshotError } = await ctx.admin.from("account_performance_snapshots").insert({
        user_id: ctx.userId,
        platform: "xiaohongshu",
        impressions: metrics.impressions,
        views: metrics.views,
        cover_click_rate: metrics.coverClickRate,
        average_view_seconds: metrics.averageViewSeconds,
        likes: metrics.likes,
        comments: metrics.comments,
        saves: metrics.saves,
        shares: metrics.shares,
        follower_growth: metrics.followerGrowth,
        profile_visits: metrics.profileVisits,
        report,
        source: imageUrls.length > 0 ? (pastedData ? "screenshot_and_text" : "screenshot") : "pasted_text",
        measured_at: new Date().toISOString()
      });
      if (snapshotError) {
        console.error("[agent] Failed to persist account performance snapshot:", JSON.stringify(snapshotError));
      }
      return { report, snapshotSaved: !snapshotError };
    }
  },
  {
    name: "analyze_account_performance",
    description: "主动读取用户已经回流到 Finfold 的真实发布数据，按曝光、点击、停留、收藏分享和关注转化定位当前漏斗断点。讨论下一步发什么、为什么没流量或账号增长时，应优先调用。",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", description: "优先分析的平台 id，可选，例如 xiaohongshu、linkedin、x" },
        locale: { type: "string", enum: ["zh", "en"], description: "报告语言，默认 zh" }
      }
    },
    mutates: false,
    requiresAgentTools: false,
    async execute(args, ctx) {
      const parsedPlatform = typeof args.platform === "string"
        ? platformIdSchema.safeParse(args.platform)
        : null;
      const locale = args.locale === "en" ? "en" : "zh";
      const briefing = await loadGrowthBriefing(
        ctx.admin,
        ctx.userId,
        locale,
        parsedPlatform?.success ? parsedPlatform.data : undefined
      );
      return {
        briefing,
        evidence: [buildBriefingEvidence(briefing, briefing.dailyImpressions, locale)]
      };
    }
  },
  {
    name: "get_weekly_growth_report",
    description: "读取基于真实账号快照或前后两个 7 天发布周期生成的增长周报，包含显著变化、异常证据和单变量下一步。用户问这周表现、为什么突然下降、最近有什么异常时优先调用。",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", description: "可选平台 id，例如 xiaohongshu、linkedin、x" },
        locale: { type: "string", enum: ["zh", "en"], description: "报告语言，默认 zh" }
      }
    },
    mutates: false,
    requiresAgentTools: false,
    async execute(args, ctx) {
      const parsedPlatform = typeof args.platform === "string"
        ? platformIdSchema.safeParse(args.platform)
        : null;
      const report = await loadWeeklyGrowthReport(
        ctx.admin,
        ctx.userId,
        args.locale === "en" ? "en" : "zh",
        parsedPlatform?.success ? parsedPlatform.data : undefined
      );
      return { report, evidence: [buildWeeklyReportEvidence(report)] };
    }
  },
  {
    name: "analyze_content_readiness",
    description: "读取用户最近的真实内容草稿，按平台原生钩子、首屏兑现、收藏价值、证据、转化和可读性做发布前判断，并给出应该进入的内容 Skill。值班队列提示审核草稿、用户问内容能不能发或为什么内容效果差时优先调用。",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", description: "可选平台 id，例如 xiaohongshu、wechat" },
        locale: { type: "string", enum: ["zh", "en"], description: "报告语言，默认 zh" }
      }
    },
    mutates: false,
    requiresAgentTools: false,
    async execute(args, ctx) {
      const parsedPlatform = typeof args.platform === "string"
        ? platformIdSchema.safeParse(args.platform)
        : null;
      const locale = args.locale === "en" ? "en" : "zh";
      const [{ data, error }, missions] = await Promise.all([
        ctx.admin
          .from("kit_outputs")
          .select("id, kit_id, platform, title, body, cta, final_body, publish_status, created_at")
          .eq("user_id", ctx.userId)
          .order("created_at", { ascending: false })
          .limit(30),
        listGrowthMissions(ctx.admin, ctx.userId, 10).catch(() => [])
      ]);
      if (error) throw error;
      const platform = parsedPlatform?.success ? parsedPlatform.data : undefined;
      const row = (data ?? []).find((candidate) =>
        (!platform || candidate.platform === platform)
        && ["draft", "planned"].includes(String(candidate.publish_status ?? "draft"))
      );
      if (!row) {
        return {
          needsDraft: true,
          message: locale === "zh"
            ? "当前没有可审核的草稿。先生成一条内容，Finfold 会在发布前主动判断它是否过线。"
            : "There is no draft to review yet. Generate one and Finfold will run the pre-publish gate."
        };
      }
      const activeMission = missions.find((mission) =>
        mission.platform === row.platform && ["accepted", "draft_ready"].includes(mission.status)
      );
      const report = assessContentReadiness({
        platform: platformIdSchema.parse(row.platform),
        title: String(row.title ?? ""),
        body: String(row.body ?? ""),
        finalBody: row.final_body ? String(row.final_body) : undefined,
        cta: String(row.cta ?? "")
      }, locale, activeMission);
      return {
        output: {
          id: row.id,
          kitId: row.kit_id,
          platform: row.platform,
          title: row.title,
          publishStatus: row.publish_status
        },
        mission: activeMission
          ? {
              id: activeMission.id,
              primaryMetric: activeMission.primaryMetric,
              hypothesis: activeMission.hypothesis
            }
          : null,
        report,
        reviewUrl: `/kits/${row.kit_id}`
      };
    }
  },
  {
    name: "get_duty_queue",
    description: "读取智能体后台巡检后持久化的唯一下一步和最近值班记录，包括紧急程度、证据、完成状态和操作入口。用户问今天做什么、目前卡在哪里或智能体最近完成了什么时优先调用。",
    parameters: { type: "object", properties: {} },
    mutates: false,
    requiresAgentTools: false,
    async execute(_args, ctx) {
      const [item, items] = await Promise.all([
        getOpenPatrolItem(ctx.admin, ctx.userId),
        listPatrolItems(ctx.admin, ctx.userId, 8)
      ]);
      return {
        item,
        recent: items
          .filter((candidate) => candidate.status !== "open")
          .slice(0, 5)
          .map((candidate) => ({
            title: candidate.title,
            status: candidate.status,
            completedAt: candidate.completedAt
          }))
      };
    }
  },
  {
    name: "plan_next_content_experiment",
    description: "基于用户真实表现数据生成下一轮单变量内容实验：给出主假设、核心指标、三个差异化策略方向和可直接带入工作台的创作 brief。不要在没有先分析真实数据时凭空调用。",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", description: "目标平台 id，可选，例如 xiaohongshu" },
        locale: { type: "string", enum: ["zh", "en"], description: "输出语言，默认 zh" }
      }
    },
    mutates: false,
    requiresAgentTools: false,
    async execute(args, ctx) {
      const parsedPlatform = typeof args.platform === "string"
        ? platformIdSchema.safeParse(args.platform)
        : null;
      const locale = args.locale === "en" ? "en" : "zh";
      const briefing = await loadGrowthBriefing(
        ctx.admin,
        ctx.userId,
        locale,
        parsedPlatform?.success ? parsedPlatform.data : undefined
      );
      if (!briefing.experiment) {
        return {
          needsMetrics: true,
          missingData: briefing.missingData,
          message: locale === "zh"
            ? "先补一篇真实发布数据，再制定实验，避免凭感觉改内容。"
            : "Add one measured post before planning an experiment so the next move is evidence-based."
        };
      }
      return { briefing, experiment: briefing.experiment };
    }
  },
  {
    name: "start_growth_mission",
    description: "把已经基于真实数据规划好的下一轮实验正式接受为可追踪的 Growth Mission。只有用户明确说开始、接受或执行这个任务时才调用；不要仅因用户要求分析就创建任务。",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", description: "目标平台 id，可选，例如 xiaohongshu" },
        locale: { type: "string", enum: ["zh", "en"], description: "任务语言，默认 zh" }
      }
    },
    mutates: true,
    requiresAgentTools: false,
    async execute(args, ctx) {
      const parsedPlatform = typeof args.platform === "string"
        ? platformIdSchema.safeParse(args.platform)
        : null;
      const locale = args.locale === "en" ? "en" : "zh";
      const result = await createGrowthMission(
        ctx.admin,
        ctx.userId,
        locale,
        parsedPlatform?.success ? parsedPlatform.data : undefined
      );
      if (!result.mission) {
        return {
          needsMetrics: true,
          briefing: result.briefing,
          message: locale === "zh"
            ? "先补一篇真实发布数据，再启动可判定的增长任务。"
            : "Add one measured result before starting a mission that can be judged."
        };
      }
      return {
        mission: result.mission,
        existing: result.existing,
        workbenchUrl: `/workbench?missionId=${result.mission.id}&platform=${result.mission.platform}&idea=${encodeURIComponent(result.mission.workbenchIdea)}`
      };
    }
  },
  {
    name: "get_recent_kits",
    description: "读取用户最近生成的内容 kit 标题和平台列表，用于了解用户近期的创作方向。",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "返回条数，默认 5" } }
    },
    mutates: false,
    requiresAgentTools: false,
    async execute(args, ctx) {
      const limit = Math.min(Number(args.limit) || 5, 20);
      const { data } = await ctx.admin
        .from("content_kits")
        .select("id, idea_text, platforms, status, created_at")
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return { kits: data ?? [] };
    }
  },
  {
    name: "prepare_platform_content_package",
    description: "为公众号或 X 准备一份已确认后才会生成的原生内容包。公众号输出长文、Markdown/HTML、封面摘要和发布交接包；X 输出可直接粘贴的编号线程与媒体位置。此工具只创建待生成工作流，不会公开发布。调用前先读取品牌记忆；复杂请求先给出简短执行计划。",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["wechat", "x"] },
        ideaText: { type: "string", description: "已核实的内容事实、目标和约束，至少 20 个字符" },
        goal: { type: "string", enum: growthGoals.map((goal) => goal.id) },
        persona: { type: "string", enum: personas.map((persona) => persona.id) },
        language: {
          type: "string",
          enum: ["auto", "zh", "en", "bilingual"],
          description: "内容语言。其他语言一律传 auto，并在 ideaText 中明确保留目标语言（如 Polish、ไทย、العربية）。"
        }
      },
      required: ["platform", "ideaText", "goal", "persona"]
    },
    mutates: true,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const request = agentContentWorkflowRequestSchema.parse(args);
      const workflow = await createAgentContentWorkflow(ctx.admin, ctx.userId, request);
      return {
        contentWorkflow: {
          id: workflow.id,
          platform: workflow.platform,
          stage: workflow.stage,
          status: workflow.status
        },
        generationRequest: buildAgentContentWorkflowGenerationRequest(workflow),
        message: "The content package is ready to generate after this confirmation."
      };
    }
  },
  {
    name: "ask_user",
    description: "只有任务确实被一个关键选择阻塞时才调用本工具。每轮只能问 1 个问题，提供 2-4 个具体选项并标注推荐项；用户点一个选项后会自动续跑。禁止在正文里列编号让用户打字，禁止连续多轮追问，能从品牌记忆、上下文或推荐默认值推断时直接继续执行。",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          minItems: 1,
          maxItems: 1,
          description: "只问 1 个真正阻塞任务的问题",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "问题短标识，如 platform" },
              question: { type: "string", description: "用户能直接看懂的问题，最多 160 字符" },
              options: {
                type: "array",
                minItems: 2,
                maxItems: 4,
                description: "选项顺序：英文对话把国际平台（X、Instagram、TikTok、LinkedIn 等）排在前、中国平台（小红书、知乎、微信公众号等）排在后；中文对话顺序相反",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "选项文案，最多 60 字符" },
                    description: { type: "string", description: "一句话解释该选项，可选" }
                  },
                  required: ["label"]
                }
              },
              multiple: { type: "boolean", description: "允许多选时为 true" },
              recommended: { type: "string", description: "推荐选项的 label，必须是 options 之一" }
            },
            required: ["id", "question", "options"]
          }
        }
      },
      required: ["questions"]
    },
    mutates: false,
    requiresAgentTools: false,
    async execute(args) {
      const parsed = askUserRequestSchema.safeParse(args);
      if (!parsed.success) {
        return {
          error: "ask_user 参数不合法：每轮只能问 1 个问题，提供 2-4 个选项，recommended 必须是选项之一。"
        };
      }
      return {
        askedUser: true,
        questions: parsed.data.questions,
        note: "问题已经以可点选卡片呈现给用户，本轮到此结束；等待用户的点选作为新消息返回后直接继续任务，不要再调用 ask_user，也不要重复同一个问题。"
      };
    }
  },
  {
    name: "delegate_parallel",
    description: "仅当一个复杂请求包含 2-3 个可独立并行的只读分析视角时，委派专业子智能体并行完成，每组视角一个（核对资料/梳理策略/适配平台/检查风险）。单步改写、翻译、问答、设置修改、确定计算、或后一步依赖前一步结果的任务禁止调用。每个请求最多调用一次。子任务只描述分析目标，严禁包含发布、修改或写入要求。",
    parameters: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "用户目标的一句话概括，最多 240 字符"
        },
        context: {
          type: "string",
          description: "从已知资料中为子任务裁剪的关键上下文：品牌要点、数据摘要、平台事实。不要放完整对话历史，最多 2000 字符"
        },
        language: {
          type: "string",
          description: "输出语言的 BCP-47 标签或语言名称，如 pl-PL、ja、العربية。省略时自动跟随用户目标的语言"
        },
        tasks: {
          type: "array",
          minItems: 2,
          maxItems: 3,
          description: "2-3 个互不重复的并行分析视角",
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: [...SUBAGENT_KINDS],
                description: "专业视角类型"
              },
              label: {
                type: "string",
                description: "用户能理解的任务名称，最多 24 字符，如「核对资料」"
              },
              instruction: {
                type: "string",
                description: "该视角的具体分析要求（只读），最多 1200 字符"
              },
              deliverable: {
                type: "string",
                description: "该视角应交付什么，最多 240 字符"
              }
            },
            required: ["kind", "label", "instruction", "deliverable"]
          }
        }
      },
      required: ["goal", "tasks"]
    },
    mutates: false,
    requiresAgentTools: false,
    async execute(args, ctx) {
      return executeDelegateParallelTool(args, ctx);
    }
  }
];

export const AGENT_TOOLS: AgentToolDefinition[] = [
  ...CORE_AGENT_TOOLS,
  ...XHS_AGENT_TOOLS,
  ...OPPORTUNITY_RADAR_TOOLS,
  ...SOCIAL_INTELLIGENCE_TOOLS
];

export function getAgentTool(name: string): AgentToolDefinition | undefined {
  return AGENT_TOOLS.find((tool) => tool.name === name);
}

/** OpenAI-compatible `tools` array for the chat/completions request body.
 * delegate_parallel only appears for plans entitled to subagent delegation;
 * without a plan argument it stays hidden (safe fallback). */
export function buildOpenAiToolsPayload(plan?: PlanId | "free"): Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
  return AGENT_TOOLS
    .filter((tool) => tool.exposedToModel !== false)
    .filter((tool) => tool.name !== "delegate_parallel"
      || (plan !== undefined && isSubagentDelegationEnabled(plan)))
    .map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters }
    }));
}
