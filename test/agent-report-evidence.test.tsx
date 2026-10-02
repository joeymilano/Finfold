import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentMessageContent, renderAgentEvidenceRefs } from "@/components/app-shell/AgentMessageContent";
import { AgentThinkingTrace } from "@/components/app-shell/AgentThinkingTrace";
import { AccountInvestigationReportCard } from "@/components/app-shell/AccountInvestigationReportCard";
import { AgentStepTimeline } from "@/components/report/AgentStepTimeline";
import { EvidenceCard } from "@/components/report/EvidenceCard";
import { ReportChart } from "@/components/report/ReportChart";
import { isV2Report, keepValidEvidenceIds, ReportRenderer } from "@/components/report/ReportRenderer";
import {
  buildFunnelChartFromTotals,
  buildWeeklyReportEvidence,
  extractToolEvidence,
  renumberEvidence,
  type EvidencePayload
} from "@/lib/report/chart-spec";
import type { AccountInvestigation, AccountInvestigationReport } from "@/lib/agent/account-investigation";
import type { WeeklyGrowthReport } from "@/lib/agent/weekly-growth-report";

afterEach(() => {
  vi.restoreAllMocks();
});

const evidence: EvidencePayload = {
  id: "E1",
  toolName: "get_weekly_growth_report",
  titleZh: "对比了本周与上周",
  titleEn: "Compared this week to last",
  source: "creator_analytics",
  capturedAt: "2026-08-19T14:00:00+08:00",
  windowZh: "近 7 天 vs 前 7 天",
  windowEn: "Last 7 days vs previous 7 days",
  metrics: [
    { labelZh: "曝光", labelEn: "Reach", value: "8.2k", deltaPct: -43, tone: "negative" },
    { labelZh: "互动率", labelEn: "Engagement", value: "5.2%", deltaPct: 3, tone: "positive" }
  ],
  rawPreview: [{ key: "曝光", value: "14.3k → 8.2k" }],
  limitationsZh: ["不含自然搜索流量"],
  limitationsEn: ["No organic search traffic"]
};

const v2Report: AccountInvestigationReport = {
  headline: "曝光断崖下跌 43%，分发受限待验证",
  caseState: "suspected_visibility_restriction",
  confidence: "medium",
  confidenceScore: 55,
  confidenceReason: "后台数据完整但缺平台通知",
  executiveSummary: "8 月 12 日起曝光下跌，互动率稳定，符合分发受限特征",
  dataWindow: { from: "2026-08-12", to: "2026-08-19", daysCovered: 7, note: "覆盖一个完整周期" },
  dataSourceCoverage: [
    { source: "creator_analytics", status: "available", impactZh: "曝光与互动数据完整" },
    { source: "platform_notice", status: "missing", impactZh: "无平台通知，处罚只能到待验证级" }
  ],
  keyFindings: [
    { textZh: "曝光 7 天环比 -43%", severity: "critical", evidenceIds: ["E1", "E9"], changePct: -43 },
    { textZh: "互动率保持稳定", severity: "info" }
  ],
  charts: [
    {
      type: "line",
      titleZh: "每日曝光",
      titleEn: "Daily reach",
      series: [{ nameZh: "曝光", nameEn: "Reach", points: [{ x: "08-18", y: 8100 }, { x: "08-19", y: 8600 }] }]
    },
    {
      type: "line",
      titleZh: "停留时长",
      titleEn: "View time",
      series: [{ nameZh: "停留", nameEn: "View time", points: [] }]
    }
  ],
  evidence: [{ finding: "主页可正常打开", source: "public_profile", strength: "strong" }],
  hypotheses: [
    {
      cause: "单篇高风险笔记触发分发复查",
      category: "policy",
      likelihood: "high",
      confidenceScore: 72,
      why: "断崖起点与高风险笔记同日",
      supportingEvidenceIds: ["E1"],
      counterEvidenceIds: ["E1"],
      verifyNext: "删改后对比 48 小时分发"
    },
    {
      cause: "同类内容大盘回落",
      category: "distribution",
      likelihood: "medium",
      confidenceScore: 41,
      why: "平台调研显示同类内容同期回落约一成",
      verifyNext: "对比大盘跌幅差值"
    }
  ],
  actionPlanV2: {
    first24Hours: [{
      textZh: "删改高风险笔记的引流话术",
      expectedImpactZh: "移除触发复查的显性因素",
      verifyMetricZh: "48 小时曝光回升 > 20%",
      workbenchActionId: "act-1"
    }],
    next7Days: [{ textZh: "发布一篇零风险测试笔记", verifyMetricZh: "测试笔记 24h 曝光 ≥ 3000" }],
    next30Days: [{ textZh: "引流内容改用平台原生组件" }]
  },
  recoveryPlan: { next24Hours: [], next7Days: [], appeal: { needed: false, officialPath: "", draft: "" } },
  workbenchPlan: {
    strategy: "先移除风险因素再验证",
    actions: [{
      id: "act-1",
      kind: "content_rebuild",
      title: "重写引流段落",
      priority: "now",
      readiness: "ready",
      rationale: "引流话术命中高风险",
      deliverable: "改写后的全文",
      successSignal: "48 小时曝光回升",
      brief: "保留主体，把引流话术改为平台原生入口，语气与原文一致，控制在原文九成长度。",
      agentPrompt: "重写笔记：移除站外引流话术，改用平台原生组件承接转化。"
    }]
  },
  doNotDo: ["不要立即删除全部笔记"],
  nextEvidence: ["平台通知截图"],
  recheckCriteria: ["48 小时后复查曝光"]
};

const investigation: AccountInvestigation = {
  reportId: "FF-RPT-TEST",
  reportVersion: "2.0",
  generatedAt: "2026-08-19T14:32:00+08:00",
  platform: "xiaohongshu",
  accountUrl: "https://www.xiaohongshu.com/user/test",
  evidenceLevel: "creator_analytics",
  publicEvidence: {
    platform: "xiaohongshu",
    accountUrl: "https://www.xiaohongshu.com/user/test",
    captureMethod: "public_web",
    capturedAt: "2026-08-19T14:00:00+08:00",
    httpStatus: 200,
    pageTitle: "主页",
    signals: [{ kind: "profile_visible", detail: "主页可正常打开" }],
    limitations: []
  },
  report: v2Report,
  browserHandoff: { required: false, reason: "", readOnlySteps: [], captureChecklist: [] }
};

describe("EvidenceCard", () => {
  it("renders source badge, E1 id and delta arrows with tone colors", () => {
    render(<EvidenceCard evidence={evidence} locale="zh" />);
    expect(screen.getByText("后台数据")).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.getByText("▼ -43%")).toHaveClass("text-risk");
    expect(screen.getByText("▲ +3%")).toHaveClass("text-positive");
    expect(screen.getByText("原始数据")).toBeInTheDocument();
    expect(screen.getByText("这个来源看不到什么")).toBeInTheDocument();
    expect(screen.getByText("不含自然搜索流量")).toBeInTheDocument();
  });

  it("renders the English locale copy", () => {
    render(<EvidenceCard evidence={evidence} locale="en" />);
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Raw data")).toBeInTheDocument();
  });
});

describe("ReportChart empty state", () => {
  it("renders an explicit empty state instead of a fake line", () => {
    const { container } = render(
      <ReportChart
        locale="zh"
        spec={{ type: "line", titleZh: "停留时长", titleEn: "View time", series: [{ nameZh: "停留", nameEn: "View time", points: [] }] }}
      />
    );
    expect(screen.getByText("这段时间没有数据")).toBeInTheDocument();
    expect(container.querySelector("svg path")).toBeNull();
  });

  it("renders the English empty state", () => {
    render(
      <ReportChart
        locale="en"
        spec={{ type: "sparkline", titleZh: "趋势", titleEn: "Trend", series: [{ nameZh: "趋势", nameEn: "Trend", points: [{ x: "a", y: 1 }] }] }}
      />
    );
    expect(screen.getByText("No data in this window")).toBeInTheDocument();
  });
});

describe("AgentStepTimeline", () => {
  it("maps tool names to user-language phrases in both locales", () => {
    render(
      <AgentStepTimeline
        locale="zh"
        active={false}
        events={[
          { name: "analyze_account_performance", completed: true },
          { name: "investigate_social_account", completed: false }
        ]}
      />
    );
    expect(screen.getByText(/读取账号表现数据/)).toBeInTheDocument();
    expect(screen.getByText(/检查主页可见性/)).toBeInTheDocument();
    expect(screen.getByText(/分析已暂停，可继续/)).toBeInTheDocument();
  });

  it("renders English phrases and failure reasons", () => {
    render(
      <AgentStepTimeline
        locale="en"
        active={false}
        events={[{ name: "get_weekly_growth_report", completed: true, result: { error: "Provider busy" } }]}
      />
    );
    expect(screen.getByText(/Comparing this week to last/)).toBeInTheDocument();
    expect(screen.getByText(/Provider busy/)).toBeInTheDocument();
  });
});

describe("AgentThinkingTrace collapsed summary", () => {
  const completedStatuses = [{ stage: "composing_response" as const, completed: true }];

  it("shows the collapsed summary once all steps are done and expands on click", () => {
    render(
      <AgentThinkingTrace
        events={completedStatuses}
        active={false}
        locale="zh"
        steps={[
          { name: "analyze_account_performance", completed: true, startedAt: 1_000, completedAt: 3_200 },
          { name: "get_weekly_growth_report", completed: true, startedAt: 3_200, completedAt: 5_400 }
        ]}
      />
    );
    expect(screen.getByText(/分析了 2 项数据 · 用时 4 秒/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看过程" }));
    expect(screen.getByText(/读取账号表现数据/)).toBeInTheDocument();
  });

  it("shows the English collapsed summary", () => {
    render(
      <AgentThinkingTrace
        events={completedStatuses}
        active={false}
        locale="en"
        steps={[{ name: "analyze_account_performance", completed: true, startedAt: 0, completedAt: 2_100 }]}
      />
    );
    expect(screen.getByText(/Analyzed 1 data sources in 2s/)).toBeInTheDocument();
  });
});

describe("ReportRenderer gates and blocks", () => {
  it("renders the cover band, coverage matrix, findings, ranked causes and action plan", () => {
    render(<ReportRenderer investigation={investigation} locale="zh" evidence={[evidence]} />);
    expect(screen.getByText("数据窗口：2026-08-12 至 2026-08-19 · 覆盖 7 天")).toBeInTheDocument();
    expect(screen.getByText("数据源覆盖")).toBeInTheDocument();
    expect(screen.getByText("已取得")).toBeInTheDocument();
    expect(screen.getByText("缺失")).toBeInTheDocument();
    expect(screen.getByText("核心结论")).toBeInTheDocument();
    expect(screen.getByText("曝光 7 天环比 -43%")).toBeInTheDocument();
    expect(screen.getByText("可能的原因")).toBeInTheDocument();
    expect(screen.getByText("支持证据")).toBeInTheDocument();
    expect(screen.getByText("反证")).toBeInTheDocument();
    expect(screen.getByText("行动计划")).toBeInTheDocument();
    expect(screen.getByText("24 小时内")).toBeInTheDocument();
    expect(screen.getByText("7 天内")).toBeInTheDocument();
    expect(screen.getByText("30 天内")).toBeInTheDocument();
    expect(screen.getByText("预期影响")).toBeInTheDocument();
    expect(screen.getAllByText("验证指标").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("48 小时曝光回升 > 20%")).toBeInTheDocument();
    // Ranked causes order: 72% hypothesis first.
    const causes = screen.getAllByText(/高风险笔记|大盘回落/);
    expect(causes[0]).toHaveTextContent("高风险笔记");
  });

  it("drops evidence references that do not resolve to a captured evidence card", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    render(<ReportRenderer investigation={investigation} locale="zh" evidence={[evidence]} />);
    expect(screen.getAllByText("E1").length).toBeGreaterThan(0);
    expect(screen.queryByText("E9")).toBeNull();
    expect(infoSpy).toHaveBeenCalledWith("[evidence_ref_miss]", expect.stringContaining("E9"));
  });

  it("hides a numeric confidence that contradicts its band", () => {
    const inconsistent: AccountInvestigation = {
      ...investigation,
      report: { ...v2Report, confidence: "high", confidenceScore: 30 }
    };
    render(<ReportRenderer investigation={inconsistent} locale="zh" />);
    expect(screen.queryByText(/高置信 · 30/)).toBeNull();
    expect(screen.getByText(/高置信/)).toBeInTheDocument();
  });

  it("shows the numeric confidence when it matches the band", () => {
    render(<ReportRenderer investigation={investigation} locale="zh" />);
    expect(screen.getByText(/中置信 · 55/)).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
  });

  it("runs a workbench action through onAskAgent", () => {
    const onAskAgent = vi.fn();
    render(<ReportRenderer investigation={investigation} locale="zh" onAskAgent={onAskAgent} />);
    fireEvent.click(screen.getByRole("button", { name: /让智能体执行/ }));
    expect(onAskAgent).toHaveBeenCalledWith(expect.stringContaining("重写笔记"));
  });
});

describe("v1 fallback", () => {
  it("detects v1 reports and renders them with the legacy card without errors", () => {
    const v1Report: AccountInvestigationReport = {
      ...v2Report,
      dataWindow: undefined,
      dataSourceCoverage: undefined,
      keyFindings: undefined,
      charts: undefined,
      actionPlanV2: undefined
    };
    expect(isV2Report(v1Report)).toBe(false);
    expect(isV2Report(v2Report)).toBe(true);
    render(
      <AccountInvestigationReportCard
        investigation={{ ...investigation, reportVersion: "1.2", report: v1Report }}
        locale="zh"
      />
    );
    expect(screen.getByText(/账号体检/)).toBeInTheDocument();
  });
});

describe("evidence refs in message prose", () => {
  it("turns [E1] markers into superscript badges", () => {
    const { container } = render(<AgentMessageContent content="曝光下跌了 [E1]，互动率稳定 [E2]" compact />);
    const sups = container.querySelectorAll("sup");
    expect(sups).toHaveLength(2);
    expect(sups[0]).toHaveTextContent("E1");
    expect(sups[1]).toHaveTextContent("E2");
  });

  it("keeps normal code spans untouched", () => {
    expect(renderAgentEvidenceRefs("看 `E1` 和 [E12]")).toBe("看 `E1` 和 `E12`");
    expect(renderAgentEvidenceRefs("没有引用")).toBe("没有引用");
  });
});

describe("chart-spec helpers", () => {
  it("extracts and renumbers tool evidence", () => {
    const extracted = extractToolEvidence({ report: {}, evidence: [evidence, { ...evidence, id: "E1" }] });
    expect(extracted).not.toBeNull();
    expect(renumberEvidence(extracted!).map((item) => item.id)).toEqual(["E1", "E2"]);
    expect(extractToolEvidence({ report: {} })).toBeNull();
  });

  it("maps weekly trend direction to delta tone", () => {
    const weekly = {
      generatedAt: "2026-08-19T14:00:00+08:00",
      platform: "xiaohongshu",
      platformLabel: "小红书",
      mode: "account_snapshots",
      comparisonLabel: "最近 7 天 vs 前 7 天",
      fingerprint: "f",
      headline: "h",
      summary: "s",
      current: samplesOf(8200),
      previous: samplesOf(14300),
      trends: [
        { key: "impressions", label: "曝光", current: 8200, previous: 14300, currentDisplay: "8.2k", previousDisplay: "14.3k", changePercent: -42.7, direction: "down" },
        { key: "cover_click_rate", label: "点击率", current: 5.1, previous: 5.0, currentDisplay: "5.1%", previousDisplay: "5.0%", changePercent: 2, direction: "up" }
      ],
      anomalies: [],
      wins: [],
      nextAction: null,
      missingData: []
    } as unknown as WeeklyGrowthReport;
    const card = buildWeeklyReportEvidence(weekly);
    expect(card.metrics[0].tone).toBe("negative");
    expect(card.metrics[1].tone).toBe("positive");
    expect(card.titleZh).toBe("对比了本周与上周");
  });

  it("keeps only evidence ids captured in this run", () => {
    const { kept, dropped } = keepValidEvidenceIds(["E1", "E9"], [evidence]);
    expect(kept).toEqual(["E1"]);
    expect(dropped).toEqual(["E9"]);
  });
});

describe("ReportChart bar and funnel (P1)", () => {
  it("renders funnel stages with the drop annotated on the break stage", () => {
    render(
      <ReportChart
        locale="zh"
        spec={{
          type: "funnel",
          titleZh: "转化漏斗",
          titleEn: "Conversion funnel",
          series: [{
            nameZh: "漏斗",
            nameEn: "Funnel",
            points: [
              { x: "曝光", y: 10000 },
              { x: "点击", y: 2000, annotatedZh: "断点 -80%", annotatedEn: "Break -80%" },
              { x: "观看", y: 1800 }
            ]
          }]
        }}
      />
    );
    expect(screen.getByText("曝光")).toBeInTheDocument();
    expect(screen.getByText("断点 -80%")).toBeInTheDocument();
    expect(screen.getByText("宽度按首阶段占比")).toBeInTheDocument();
  });

  it("renders bar charts with per-bar values", () => {
    const { container } = render(
      <ReportChart
        locale="zh"
        spec={{
          type: "bar",
          titleZh: "周对比",
          titleEn: "Week compare",
          series: [{ nameZh: "曝光", nameEn: "Reach", points: [{ x: "上周", y: 14300 }, { x: "本周", y: 8200 }] }]
        }}
      />
    );
    expect(container.querySelectorAll("svg rect").length).toBe(2);
    expect(container.querySelectorAll("svg rect")[0].getAttribute("fill")).toContain("action");
  });

  it("renders the empty state for a single-point funnel", () => {
    render(
      <ReportChart
        locale="zh"
        spec={{ type: "funnel", titleZh: "漏斗", titleEn: "Funnel", series: [{ nameZh: "漏斗", nameEn: "Funnel", points: [{ x: "曝光", y: 100 }] }] }}
      />
    );
    expect(screen.getByText("这段时间没有数据")).toBeInTheDocument();
  });
});

describe("buildFunnelChartFromTotals", () => {
  it("annotates the first >=50% drop as the funnel break", () => {
    const spec = buildFunnelChartFromTotals(
      { impressions: 10000, clicks: 2000, views: 1800, interactions: 300, followers: 20 },
      "zh"
    );
    expect(spec?.type).toBe("funnel");
    const points = spec?.series[0].points ?? [];
    expect(points.map((point) => point.x)).toEqual(["曝光", "点击", "观看", "互动", "关注"]);
    expect(points[1].annotatedZh).toBe("断点 -80%");
    expect(points.filter((point) => point.annotatedZh)).toHaveLength(1);
  });

  it("returns undefined without impressions or with a single stage", () => {
    expect(buildFunnelChartFromTotals({ impressions: 0, clicks: 0, views: 0, interactions: 0, followers: 0 })).toBeUndefined();
    expect(buildFunnelChartFromTotals(undefined)).toBeUndefined();
    expect(buildFunnelChartFromTotals({ impressions: 500, clicks: 0, views: 0, interactions: 0, followers: 0 })).toBeUndefined();
  });
});

describe("ReportRenderer P1 blocks", () => {
  it("numbers every section and renders appeal, cautions, appendix and the export button", () => {
    const withAppeal: AccountInvestigation = {
      ...investigation,
      report: {
        ...v2Report,
        recoveryPlan: {
          next24Hours: [],
          next7Days: [],
          appeal: { needed: true, officialPath: "创作中心 · 帮助与客服", draft: "您好，我的笔记……" }
        },
        contentRisks: [{
          postIndex: 3,
          excerpt: "加微信立减",
          category: "off_platform_redirect",
          severity: "high",
          status: "supported",
          platformBasis: "站外联系方式属于高危表述",
          why: "显性引流话术触发分发复查",
          saferRewrite: "改用平台原生店铺入口",
          verifyNext: "改写后观察 48 小时曝光"
        }]
      }
    };
    render(<ReportRenderer investigation={withAppeal} locale="zh" evidence={[evidence]} />);
    for (const num of ["01", "02", "03", "04", "05", "06", "07", "08"]) {
      expect(screen.getAllByText(num).length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getByText("内容风险扫描")).toBeInTheDocument();
    expect(screen.getByText("POST 3")).toBeInTheDocument();
    expect(screen.getByText("改写建议")).toBeInTheDocument();
    expect(screen.getByText("申诉与禁区")).toBeInTheDocument();
    expect(screen.getByText(/官方申诉路径/)).toBeInTheDocument();
    expect(screen.getByText("不要立即删除全部笔记")).toBeInTheDocument();
    expect(screen.getByText("复诊条件")).toBeInTheDocument();
    expect(screen.getByText("证据清单")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /导出 PDF/ })).toBeInTheDocument();
  });

  it("renders metric rows derived from captured evidence", () => {
    render(<ReportRenderer investigation={investigation} locale="zh" evidence={[evidence]} />);
    expect(screen.getByText("8.2k")).toBeInTheDocument();
    expect(screen.getByText("互动率")).toBeInTheDocument();
  });
});

describe("report Pro gating", () => {
  it("locks the appendix and hides export when fullAccess is false", () => {
    render(<ReportRenderer investigation={investigation} locale="zh" evidence={[evidence]} fullAccess={false} />);
    expect(screen.getByText("解锁完整证据清单与 PDF 导出")).toBeInTheDocument();
    expect(screen.getByText("查看方案")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /导出 PDF/ })).toBeNull();
    expect(screen.getByText("48 小时后复查曝光").closest("div[class*='blur']")).not.toBeNull();
  });

  it("keeps the appendix open for full access", () => {
    render(<ReportRenderer investigation={investigation} locale="zh" evidence={[evidence]} />);
    expect(screen.queryByText("解锁完整证据清单与 PDF 导出")).toBeNull();
    expect(screen.getByText("48 小时后复查曝光").closest("div[class*='blur']")).toBeNull();
  });
});

describe("evidence navigation markers (P1)", () => {
  it("renders clickable evidence badges in the report", () => {
    const { container } = render(<ReportRenderer investigation={investigation} locale="zh" evidence={[evidence]} />);
    const marker = container.querySelector<HTMLButtonElement>('button[data-evidence-ref="E1"]');
    expect(marker).not.toBeNull();
  });

  it("renders prose superscripts as jump buttons", () => {
    const { container } = render(<AgentMessageContent content="曝光下跌 [E1]" compact />);
    const sup = container.querySelector("sup button");
    expect(sup?.getAttribute("data-evidence-ref")).toBe("E1");
  });

  it("renders the card id as a back-to-citation button", () => {
    render(<EvidenceCard evidence={evidence} locale="zh" />);
    expect(screen.getByRole("button", { name: "E1" })).toBeInTheDocument();
  });
});

function samplesOf(impressions: number) {
  return {
    samples: 7,
    impressions,
    views: impressions,
    coverClickRate: 5,
    averageViewSeconds: 20,
    likes: 100,
    comments: 10,
    saves: 50,
    shares: 5,
    followerGrowth: 8,
    profileVisits: 60
  };
}
