import { z } from "zod";
import type { AgentToolDefinition } from "@/lib/agent/types";
import {
  buildTopicOpportunityGenerationRequest,
  loadOpportunityRadar,
  loadTopicOpportunity
} from "@/lib/trends/service";

const opportunityIdSchema = z.string().uuid();

export const OPPORTUNITY_RADAR_TOOLS: AgentToolDefinition[] = [
  {
    name: "list_topic_opportunities",
    description: "读取当前账号最近 24 小时最值得行动的机会雷达结果。只返回有来源、采集时间和匹配依据的真实机会；如果没有信号或缺少运营画像，要如实说明。",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", minimum: 1, maximum: 10, description: "返回数量，默认 5" }
      }
    },
    mutates: false,
    requiresAgentTools: false,
    async execute(args, ctx) {
      const limit = Math.min(10, Math.max(1, Math.floor(Number(args.limit) || 5)));
      const radar = await loadOpportunityRadar(ctx.admin, ctx.userId, "24h", limit);
      return {
        opportunities: radar.opportunities.map((item) => ({
          id: item.id,
          title: item.title,
          matchScore: item.matchScore,
          lifecycle: item.lifecycle,
          whyNow: item.whyNow,
          whyYou: item.whyYou,
          recommendedPlatform: item.recommendedPlatform,
          mainAngle: item.mainAngle,
          evidence: item.evidence.map((source) => ({
            source: source.sourceLabel,
            title: source.title,
            url: source.url,
            capturedAt: source.capturedAt
          }))
        })),
        collectionStatus: radar.collectionStatus,
        latestCollectionAt: radar.latestCollectionAt,
        latestSignalAt: radar.latestSignalAt,
        sourceCount: radar.sourceCount,
        radarUrl: "/operations/opportunities"
      };
    }
  },
  {
    name: "prepare_topic_opportunity",
    description: "在用户明确选择机会后，确认并准备一份可交给内容生成管线的草稿请求。此工具不会发布内容；调用会先进入 Finfold 的确认卡，只有用户确认后才执行。",
    parameters: {
      type: "object",
      properties: {
        opportunityId: { type: "string", description: "list_topic_opportunities 返回的机会 id" }
      },
      required: ["opportunityId"]
    },
    mutates: true,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) {
        return { upgradeRequired: true, message: "Starter 或以上套餐才能让 Agent 准备机会草稿。" };
      }
      const opportunityId = opportunityIdSchema.parse(args.opportunityId);
      const opportunity = await loadTopicOpportunity(ctx.admin, ctx.userId, opportunityId, { personalize: true });
      if (!opportunity || opportunity.feedback || opportunity.preparationStatus === "ready") {
        return {
          unavailable: true,
          message: opportunity?.contentKitId
            ? "这个机会已经生成过内容包。"
            : "这个机会已不可用，请重新查看机会雷达。",
          contentKitId: opportunity?.contentKitId ?? null
        };
      }
      const idempotencyKey = `agent-topic:${opportunityId}`;
      const { data: claims, error } = await ctx.admin.rpc("claim_topic_opportunity_preparation", {
        p_opportunity_id: opportunityId,
        p_user_id: ctx.userId,
        p_idempotency_key: idempotencyKey
      });
      if (error) throw error;
      const claim = Array.isArray(claims) ? claims[0] : claims;
      if (!["claimed", "replayed"].includes(String(claim?.outcome))) {
        throw new Error("This opportunity could not be confirmed.");
      }
      return {
        opportunity: {
          id: opportunity.id,
          title: opportunity.title,
          matchScore: opportunity.matchScore,
          recommendedPlatform: opportunity.recommendedPlatform
        },
        idempotencyKey,
        generationRequest: await buildTopicOpportunityGenerationRequest(ctx.admin, ctx.userId, opportunity),
        radarUrl: `/operations/opportunities/${opportunity.id}`,
        message: "机会已确认并准备好生成请求；尚未发布任何内容。"
      };
    }
  }
];
