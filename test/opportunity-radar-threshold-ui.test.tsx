import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpportunityRadar } from "@/components/app-shell/OpportunityRadar";
import type { OpportunityRadarResponse, TopicOpportunity } from "@/lib/trends/types";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/components/app-shell/OperationsSectionNav", () => ({ OperationsSectionNav: () => null }));
vi.mock("@/components/app-shell/OpportunityPrepareButton", () => ({
  OpportunityPrepareButton: () => <button type="button">让智能体准备</button>
}));

function opportunity(matchScore: number, id: string, zhTitle: string): TopicOpportunity {
  return {
    id,
    eventId: "7b658263-9689-4669-8bb3-7150825ac01d",
    title: `${zhTitle} English fallback`,
    fact: "Observed fact.",
    keywords: ["agents"],
    lifecycle: "rising",
    matchScore,
    rankScore: matchScore,
    matchDimensions: { business: matchScore, matchedTerms: ["agents"] },
    whyNow: "Why now.",
    whyYou: "Why you.",
    recommendedPlatform: "xiaohongshu",
    recommendedFormat: "观点图文",
    mainAngle: "解释这个机会为什么值得行动",
    alternateAngles: ["角度一说明", "角度二说明"],
    evidenceConfidence: 80,
    analysisStatus: "rules",
    feedback: null,
    preparationStatus: "idle",
    contentKitId: null,
    firstSeenAt: "2026-08-27T02:00:00.000Z",
    lastSeenAt: "2026-08-27T03:00:00.000Z",
    evidence: [],
    localizedContent: {
      zh: {
        title: zhTitle,
        fact: "已核对的事实。",
        whyNow: "公开讨论正在升温。",
        whyYou: "与当前账号定位一致。",
        recommendedFormat: "观点图文",
        mainAngle: "解释这个机会为什么值得行动",
        alternateAngles: ["角度一说明", "角度二说明"],
        evidenceTitles: {}
      }
    }
  };
}

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Opportunity Radar client threshold", () => {
  it("keeps a low or zero-score response out of the complete radar list", async () => {
    const payload: OpportunityRadarResponse = {
      opportunities: [
        opportunity(0, "10000000-0000-4000-8000-000000000001", "不应出现的零分机会"),
        opportunity(69, "10000000-0000-4000-8000-000000000002", "不应出现的低分机会"),
        opportunity(82, "10000000-0000-4000-8000-000000000003", "应显示的高匹配机会")
      ],
      window: "24h",
      generatedAt: "2026-08-27T03:00:00.000Z",
      collectionStatus: "ready",
      latestCollectionAt: "2026-08-27T03:00:00.000Z",
      collectionError: null,
      latestSignalAt: "2026-08-27T03:00:00.000Z",
      sourceCount: 1,
      profileReady: true,
      persisted: true,
      localizationStatus: "ready"
    };
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(payload)));

    render(<OpportunityRadar />);

    expect(await screen.findByText("应显示的高匹配机会")).toBeInTheDocument();
    expect(screen.queryByText("不应出现的零分机会")).not.toBeInTheDocument();
    expect(screen.queryByText("不应出现的低分机会")).not.toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
  });
});
