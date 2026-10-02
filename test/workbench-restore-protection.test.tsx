import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkbenchProvider, useWorkbench } from "@/components/workbench/WorkbenchProvider";

vi.mock("@/components/ui/Toast", () => ({ addToast: vi.fn() }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/lib/theme", () => ({ getStoredLocale: () => "zh" }));
vi.mock("@/lib/brand-brain", () => ({
  getBrandBrain: () => ({}),
  loadPersistedBrandBrain: vi.fn(async () => ({}))
}));
vi.mock("@/lib/guardrails", () => ({
  getStoredCustomGuardrails: () => [],
  loadPersistedCustomGuardrails: vi.fn(async () => [])
}));
vi.mock("@/lib/generation-run-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/generation-run-client")>();
  return {
    ...original,
    loadPendingGeneration: () => null,
    clearPendingGeneration: vi.fn(),
    savePendingGeneration: vi.fn()
  };
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

function CanvasProbe() {
  const { ideaText, setIdeaText, canvasRestoreComplete, currentKit, kits, prepareFreshDraft } = useWorkbench();
  return (
    <>
      <input aria-label="idea" value={ideaText} onChange={(event) => setIdeaText(event.target.value)} />
      <span>{canvasRestoreComplete ? "restored" : "loading"}</span>
      <span data-testid="current-kit">{currentKit?.id ?? "none"}</span>
      <span data-testid="kit-count">{kits.length}</span>
      <button type="button" onClick={prepareFreshDraft}>new handoff</button>
    </>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Workbench initial canvas restore", () => {
  it("does not overwrite input entered while the saved-kit request is still loading", async () => {
    let releaseKits: ((response: Response) => void) | undefined;
    const kitsResponse = new Promise<Response>((resolve) => {
      releaseKits = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/entitlements/check") {
        return Promise.resolve(jsonResponse({
          authenticated: true,
          plan: "free",
          canUseOutputs: true,
          canAnalyze: false,
          urlBootstrap: false,
          polish: false,
          iterateReport: false,
          proactiveMonitoring: false,
          trialAvailable: false,
          used: 0,
          monthlyLimit: 50,
          available: 50
        }));
      }
      if (url === "/api/kits") return kitsResponse;
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <WorkbenchProvider>
        <CanvasProbe />
      </WorkbenchProvider>
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/kits", { cache: "no-store" }));
    fireEvent.change(screen.getByLabelText("idea"), { target: { value: "刚输入的新内容" } });

    releaseKits?.(jsonResponse({
      kits: [{
        id: "kit-old",
        ideaText: "历史内容",
        goal: "lead-gen",
        persona: "ai-saas",
        platforms: ["linkedin"],
        mediaAssets: [],
        outputs: [],
        status: "saved",
        createdAt: "2026-08-15T00:00:00.000Z"
      }]
    }));

    await screen.findByText("restored");
    expect(screen.getByLabelText("idea")).toHaveValue("刚输入的新内容");
  });

  it("detaches an Agent handoff from the old canvas without deleting saved kits", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/entitlements/check") {
        return Promise.resolve(jsonResponse({
          authenticated: true,
          plan: "free",
          canUseOutputs: true,
          canAnalyze: false,
          urlBootstrap: false,
          polish: false,
          iterateReport: false,
          proactiveMonitoring: false,
          trialAvailable: false,
          used: 0,
          monthlyLimit: 50,
          available: 50
        }));
      }
      if (url === "/api/kits") {
        return Promise.resolve(jsonResponse({
          kits: [{
            id: "kit-old",
            ideaText: "历史主题仍保存在内容库里，不应继续占用新任务画布。",
            goal: "lead-gen",
            persona: "ai-saas",
            platforms: ["xiaohongshu"],
            mediaAssets: [],
            outputs: [{ id: "output-old", platform: "xiaohongshu", content: "历史正文" }],
            status: "saved",
            createdAt: "2026-08-15T00:00:00.000Z"
          }]
        }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <WorkbenchProvider>
        <CanvasProbe />
      </WorkbenchProvider>
    );

    await screen.findByText("restored");
    expect(screen.getByTestId("current-kit")).toHaveTextContent("kit-old");
    expect(screen.getByTestId("kit-count")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "new handoff" }));

    expect(screen.getByTestId("current-kit")).toHaveTextContent("none");
    expect(screen.getByTestId("kit-count")).toHaveTextContent("1");
  });
});
