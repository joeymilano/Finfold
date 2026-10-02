import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreditSpendBreakdown } from "@/components/billing/CreditSpendBreakdown";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function respondWith(payload: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload
    })
  );
}

function respondWithError() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 503
    })
  );
}

describe("CreditSpendBreakdown", () => {
  it("distinguishes gross reservations, refunds, and the actual net charge", async () => {
    respondWith({
      items: [
        { action: "contentKitBase", credits: 15 },
        { action: "quickResearch", credits: 5 }
      ],
      grossReserved: 20,
      refunded: 15,
      netCharged: 5,
      manualCredits: 0,
      manualDebits: 0,
      expiredCredits: 0,
      cycleStart: "2026-08-01T00:00:00.000Z",
      cycleEnd: "2026-09-01T00:00:00.000Z"
    });

    render(<CreditSpendBreakdown locale="en" />);

    await screen.findByText("Net charged");
    expect(within(screen.getByTestId("credits-gross-reserved")).getByText("20")).toBeVisible();
    expect(within(screen.getByTestId("credits-refunded")).getByText("15")).toBeVisible();
    expect(within(screen.getByTestId("credits-net-charged")).getByText("5")).toBeVisible();
    expect(screen.queryByText("Gross activity by action · before refunds")).not.toBeInTheDocument();
  });

  it("keeps a fully refunded attempt visible and shows that it charged zero", async () => {
    respondWith({
      items: [{ action: "contentKitBase", credits: 15 }],
      grossReserved: 15,
      refunded: 15,
      netCharged: 0,
      manualCredits: 0,
      manualDebits: 0,
      expiredCredits: 0,
      cycleStart: "2026-08-01T00:00:00.000Z",
      cycleEnd: "2026-09-01T00:00:00.000Z"
    });

    render(<CreditSpendBreakdown locale="en" />);

    await screen.findByText("Net charged");
    expect(within(screen.getByTestId("credits-net-charged")).getByText("0")).toBeVisible();
    expect(screen.queryByText(/Refunded Credits have been restored/)).not.toBeInTheDocument();
  });

  it("shows operator adjustments and expiry as separate balance events", async () => {
    respondWith({
      items: [],
      grossReserved: 0,
      refunded: 0,
      netCharged: 0,
      manualCredits: 20,
      manualDebits: 3,
      expiredCredits: 40,
      cycleStart: "2026-08-01T00:00:00.000Z",
      cycleEnd: "2026-09-01T00:00:00.000Z"
    });

    render(<CreditSpendBreakdown locale="en" />);

    const adjustments = await screen.findByTestId("credits-manual-adjustments");
    expect(within(adjustments).getByText("+20")).toBeVisible();
    expect(within(adjustments).getByText("−3")).toBeVisible();
    expect(within(screen.getByTestId("credits-expired")).getByText("−40")).toBeVisible();
    expect(screen.getByText(/not action attempts, refunds, or part of net charged/)).toBeVisible();
    expect(screen.queryByText("Gross activity by action · before refunds")).not.toBeInTheDocument();
  });

  it("shows a compact unavailable state for any non-2xx response", async () => {
    respondWithError();

    render(<CreditSpendBreakdown locale="zh" />);

    expect(await screen.findByText("账务暂不可用")).toBeVisible();
    expect(screen.getByTestId("credits-billing-unavailable")).toHaveAttribute("role", "status");
  });
});
