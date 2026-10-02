import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchCenter } from "@/components/app-shell/ResearchCenter";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/components/ui/Panel", () => ({ Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/ui/Tag", () => ({ Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}

afterEach(() => vi.unstubAllGlobals());

describe("ResearchCenter", () => {
  it("exposes the competitor baseline and Finfold's evidence/strategy advantage", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).endsWith("/program")
      ? jsonResponse({ program: { id: "11111111-1111-4111-8111-111111111111", status: "active" } })
      : jsonResponse({ missions: [] })));

    render(<ResearchCenter />);

    expect(await screen.findByRole("heading", { name: "把市场证据变成可执行的运营决策" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /账号诊断/ })).toHaveAttribute("href", "/operations/xiaohongshu");
    expect(screen.queryByRole("button", { name: /达人筛选/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /品类机会/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /商品 \/ 竞品/ })).toBeInTheDocument();
    expect(screen.getByText("每个结论可回看证据")).toBeInTheDocument();
    expect(screen.getByText("继续衔接策略与转化")).toBeInTheDocument();
    expect(screen.getByText("可手动导入 · 仅计为报告证据")).toBeInTheDocument();
    expect(screen.getByText("三类运营研究任务")).toBeInTheDocument();
    expect(screen.getByText(/博主风格学习改由智能体/)).toBeInTheDocument();
  });

  it("requires an explicit decision handoff and sends only the mission id in the URL", async () => {
    const missionId = "1f34c0d0-3124-4ca7-b352-da298139cb74";
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).endsWith("/program")
      ? jsonResponse({ program: null })
      : jsonResponse({
          missions: [{
            id: missionId,
            operatingProgramId: null,
            missionType: "category_opportunity",
            title: "AI 产品设计机会",
            question: "哪些内容机会值得未来十四天优先验证？",
            subjects: ["AI 产品设计"],
            evidence: [{ id: "E1", sourceType: "public_web", title: "观察", excerpt: "公开讨论需要更多真实步骤。", reliability: "observed" }],
            status: "ready",
            decision: {
              executiveSummary: "先验证流程拆解内容。",
              opportunities: [{ title: "流程拆解", rationale: "用户需要步骤。", evidenceIds: ["E1"], confidence: "low" }],
              risks: [],
              strategy: { thesis: "用真实流程回应执行焦虑。", contentPillars: ["流程拆解"], next14Days: ["发布一组内容"], conversionPath: "笔记 → 主页", successMetrics: ["主页访问"] },
              limitations: ["单一来源"]
            },
            createdAt: "2026-08-11T10:00:00.000Z",
            updatedAt: "2026-08-11T10:00:00.000Z"
          }]
        })));

    render(<ResearchCenter />);

    const handoff = await screen.findByRole("link", { name: /确认结论并进入创作台/ });
    expect(handoff).toHaveAttribute(
      "href",
      `/workbench?researchMissionId=${missionId}&platform=xiaohongshu`
    );
    expect(handoff.getAttribute("href")).not.toContain("公开讨论需要更多真实步骤");
  });
});
