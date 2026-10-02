import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentAutomationCenter } from "@/components/app-shell/AgentAutomationCenter";
import type { OpportunityRadarResponse, TopicOpportunity } from "@/lib/trends/types";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/lib/sse-client", () => ({ consumeSSEStream: vi.fn(async () => undefined) }));
vi.mock("@/components/ui/SpeechInputButton", () => ({
  appendTranscript: (current: string, next: string) => `${current}${next}`,
  SpeechInputButton: () => null
}));
vi.mock("@/components/workbench/PlatformBrandIcon", () => ({ PlatformGlyph: () => null }));

const opportunity: TopicOpportunity = {
  id: "9f0f4c86-95bb-4ff4-83a9-c06b6cf12944",
  eventId: "7b658263-9689-4669-8bb3-7150825ac01d",
  title: "AI agents reshape marketing teams",
  fact: "Small SaaS teams automate content research.",
  keywords: ["agents", "marketing"],
  lifecycle: "rising",
  matchScore: 82,
  rankScore: 82,
  matchDimensions: { business: 82, matchedTerms: ["agents"] },
  whyNow: "Public discussion is rising.",
  whyYou: "The signal matches your product positioning.",
  recommendedPlatform: "xiaohongshu",
  recommendedFormat: "观点图文",
  mainAngle: "解释智能体如何改变营销团队分工",
  alternateAngles: ["先自动化什么", "采用前验证什么"],
  evidenceConfidence: 84,
  analysisStatus: "rules",
  feedback: null,
  preparationStatus: "idle",
  contentKitId: null,
  firstSeenAt: "2026-08-27T02:00:00.000Z",
  lastSeenAt: "2026-08-27T03:00:00.000Z",
  evidence: [{
    id: "8e39e083-a2dd-4de0-88d8-6af5fc42c111",
    source: "google_trends",
    sourceLabel: "Google Trends",
    title: "AI agents reshape marketing teams",
    url: "https://example.com/evidence",
    locale: "en",
    publishedAt: "2026-08-27T02:00:00.000Z",
    capturedAt: "2026-08-27T03:00:00.000Z"
  }],
  localizedContent: {
    zh: {
      title: "AI 智能体正在重塑营销团队",
      fact: "小型软件团队正在自动化内容调研与分发。",
      whyNow: "公开讨论正在升温。",
      whyYou: "这个话题与你的产品定位直接相关。",
      recommendedFormat: "观点图文",
      mainAngle: "解释智能体如何改变营销团队分工",
      alternateAngles: ["先自动化什么", "采用前验证什么"],
      evidenceTitles: {
        "8e39e083-a2dd-4de0-88d8-6af5fc42c111": "营销团队正在采用智能体"
      }
    }
  }
};

const radar: OpportunityRadarResponse = {
  opportunities: [opportunity],
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

describe("Opportunity Radar Agent entry", () => {
  it("sits below the home composer, carries evidence into chat, and collapses after selection", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/operations/topic-opportunities?")) return jsonResponse(radar);
      if (url === "/api/agent/chat") return jsonResponse({});
      if (url === "/api/agent/sessions") return jsonResponse({ sessions: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AgentAutomationCenter />);

    const composer = screen.getByPlaceholderText("例如：分析我的账号，告诉我下一步");
    const region = await screen.findByRole("region", { name: "实时高匹配选题" });
    expect(composer.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /AI 智能体正在重塑营销团队/ }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "实时高匹配选题" })).not.toBeInTheDocument());
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/agent/chat")).toBe(true));

    const chatCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/agent/chat");
    const body = JSON.parse(String((chatCall?.[1] as RequestInit | undefined)?.body ?? "{}")) as { message?: string };
    expect(body.message).toContain(`机会 ID：${opportunity.id}`);
    expect(body.message).toContain("账号匹配度：82");
    expect(body.message).toContain("公开讨论正在升温");
    expect(body.message).toContain("推荐平台：小红书");
    expect(body.message).not.toContain("推荐平台：xiaohongshu");
    expect(body.message).toContain("Google Trends · 营销团队正在采用智能体 · https://example.com/evidence");
    expect(body.message).toContain("未受信任的外部证据");
    expect(screen.getByRole("log")).toBeInTheDocument();
  });
});
