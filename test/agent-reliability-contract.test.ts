import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Agent reliability deployment contract", () => {
  it("loads the newest bounded history and restores it chronologically", () => {
    const route = source("app/api/agent/chat/route.ts");
    expect(route).toContain('.order("created_at", { ascending: false })');
    expect(route).toMatch(/historyRowsToReplayMessages\(\[\.\.\.\(data \?\? \[\]\)\]\.reverse\(\)\)/);
    expect(route).toContain("errorCode: terminalError.code");
  });

  it("keeps private historical file URLs out of orchestration context", () => {
    const context = source("lib/agent/session-context.ts");
    expect(context).toContain("Private signed URLs are deliberately omitted");
    expect(context).not.toContain("attachment.url");
    expect(context).not.toContain("storagePath=");
  });

  it("keeps Qwen multimodal and DeepSeek fallback behind bounded GLM plan priority", () => {
    for (const configPath of ["wrangler.toml", "wrangler.staging.toml"]) {
      const config = source(configPath);
      expect(config).toContain('"name":"qwen-free-latest"');
      expect(config).toContain('"name":"qwen-free-snapshot"');
      expect(config).toContain('"name":"qwen-token-plan"');
      expect(config).toContain('"base":"https://dashscope.aliyuncs.com/compatible-mode/v1"');
      expect(config).toContain('"keyEnv":"DASHSCOPE_FREE_API_KEY"');
      expect(config).toContain('"haiku":"qwen3.8-flash"');
      expect(config).toContain('"haiku":"qwen3.7-flash-2026-07-15"');
      expect(config).toContain('"vision":"qwen3.8-flash"');
      expect(config).toContain('"supportsVideo":true');
      expect(config).not.toContain('"haiku":"qwen3.7-flash"');
      expect(config).toContain('"enableThinking":false');
      expect(config).toContain('"haiku":"deepseek-v4-flash"');
      expect(config).toContain('"sonnet":"deepseek-v4-pro"');
      expect(config).toContain('"opus":"deepseek-v4-pro"');
      expect(config).not.toContain('"name":"glm');
      expect(config).toContain('ZHIPU_API_MODE = "coding-plan"');
      expect(config).toContain('ZHIPU_API_BASE = "https://open.bigmodel.cn/api/coding/paas/v4"');
      expect(config).toContain('ZHIPU_PRIORITY_EXPIRES_AT = "2026-10-07T00:00:00+08:00"');
      expect(config).toContain('ZHIPU_MODEL = "glm-5.3-flash"');
      expect(config).toContain('ZHIPU_MODEL_STRONG = "glm-5.3"');
      expect(config).not.toContain('OPENAI_NEXT');
      // DeepSeek sits before the purchased Qwen workspace route, and that
      // route is hard-capped at 10 CNY per calendar month.
      expect(config.indexOf('"name":"deepseek"')).toBeGreaterThan(-1);
      expect(config.indexOf('"name":"deepseek"')).toBeLessThan(config.indexOf('"name":"qwen-token-plan"'));
      expect(config).toContain('"monthlyBudgetCny":10');
      expect(config).toContain(`ZHIPU_ENABLED = "${configPath === "wrangler.toml" ? "true" : "false"}"`);
      expect(config).toContain('IMAGE_DASHSCOPE_FREE_PRO_MODEL = "qwen-image-3.0-pro"');
      expect(config).toContain('IMAGE_DASHSCOPE_FREE_MODEL = "qwen-image-3.0"');
      expect(config).toContain('IMAGE_DASHSCOPE_QWEN_PRO_MODEL = "qwen-image-3.0-pro"');
      expect(config).toContain('IMAGE_DASHSCOPE_QWEN_MODEL = "qwen-image-3.0"');
      expect(config).toContain('IMAGE_DASHSCOPE_WAN_PRO_MODEL = "wan2.7-image-pro"');
      expect(config).toContain('IMAGE_DASHSCOPE_MODEL = "wan2.7-image"');
      expect(config).toContain('IMAGE_WORKERS_AI_COVER_MODEL = "@cf/black-forest-labs/flux-2-klein-9b"');
      expect(config).toContain('IMAGE_WORKERS_AI_MODEL = "@cf/black-forest-labs/flux-2-klein-4b"');
    }
  });

  it("offers explicit retry while preserving the failed turn's evidence", () => {
    const rail = source("components/app-shell/GlobalAgentRail.tsx");
    const workspace = source("components/app-shell/AgentAutomationCenter.tsx");
    expect(rail).toContain("重试本轮（保留附件）");
    expect(workspace).toContain("重试本轮（保留资料）");
    expect(rail).toContain('errorEvent.code === "PROVIDER_BUSY"');
    expect(workspace).toContain('errorEvent.code === "PROVIDER_BUSY"');
  });

  it("asks the model to speak like an operating partner instead of a report template", () => {
    const context = source("lib/agent/context.ts");
    expect(context).toContain("像一位正在替用户工作的资深运营专家说话");
    expect(context).toContain("工具卡或专业报告已经展示细节时，对话只总结结论、局限和下一步");
    expect(context).toContain("不得输出原始格式说明、代码围栏、伪表格");
    expect(context).toContain("不得停下来要求用户回复“继续”");
    expect(context).toContain("不得包装成已证实事实");
    expect(context).toContain("不得声称“无法访问外部网站”");
    expect(context).toContain("网站不是社交账号，但它是有效的增长诊断入口");
    expect(context).toContain("公开主页取证与账号健康专门诊断支持小红书、X/Twitter、Reddit");
  });

  it("prefetches user-supplied public URLs for both direct and fallback model paths", () => {
    const route = source("app/api/agent/chat/route.ts");
    expect(route).toContain("readCurrentTurnPublicWeb(body.message)");
    expect(route).toContain("appendCurrentPublicWebEvidence");
    expect(route).toMatch(/sendLettaMessage\([\s\S]*messageWithPublicWeb/);
  });
});
