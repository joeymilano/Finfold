import { describe, expect, it } from "vitest";
import { AGENT_LANGUAGE_POLICY } from "@/lib/agent/context";

describe("Agent language policy", () => {
  it("separates UI locale from the user's conversation and delivery language", () => {
    expect(AGENT_LANGUAGE_POLICY).toContain("用户最新一条消息的主要自然语言");
    expect(AGENT_LANGUAGE_POLICY).toContain("中英文界面设置不得强制改变对话语言");
    expect(AGENT_LANGUAGE_POLICY).toContain("其他语言就传 auto");
    expect(AGENT_LANGUAGE_POLICY).toContain("标题、正文、行动引导、备注和解释保持同一种目标语言");
  });
});
