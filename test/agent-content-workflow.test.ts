import { describe, expect, it } from "vitest";
import { brandBrainSchema } from "@/lib/brand-brain";
import {
  agentContentWorkflowRequestSchema,
  buildAgentContentWorkflowGenerationRequest,
  buildContentWorkflowCompletionReceipt,
  createAgentContentWorkflow,
  mapAgentContentWorkflow
} from "@/lib/agent/content-workflow";

describe("Agent content workflow", () => {
  const request = agentContentWorkflowRequestSchema.parse({
    platform: "x",
    ideaText: "Explain the exact founder workflow that turned one product update into a useful X thread.",
    goal: "audience-growth",
    persona: "indie-builder",
    language: "en"
  });

  it("builds a canonical one-platform request from the confirmed workflow", () => {
    const generationRequest = buildAgentContentWorkflowGenerationRequest({
      id: "aa59c844-1e9d-46d1-9d64-5f0613a333c0",
      platform: "x",
      request
    }, brandBrainSchema.parse({ brandName: "Finfold" }));

    expect(generationRequest).toMatchObject({
      ideaText: request.ideaText,
      goal: "audience-growth",
      persona: "indie-builder",
      platforms: ["x"],
      language: "en",
      agentContentWorkflowId: "aa59c844-1e9d-46d1-9d64-5f0613a333c0",
      brandBrain: { brandName: "Finfold" }
    });
  });

  it("rejects unsupported platforms before any workflow is written", () => {
    expect(() => agentContentWorkflowRequestSchema.parse({ ...request, platform: "xiaohongshu" })).toThrow();
  });

  it("builds a receipt that only claims the persisted package", () => {
    expect(buildContentWorkflowCompletionReceipt({
      platform: "wechat",
      contentKitId: "c6630d3d-ae5c-4137-bd02-f1e41dcdbd19",
      outputCount: 1,
      persistedAt: "2026-08-06T10:00:00.000Z"
    })).toEqual({
      title: "公众号 内容包已保存",
      summary: "已保存 1 个 公众号 内容输出，尚未对外发布。",
      contentKitId: "c6630d3d-ae5c-4137-bd02-f1e41dcdbd19",
      platform: "wechat",
      outputCount: 1,
      persistedAt: "2026-08-06T10:00:00.000Z"
    });
  });

  it("refuses a new package before it can supersede an in-flight generation", async () => {
    const query = {
      from: () => query,
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({
        data: { id: "aa59c844-1e9d-46d1-9d64-5f0613a333c0", stage: "generating" },
        error: null
      })
    };

    await expect(createAgentContentWorkflow(query as never, "ab6bf654-9d7e-4baf-9acb-7667560c72c1", request))
      .rejects.toThrow("already being generated");
  });

  it("maps persisted workflow receipts for a later Agent session", () => {
    const workflow = mapAgentContentWorkflow({
      id: "aa59c844-1e9d-46d1-9d64-5f0613a333c0",
      platform: "x",
      status: "active",
      stage: "ready",
      request,
      kit_id: "c6630d3d-ae5c-4137-bd02-f1e41dcdbd19",
      generation_request_id: null,
      generation_run_id: "24d6aebf-dfa9-440b-8c31-30c355ff1a70",
      completion_receipt: buildContentWorkflowCompletionReceipt({
        platform: "x",
        contentKitId: "c6630d3d-ae5c-4137-bd02-f1e41dcdbd19",
        outputCount: 3,
        persistedAt: "2026-08-06T10:00:00.000Z"
      }),
      created_at: "2026-08-06T09:00:00.000Z",
      updated_at: "2026-08-06T10:00:00.000Z"
    });

    expect(workflow.completionReceipt?.summary).toContain("尚未对外发布");
    expect(workflow.kitId).toBe("c6630d3d-ae5c-4137-bd02-f1e41dcdbd19");
  });
});