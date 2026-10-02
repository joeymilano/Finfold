import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BusinessAccountabilityReviewCard } from "@/components/app-shell/BusinessAccountabilityReview";
import type { BusinessAccountabilityReview } from "@/lib/operations/business-review";

vi.mock("@/components/ui/Panel", () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));
vi.mock("@/components/ui/Tag", () => ({
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>
}));

const decision = {
  id: "mission-1",
  title: "Get qualified consulting leads",
  platform: "xiaohongshu" as const,
  objectiveType: "leads" as const,
  primaryMetric: "有效线索",
  primaryMetricKey: "leads" as const,
  actualValue: 4,
  targetValue: 3,
  currency: null,
  revenueByCurrency: [],
  decision: "goal_achieved" as const,
  bottleneck: null,
  evidenceNote: null,
  reviewedAt: "2026-08-24T08:00:00.000Z",
  measurementDueAt: "2026-08-23T08:00:00.000Z"
};

const review: BusinessAccountabilityReview = {
  generatedAt: "2026-08-25T08:00:00.000Z",
  period: { key: "2026-08", start: "2026-08-01T00:00:00Z", end: "2026-09-01T00:00:00Z" },
  outcomes: {
    leads: 4,
    signups: 2,
    purchases: 1,
    revenueByCurrency: [{ currency: "CNY", value: 800 }, { currency: "USD", value: 40 }],
    recordedEvents: 5,
    automaticEvents: 4,
    manualEvents: 1,
    latestAt: "2026-08-24T08:00:00.000Z"
  },
  decisions: {
    replicate: [decision],
    repair: [{ ...decision, id: "mission-2", title: "Repair the landing page", decision: "fix_bottleneck", bottleneck: "landing_page", actualValue: 0 }],
    collectEvidence: [{ ...decision, id: "mission-3", title: "Wait for payment evidence", decision: "collect_more_evidence", evidenceNote: "支付对账尚未完成，需要继续取证。" }],
    reviewDue: [{ ...decision, id: "mission-4", title: "Review due", decision: null }]
  },
  resources: {
    plan: "growth_v2",
    businessMissions: { used: 5, limit: 12 },
    credits: {
      planAllowance: 7500,
      planUsed: 100,
      availableBalance: 7420,
      grossReserved: 100,
      refunded: 20,
      netCharged: 80
    }
  }
};

afterEach(() => vi.unstubAllGlobals());

describe("BusinessAccountabilityReviewCard", () => {
  it("shows recorded outcomes, user decisions, and resource use without internal guardrail copy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ review })
    }));

    render(<BusinessAccountabilityReviewCard locale="zh" />);

    expect(await screen.findByRole("heading", { name: "本月经营结果" })).toBeInTheDocument();
    expect(screen.getByText("值得复现")).toBeInTheDocument();
    expect(screen.getByText("需要修复")).toBeInTheDocument();
    expect(screen.getByText("证据不足")).toBeInTheDocument();
    expect(screen.getByText(/待验证断点：落地页/)).toBeInTheDocument();
    expect(screen.getByText("支付对账尚未完成，需要继续取证。")).toBeInTheDocument();
    expect(screen.getByText(/按币种分别统计/)).toBeInTheDocument();
    expect(screen.getByText(/净消耗 80 点/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /现在复盘/ })).toHaveAttribute("href", "/operations/missions/mission-4");
    expect(screen.queryByText("不补算、不编造")).not.toBeInTheDocument();
  });
});
