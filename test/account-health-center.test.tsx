import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountHealthCenter } from "@/components/app-shell/AccountHealthCenter";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  toast: vi.fn()
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/lib/posthog", () => ({ captureEvent: mocks.capture }));
vi.mock("@/components/ui/Toast", () => ({ addToast: mocks.toast }));
vi.mock("@/components/app-shell/AccountInvestigationReportCard", () => ({
  AccountInvestigationReportCard: () => <div>报告结果</div>
}));

beforeEach(() => {
  mocks.capture.mockReset();
  mocks.toast.mockReset();
});

describe("AccountHealthCenter", () => {
  it("uses short copy and starts from a screenshot without forcing a profile URL", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/settings/social-connections") {
        return new Response(JSON.stringify({ oauthConnectors: {}, connections: [] }), { status: 200 });
      }
      if (url === "/api/agent/attachments") {
        return new Response(JSON.stringify({
          attachments: [{
            id: "11111111-1111-4111-8111-111111111111",
            name: "account.png",
            size: 3,
            kind: "image",
            mimeType: "image/png",
            storagePath: "user/account.png"
          }]
        }), { status: 200 });
      }
      if (url === "/api/agent/account-health/diagnoses") {
        return new Response(JSON.stringify({
          snapshotSaved: false,
          investigation: {
            platform: "x",
            evidenceLevel: "creator_analytics",
            report: { caseState: "low_reach", contentRisks: [] }
          }
        }), { status: 200 });
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AccountHealthCenter />);
    expect(screen.getByRole("heading", { name: "账号体检，交给 Finfold" })).toBeInTheDocument();
    expect(screen.getByText("只看证据，不乱判限流")).toBeInTheDocument();

    const file = new File(["png"], "account.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("加截图"), file);
    await user.click(screen.getByRole("button", { name: /开始体检/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/agent/account-health/diagnoses",
      expect.objectContaining({ method: "POST" })
    ));
    expect(await screen.findByText("报告好了，但没存上。先别刷新。")).toBeInTheDocument();
    expect(screen.getByText("报告结果")).toBeInTheDocument();
  });
});
