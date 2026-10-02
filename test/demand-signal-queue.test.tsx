import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemandSignalQueue } from "@/components/app-shell/DemandSignalQueue";

const signal = {
  id: "71b788d7-40fa-4d13-b0ac-69de5bb11c10",
  source: "hacker-news" as const,
  sourceItemId: "101",
  title: "Ask HN: a better social scheduling workflow?",
  excerpt: "We need creator analytics without another spreadsheet.",
  discussionUrl: "https://news.ycombinator.com/item?id=101",
  externalUrl: "https://example.com/product",
  score: 42,
  comments: 12,
  publishedAt: "2026-08-25T12:00:00.000Z",
  matchedKeywords: ["social scheduling", "creator analytics"],
  status: "new" as const,
  firstSeenAt: "2026-08-26T12:00:00.000Z",
  lastSeenAt: "2026-08-26T12:00:00.000Z",
  reviewedAt: null
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("DemandSignalQueue", () => {
  it("labels public posts as unverified research instead of leads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ signals: [signal] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })));
    render(<DemandSignalQueue locale="en" keywords={["social scheduling", "creator analytics"]} />);

    expect(await screen.findByText(signal.title)).toBeInTheDocument();
    expect(screen.getByText("Unverified")).toBeInTheDocument();
    expect(screen.getByText(/Open the original source and decide whether the need is worth exploring/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /better social scheduling workflow/i })).toHaveAttribute(
      "href",
      signal.discussionUrl
    );
  });

  it("requires an explicit keep decision and updates the real queue", async () => {
    const kept = { ...signal, status: "kept" as const, reviewedAt: "2026-08-26T12:30:00.000Z" };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Response(JSON.stringify({ signal: kept }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ signals: [signal] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<DemandSignalQueue locale="en" keywords={["creator analytics"]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Keep" }));

    await waitFor(() => expect(screen.getByText("Kept")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/operations/demand-signals/${signal.id}`,
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "kept" }) })
    );
  });
});
