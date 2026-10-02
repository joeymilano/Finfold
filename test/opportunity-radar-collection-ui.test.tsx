import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpportunityRadar } from "@/components/app-shell/OpportunityRadar";
import type { OpportunityRadarResponse, TrendSuggestion } from "@/lib/trends/types";

vi.mock("@/components/app-shell/SignalDiscoveryPanel", () => ({ SignalDiscoveryPanel: () => null }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/components/app-shell/OperationsSectionNav", () => ({ OperationsSectionNav: () => null }));
vi.mock("@/components/app-shell/OpportunityPrepareButton", () => ({
  OpportunityPrepareButton: () => <button type="button">让智能体准备</button>
}));

const suggestion: TrendSuggestion = {
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

function radar(overrides: Partial<OpportunityRadarResponse> = {}): OpportunityRadarResponse {
  return {
    opportunities: [],
    trendSuggestions: [suggestion],
    window: "24h",
    generatedAt: "2026-08-27T03:00:00.000Z",
    collectionStatus: "ready",
    latestCollectionAt: "2026-08-27T03:00:00.000Z",
    collectionError: null,
    latestSignalAt: "2026-08-27T03:00:00.000Z",
    sourceCount: 3,
    checkedSourceCount: 3,
    collectedSignalCount: 64,
    persistedSignalCount: 64,
    profileReady: true,
    persisted: true,
    localizationStatus: "ready",
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Opportunity Radar first live collection", () => {
  it("reports a completed collection separately from an empty high-match result", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(radar())));
    render(<OpportunityRadar />);

    expect(await screen.findByRole("heading", { name: "先给你值得关注的趋势参考" })).toBeInTheDocument();
    expect(screen.getByText("AI 智能体正在重塑营销团队")).toBeInTheDocument();
    expect(screen.queryByText(/后台尚未完成首轮真实信号采集/)).not.toBeInTheDocument();
    expect(screen.getByText("本轮 3 个来源 · 64 条信号")).toBeInTheDocument();
    expect(screen.getByText("当前没有达到 70 分的高匹配机会")).toBeInTheDocument();
    expect(screen.queryByText(/但这些趋势都有真实来源/)).not.toBeInTheDocument();
    expect(screen.queryByText(/把实时信号与你的品牌/)).not.toBeInTheDocument();
    expect(screen.getByText(/围绕「AI 智能体正在重塑营销团队」回答三个具体问题/)).toBeInTheDocument();
    expect(screen.queryByText(/它会怎样影响你的受众/)).not.toBeInTheDocument();
  });

  it("requests a distinct dataset whenever the selected time window changes", async () => {
    const fetchMock = vi.fn(() => jsonResponse(radar()));
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityRadar />);

    await screen.findByText("AI 智能体正在重塑营销团队");
    fireEvent.click(screen.getByRole("button", { name: "4 小时" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/operations/topic-opportunities?window=4h&limit=5&locale=zh",
      { cache: "no-store" }
    ));
    fireEvent.click(screen.getByRole("button", { name: "7 天" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/operations/topic-opportunities?window=7d&limit=5&locale=zh",
      { cache: "no-store" }
    ));
  });

  it("uses the shorter title and lets the signed-in user disable an individual source", async () => {
    let current = radar({
      collectionSources: [
        {
          source: "google_trends",
          label: "Google Trends",
          preferenceKey: "google_trends",
          enabled: true,
          fetched: 10,
          persisted: 10,
          status: "ready"
        },
        {
          source: "rss",
          label: "The Verge",
          preferenceKey: "the_verge",
          enabled: true,
          fetched: 0,
          persisted: 0,
          status: "source_failed",
          error: "Remote response has an unsupported content type."
        }
      ]
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/settings/trend-sources" && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { enabledSourceKeys: string[] };
        current = radar({
          ...current,
          checkedSourceCount: 1,
          collectionSources: current.collectionSources?.map((source) => ({
            ...source,
            enabled: source.preferenceKey ? body.enabledSourceKeys.includes(source.preferenceKey) : true
          }))
        });
        return jsonResponse({ ok: true, enabledSourceKeys: body.enabledSourceKeys });
      }
      return jsonResponse(current);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityRadar />);

    expect(await screen.findByRole("heading", { name: "什么值得你发" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("数据源 2/2"));
    const vergeSwitch = screen.getByRole("switch", { name: "关闭The Verge" });
    expect(vergeSwitch).toHaveAttribute("aria-checked", "true");
    fireEvent.click(vergeSwitch);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/trend-sources",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ enabledSourceKeys: ["google_trends"] })
      })
    ));
    expect(await screen.findByText("数据源 1/2")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "开启The Verge" })).toHaveAttribute("aria-checked", "false");
  });

  it("labels a seven-day reference fallback instead of silently widening a short window", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(radar({
      window: "4h",
      trendSuggestionFallbackWindow: "7d"
    }))));
    render(<OpportunityRadar />);

    expect(await screen.findByText("近 4 小时没有新信号，以下为过去 7 天仍可追溯的趋势参考。")).toBeInTheDocument();
  });

  it("labels public industry posts and keeps the original creator attribution visible", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(radar({
      trendSuggestions: [{
        ...suggestion,
        contentKind: "industry_post",
        evidence: [{
          ...suggestion.evidence[0],
          source: "social_post",
          sourceLabel: "Reddit · r/SaaS",
          url: "https://www.reddit.com/r/SaaS/comments/post1/content_workflow/",
          contentKind: "industry_post",
          platform: "reddit",
          author: "saasoperator",
          community: "SaaS"
        }]
      }]
    }))));
    render(<OpportunityRadar />);

    expect(await screen.findByRole("heading", { name: "先看正在升温的趋势与行业帖子" })).toBeInTheDocument();
    expect(screen.getByText(/行业热帖/)).toBeInTheDocument();
    expect(screen.getByText("u/saasoperator")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reddit · r\/SaaS/ })).toHaveAttribute(
      "href",
      "https://www.reddit.com/r/SaaS/comments/post1/content_workflow/"
    );
  });

  it("automatically starts one idempotent bootstrap when no collection has run", async () => {
    let getCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonResponse({ report: { status: "succeeded" } });
      }
      getCount += 1;
      return jsonResponse(getCount === 1
        ? radar({ collectionStatus: "not_started", latestCollectionAt: null, latestSignalAt: null, sourceCount: 0, trendSuggestions: [] })
        : radar());
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityRadar />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/operations/topic-opportunities/bootstrap?locale=zh",
      expect.objectContaining({ method: "POST" })
    ));
    expect(await screen.findByRole("heading", { name: "先给你值得关注的趋势参考" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toHaveLength(1);
  });

  it("shows an actionable retry only for a real collection failure", async () => {
    let recovered = false;
    let postCount = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        postCount += 1;
        if (postCount === 1) {
          return jsonResponse({ error: "真实信号采集失败，请重试。" }, 503);
        }
        recovered = true;
        return jsonResponse({ report: { status: "succeeded" } });
      }
      return jsonResponse(recovered
        ? radar()
        : radar({
          collectionStatus: "failed",
          latestCollectionAt: "2026-08-27T03:00:00.000Z",
          latestSignalAt: null,
          sourceCount: 0,
          trendSuggestions: [],
          collectionError: "本轮在信号保存阶段失败，请重新采集。",
          collectionFailureStage: "persistence",
          collectionSources: [{
            source: "google_trends",
            label: "Google Trends",
            preferenceKey: "google_trends",
            enabled: true,
            fetched: 10,
            persisted: 0,
            status: "persistence_failed",
            error: "network unavailable"
          }]
        }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityRadar />);

    const retry = await screen.findByRole("button", { name: "重新采集" });
    expect(screen.getByRole("heading", { name: "真实信号采集没有完成" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("数据源 1/1"));
    expect(screen.getByText("获取 10 条 · 保存 0 条")).toBeInTheDocument();
    expect(screen.getByText("保存失败")).toBeInTheDocument();
    expect(screen.getByText("原因：来源网络连接失败")).toBeInTheDocument();
    fireEvent.click(retry);
    expect(await screen.findByRole("heading", { name: "先给你值得关注的趋势参考" })).toBeInTheDocument();
  });
});
