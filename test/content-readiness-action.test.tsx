import "@testing-library/jest-dom/vitest";
import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutputBoard } from "@/components/workbench/OutputBoard";
import type { KitOutput } from "@/lib/content-schema";

vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/components/ui/Toast", () => ({ addToast: vi.fn() }));
vi.mock("@/components/workbench/PlatformBrandIcon", () => ({ PlatformGlyph: () => null }));
vi.mock("@/components/workbench/mockups/SocialMockup", () => ({ SocialMockup: () => <div>preview</div> }));
vi.mock("@/components/workbench/cover/CoverStudio", () => ({ CoverStudio: () => <div>cover studio opened</div> }));
vi.mock("@/components/workbench/visual-intelligence/VisualAssetPlanCard", () => ({ VisualAssetPlanCard: () => null }));

const draftOutput: KitOutput = {
  id: "output-1",
  platform: "x",
  title: "Launch note",
  body: "A finished launch note ready to publish.",
  cta: "Read more",
  notes: "Keep the hook direct.",
  strategy: "Founder-led launch update.",
  locked: false,
  publishStatus: "draft",
  userEdited: false
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as Response);
}

function Harness() {
  const [outputs, setOutputs] = useState<KitOutput[]>([draftOutput]);
  return (
    <OutputBoard
      outputs={outputs}
      isLoading={false}
      error={null}
      locale="zh"
      canUseOutputs
      kitId="kit-1"
      onOutputSaved={(platform, patch) => {
        setOutputs((current) => current.map((output) => output.platform === platform ? { ...output, ...patch } : output));
      }}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("content readiness action", () => {
  it("improves the current draft instead of opening the cover studio", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/outputs/output-1/regenerate") && init?.method === "POST") {
        return jsonResponse({
          output: {
            ...draftOutput,
            body: "A concrete launch method:\n\n1. Start with the user problem.\n\n2. Show the result.",
            cta: "Try the checklist and share what changed."
          }
        });
      }
      if (url.startsWith("/api/brand-brain")) return jsonResponse({ brain: {}, persisted: false });
      if (url.startsWith("/api/output-feedback")) return jsonResponse({ feedback: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "按建议优化" }));

    expect(screen.getByRole("button", { name: "优化中…" })).toBeDisabled();
    expect(screen.queryByText("cover studio opened")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/kits/kit-1/outputs/output-1/regenerate",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
          body: expect.stringContaining("\"mode\":\"improve\"")
        })
      );
    });
  });
});
