import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RewriteResultCard } from "@/components/agent/RewriteResultCard";

vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const SAMPLE_TEXT = "炸裂预警！妖YAO 女团正式出道，四个妖精四种人格，主打歌《妖YAO》已经上线。";

describe("RewriteResultCard", () => {
  it("shows both actions and prefills the workbench idea link", () => {
    render(<RewriteResultCard text={SAMPLE_TEXT} locale="zh" />);

    expect(screen.getByRole("button", { name: "存入内容库" })).toBeInTheDocument();
    const workbenchLink = screen.getByRole("link", { name: /去创作台深化/ });
    expect(workbenchLink).toHaveAttribute(
      "href",
      `/workbench?idea=${encodeURIComponent(SAMPLE_TEXT)}`
    );
  });

  it("saves a draft and links to the created kit", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ kitId: "kit-123" })));
    vi.stubGlobal("fetch", fetchMock);

    render(<RewriteResultCard text={SAMPLE_TEXT} locale="zh" />);
    fireEvent.click(screen.getByRole("button", { name: "存入内容库" }));

    await waitFor(() => {
      expect(screen.getByText("草稿已存入内容库")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/kits/draft",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: SAMPLE_TEXT, source: "agent_rewrite" })
      })
    );
    expect(screen.getByRole("link", { name: /打开内容包/ })).toHaveAttribute("href", "/kits/kit-123");
  });

  it("shows the server error and keeps retrying after a failed save", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "额度不足" }, 402))
      .mockResolvedValueOnce(jsonResponse({ kitId: "kit-456" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<RewriteResultCard text={SAMPLE_TEXT} locale="zh" />);
    fireEvent.click(screen.getByRole("button", { name: "存入内容库" }));

    await waitFor(() => {
      expect(screen.getByText("额度不足")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "存入内容库" }));
    await waitFor(() => {
      expect(screen.getByText("草稿已存入内容库")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not call the draft API in demo mode", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<RewriteResultCard text={SAMPLE_TEXT} locale="zh" demoMode />);
    fireEvent.click(screen.getByRole("button", { name: "存入内容库" }));

    await waitFor(() => {
      expect(screen.getByText("登录后才能存入内容库")).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
