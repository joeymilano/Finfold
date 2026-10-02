import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpportunityRadarPreview } from "@/components/app-shell/OpportunityRadarPreview";
import type { OpportunityRadarResponse, TopicOpportunity, TrendSuggestion } from "@/lib/trends/types";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));

const localizedContent = {
  zh: {
    title: "AI 智能体正在重塑营销团队",
    fact: "小型软件团队正在自动化内容调研与分发。",
    whyNow: "公开讨论正在升温。",
    whyYou: "这个话题与你的产品定位直接相关。",
    recommendedFormat: "观点图文",
    mainAngle: "解释智能体如何改变营销团队分工",
    alternateAngles: ["先自动化什么", "采用前验证什么"],
    evidenceTitles: {}
  }
};

const trendSuggestion: TrendSuggestion = {
  id: "7b658263-9689-4669-8bb3-7150825ac01d",
  title: "AI agents reshape marketing teams",
  summary: "Small teams are testing agent-led content workflows.",
  lifecycle: "rising",
  momentumScore: 78,
  freshnessScore: 92,
  evidenceConfidence: 82,
  sourceCount: 1,
  firstSeenAt: "2026-08-27T02:00:00.000Z",
  lastSeenAt: "2026-08-27T03:00:00.000Z",
  evidence: [{
    id: "8e39e083-a2dd-4de0-88d8-6af5fc42c111",
    source: "hacker_news",
    sourceLabel: "Hacker News",
    title: "AI agents reshape marketing teams",
    url: "https://example.com/evidence",
    locale: "en",
    publishedAt: "2026-08-27T02:00:00.000Z",
    capturedAt: "2026-08-27T03:00:00.000Z"
  }],
  localizedContent: {
    zh: {
      title: "AI 智能体正在重塑营销团队",
      summary: "小型团队正在测试由智能体驱动的内容工作流。"
    }
  }
};

function opportunity(matchScore: number, overrides: Partial<TopicOpportunity> = {}): TopicOpportunity {
  return {
    id: "9f0f4c86-95bb-4ff4-83a9-c06b6cf12944",
    eventId: "7b658263-9689-4669-8bb3-7150825ac01d",
    title: "AI agents reshape marketing teams",
    fact: "Small SaaS teams automate content research.",
    keywords: ["agents", "marketing"],
    lifecycle: "rising",
    matchScore,
    rankScore: matchScore,
    matchDimensions: { business: matchScore, matchedTerms: ["agents"] },
    whyNow: "公开讨论正在升温。",
    whyYou: "这个话题与你的产品定位直接相关。",
    recommendedPlatform: "xiaohongshu",
    recommendedFormat: "观点图文",
    mainAngle: "解释智能体如何改变营销团队分工",
    alternateAngles: ["先自动化什么", "采用前验证什么"],
    evidenceConfidence: 82,
    analysisStatus: "rules",
    feedback: null,
    preparationStatus: "idle",
    contentKitId: null,
    firstSeenAt: "2026-08-27T02:00:00.000Z",
    lastSeenAt: "2026-08-27T03:00:00.000Z",
    evidence: [],
    localizedContent,
    ...overrides
  };
}

function response(opportunities: TopicOpportunity[], overrides: Partial<OpportunityRadarResponse> = {}): OpportunityRadarResponse {
  return {
    opportunities,
    trendSuggestions: [trendSuggestion],
    window: "24h",
    generatedAt: "2026-08-27T03:00:00.000Z",
    collectionStatus: "ready",
    latestCollectionAt: "2026-08-27T03:00:00.000Z",
    collectionError: null,
    latestSignalAt: "2026-08-27T03:00:00.000Z",
    sourceCount: 1,
    profileReady: true,
    persisted: true,
    localizationStatus: "ready",
    ...overrides
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

describe("Opportunity Radar Agent preview", () => {
  it("shows sourced trend suggestions when every personalized opportunity is below the high-match threshold", async () => {
    const fetchMock = vi.fn(() => jsonResponse(response([opportunity(0), opportunity(69)])));
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityRadarPreview surface="agent_chatbox" />);

    const region = await screen.findByRole("region", { name: "真实趋势参考" });
    expect(region).toHaveTextContent("AI 智能体正在重塑营销团队");
    expect(region).toHaveTextContent("Hacker News");
    expect(screen.queryByRole("region", { name: "实时高匹配选题" })).not.toBeInTheDocument();
  });

  it("surfaces industry creator posts near Agent with clear attribution", async () => {
    const socialSuggestion: TrendSuggestion = {
      ...trendSuggestion,
      contentKind: "industry_post",
      evidence: [{
        ...trendSuggestion.evidence[0],
        source: "social_post",
        sourceLabel: "Reddit · r/SaaS",
        contentKind: "industry_post",
        platform: "reddit",
        author: "saasoperator",
        community: "SaaS"
      }]
    };
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(response([], {
      trendSuggestions: [socialSuggestion]
    }))));
    render(<OpportunityRadarPreview surface="agent_chatbox" />);

    const region = await screen.findByRole("region", { name: "真实趋势与行业帖子" });
    expect(region).toHaveTextContent("趋势与行业帖子");
    expect(region).toHaveTextContent("行业");
    expect(region).toHaveTextContent("u/saasoperator");
  });

  it("starts first collection and reveals real trend suggestions when collection completes", async () => {
    let getCount = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ report: { status: "succeeded" } });
      getCount += 1;
      return jsonResponse(response([], getCount === 1 ? {
        collectionStatus: "not_started",
        latestCollectionAt: null,
        latestSignalAt: null,
        sourceCount: 0,
        trendSuggestions: []
      } : {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityRadarPreview surface="agent_chatbox" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/operations/topic-opportunities/bootstrap?locale=zh",
      expect.objectContaining({ method: "POST" })
    ));
    expect(await screen.findByRole("region", { name: "真实趋势参考" })).toBeInTheDocument();
  });

  it("shows only the localized high-match topic below the Agent composer", async () => {
    const fetchMock = vi.fn(() => jsonResponse(response([opportunity(82)])));
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityRadarPreview surface="agent_chatbox" />);

    const region = await screen.findByRole("region", { name: "实时高匹配选题" });
    expect(region).toHaveTextContent("匹配度 82");
    expect(region).toHaveTextContent("AI 智能体正在重塑营销团队");
    expect(region).not.toHaveTextContent("AI agents reshape marketing teams");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/operations/topic-opportunities?window=24h&limit=3&locale=zh",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("shows at most three opportunities even if the response exceeds the requested limit", async () => {
    const fetchMock = vi.fn(() => jsonResponse(response([
      opportunity(90, { id: "10000000-0000-4000-8000-000000000001" }),
      opportunity(89, { id: "10000000-0000-4000-8000-000000000002" }),
      opportunity(88, { id: "10000000-0000-4000-8000-000000000003" }),
      opportunity(87, { id: "10000000-0000-4000-8000-000000000004" })
    ])));
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityRadarPreview surface="agent_chatbox" onSelect={vi.fn()} />);

    const region = await screen.findByRole("region", { name: "实时高匹配选题" });
    expect(within(region).getAllByRole("button")).toHaveLength(3);
  });

  it("hands the selected opportunity to the Agent flow instead of linking to a detail page", async () => {
    const selected = vi.fn();
    const highMatch = opportunity(82);
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(response([highMatch]))));
    render(<OpportunityRadarPreview surface="agent_chatbox" onSelect={selected} />);

    const opportunityButton = await screen.findByRole("button", { name: /AI 智能体正在重塑营销团队/ });
    expect(screen.queryByRole("link", { name: /AI 智能体正在重塑营销团队/ })).not.toBeInTheDocument();
    fireEvent.click(opportunityButton);
    expect(selected).toHaveBeenCalledWith(highMatch);
  });
});
