import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "en" }));

import { OutcomeWebhookPanel } from "@/components/app-shell/OutcomeWebhookPanel";

function response(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as Response);
}

const endpoint = {
  id: "11111111-1111-4111-8111-111111111111",
  url: "https://www.finfold.app/api/v1/outcomes/11111111-1111-4111-8111-111111111111",
  status: "active",
  secretPrefix: "ff_out_12345678",
  createdAt: "2026-08-24T12:00:00.000Z",
  rotatedAt: null,
  lastReceivedAt: null
};

describe("OutcomeWebhookPanel", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("explains the paid boundary without pretending lower plans are connected", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({
      eligible: false,
      plan: "starter_v2",
      requiredPlan: "growth_v2",
      endpoint: null,
      deliveries: []
    })));

    render(<OutcomeWebhookPanel />);

    expect(await screen.findByText("Included with Growth Engine")).toBeInTheDocument();
    expect(screen.getByText(/Starter and Creator keep manual outcome recording/)).toBeInTheDocument();
    expect(screen.queryByText("Receiving endpoint active")).not.toBeInTheDocument();
  });

  it("shows a newly-created secret once and keeps publishing out of scope", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({
        eligible: true,
        plan: "growth_v2",
        requiredPlan: "growth_v2",
        endpoint: null,
        deliveries: []
      }))
      .mockImplementationOnce(() => response({
        endpoint,
        secret: "ff_out_one-time-secret",
        rotated: false
      }, 201))
      .mockImplementationOnce(() => response({
        eligible: true,
        plan: "growth_v2",
        requiredPlan: "growth_v2",
        endpoint,
        deliveries: []
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<OutcomeWebhookPanel />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create result connection" }));

    expect(await screen.findByText("Copy this signing secret now")).toBeInTheDocument();
    expect(screen.getByText("ff_out_one-time-secret")).toBeInTheDocument();
    expect(screen.getByText("Receiving endpoint active")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish/i })).not.toBeInTheDocument();
  });
});
