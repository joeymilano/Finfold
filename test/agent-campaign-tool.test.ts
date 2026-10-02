import { describe, expect, it } from "vitest";
import { getAgentTool } from "@/lib/agent/tools";

describe("end-to-end Xiaohongshu campaign tool", () => {
  it("is exposed as one automatic preparation capability with no direct mutation", () => {
    const tool = getAgentTool("prepare_xhs_campaign");
    expect(tool).toBeDefined();
    expect(tool?.mutates).toBe(false);
    expect(tool?.requiresAgentTools).toBe(true);
    expect(tool?.parameters).toMatchObject({
      required: ["objective", "realDetails"]
    });
    expect(tool?.description).toContain("一次性准备");
    expect(tool?.description).toContain("不会直接发布");
  });
});
