import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountInvestigationReportCard } from "@/components/app-shell/AccountInvestigationReportCard";
import type { AccountInvestigation } from "@/lib/agent/account-investigation";

function investigation(caseState: AccountInvestigation["report"]["caseState"] = "low_reach"): AccountInvestigation {
  const blocked = caseState === "account_suspended" || caseState === "confirmed_enforcement";
  return {
    reportId: "FF-X-20260811-ABC123",
    reportVersion: "1.1",
    generatedAt: "2026-08-11T08:30:00.000Z",
    platform: "x",
    accountUrl: "https://x.com/example",
    evidenceLevel: blocked ? "platform_notice" : "creator_analytics",
    publicEvidence: {
      platform: "x",
      accountUrl: "https://x.com/example",
      captureMethod: "public_web",
      capturedAt: "2026-08-11T08:30:00.000Z",
      httpStatus: 200,
      pageTitle: "Example / X",
      signals: [{ kind: "profile_visible", detail: "Public profile is reachable." }],
      limitations: []
    },
    report: {
      headline: blocked ? "账号处罚已确认，先完成官方恢复" : "阅读下降更像内容转化问题，不是已证实限流",
      caseState,
      confidence: "medium",
      confidenceReason: "结论来自最近五条内容和账号后台数据。",
      executiveSummary: "推荐流量没有跨内容归零，最值得先验证的是开头承诺与主页定位是否一致。",
      evidence: [{ finding: "最近五条内容曝光下降，但推荐流量仍存在。", source: "creator_analytics", strength: "strong" }],
      hypotheses: [{
        cause: "开头承诺不够具体",
        category: "content",
        likelihood: "high",
        why: "用户看到主题，但前两句没有交代可获得的具体结果。",
        verifyNext: "保持主题不变，只测试三种开头。"
      }],
      contentRisks: [{
        postIndex: 1,
        excerpt: "保证三天涨粉一万",
        category: "misleading_claim",
        severity: "high",
        status: "potential",
        platformBasis: "绝对化结果承诺可能触发审核或降低内容质量信号。",
        why: "没有条件限定，也没有可核验的适用范围。",
        saferRewrite: "分享我们从 0 到一万关注时验证过的三个动作。",
        verifyNext: "保持主题不变，对比改写后的推荐曝光与停留。"
      }],
      recoveryPlan: {
        next24Hours: ["冻结其他变量，保留当前数据快照。"],
        next7Days: ["连续测试三条相同主题内容。"],
        appeal: { needed: false, officialPath: "", draft: "" }
      },
      workbenchPlan: {
        strategy: "先修复最上游的开头承诺，只测试一个变量。",
        actions: [{
          id: "hook_test",
          kind: "controlled_experiment",
          title: "生成三组开头对照实验",
          priority: "now",
          readiness: blocked ? "blocked" : "ready",
          rationale: "开头是当前证据支持度最高的断点。",
          deliverable: "三条可编辑的 X 帖子草稿。",
          successSignal: "比较下一轮三条内容的推荐曝光与互动率。",
          brief: "主题不变，只改变前两句的价值承诺，并保留同一 CTA。",
          agentPrompt: "执行处方并调用 X 内容包 workflow，不得直接发布。"
        }]
      },
      doNotDo: ["不要批量删除内容。"],
      nextEvidence: [],
      recheckCriteria: ["三条内容发布七天后复查。"]
    },
    browserHandoff: {
      required: false,
      reason: "已有账号后台数据。",
      readOnlySteps: [],
      captureChecklist: []
    }
  };
}

describe("AccountInvestigationReportCard", () => {
  it("renders a professional evidence report and sends a Workbench prescription back to Agent", () => {
    const onAskAgent = vi.fn();
    render(<AccountInvestigationReportCard investigation={investigation()} locale="zh" onAskAgent={onAskAgent} />);

    expect(screen.getByLabelText("账号体检报告")).toBeInTheDocument();
    expect(screen.getByText("账号四项")).toBeInTheDocument();
    expect(screen.getByText("先查什么")).toBeInTheDocument();
    expect(screen.getByText("Post 风险词")).toBeInTheDocument();
    expect(screen.getByText("“保证三天涨粉一万”")).toBeInTheDocument();
    expect(screen.getByText("分享我们从 0 到一万关注时验证过的三个动作。")).toBeInTheDocument();
    expect(screen.getByText("直接去改")).toBeInTheDocument();
    expect(screen.getAllByText("证据").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: /让智能体执行：生成三组开头对照实验/ }));
    expect(onAskAgent).toHaveBeenCalledWith("执行处方并调用 X 内容包 workflow，不得直接发布。");
  });

  it("prevents content execution while the account is suspended", () => {
    const onAskAgent = vi.fn();
    render(<AccountInvestigationReportCard investigation={investigation("account_suspended")} locale="zh" onAskAgent={onAskAgent} />);

    const action = screen.getByRole("button", { name: /生成三组开头对照实验：暂缓执行/ });
    expect(action).toBeDisabled();
    fireEvent.click(action);
    expect(onAskAgent).not.toHaveBeenCalled();
  });
});
