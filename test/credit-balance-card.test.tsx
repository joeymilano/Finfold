import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreditBalanceCard } from "@/components/billing/CreditBalanceCard";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type RouteResponse = Record<string, unknown>;

function stubRoutes(routes: Record<string, RouteResponse | { ok: false }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      for (const [key, payload] of Object.entries(routes)) {
        if (url.includes(key)) {
          if ("ok" in payload && payload.ok === false) {
            return Promise.resolve({ ok: false, status: 503, json: async () => ({}) });
          }
          return Promise.resolve({ ok: true, json: async () => payload });
        }
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    })
  );
}

const ENTITLEMENTS = "/api/entitlements/check";
const SPEND_SUMMARY = "/api/credits/spend-summary";

describe("CreditBalanceCard", () => {
  it("shows the spendable balance with a cycle progress bar", async () => {
    stubRoutes({
      [ENTITLEMENTS]: { plan: "employee", used: 30, monthlyLimit: 100000, available: 49170 },
      [SPEND_SUMMARY]: { ok: false }
    });

    render(<CreditBalanceCard locale="zh" />);

    const value = await screen.findByTestId("credit-balance-value");
    expect(value).toHaveTextContent("49,170");
    expect(value).toHaveTextContent("可用");

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "30");
    expect(bar).toHaveAttribute("aria-valuemax", "100000");
    expect(screen.getByText("本周期方案已预留 30 / 100,000")).toBeVisible();
    expect(screen.getByText("employee")).toBeVisible();
  });

  it("keeps refunds and top-ups inside the spendable figure", async () => {
    stubRoutes({
      [ENTITLEMENTS]: { plan: "pro", used: 10, monthlyLimit: 100, available: 500 },
      [SPEND_SUMMARY]: { ok: false }
    });

    render(<CreditBalanceCard locale="en" />);

    const value = await screen.findByTestId("credit-balance-value");
    expect(value).toHaveTextContent("500");
    expect(value).toHaveTextContent("left");
    expect(screen.queryByText("+410")).not.toBeInTheDocument();
  });

  it("shows an explicit unavailable state instead of guessed numbers", async () => {
    stubRoutes({ [ENTITLEMENTS]: { ok: false }, [SPEND_SUMMARY]: { ok: false } });

    render(<CreditBalanceCard locale="en" />);

    expect(await screen.findByText("Unavailable")).toBeVisible();
    expect(screen.getByTestId("credit-balance-value")).not.toHaveTextContent("500");
    expect(screen.getByText("Balance temporarily unavailable — it will return shortly")).toBeVisible();
  });

  it("reveals the activity ledger after a click", async () => {
    const user = userEvent.setup();
    stubRoutes({
      [ENTITLEMENTS]: { plan: "pro", used: 10, monthlyLimit: 100, available: 90 },
      [SPEND_SUMMARY]: {
        items: [{ action: "contentKitBase", credits: 15 }],
        grossReserved: 15,
        refunded: 5,
        netCharged: 10,
        manualCredits: 0,
        manualDebits: 0,
        expiredCredits: 0,
        cycleStart: "2026-08-01T00:00:00.000Z",
        cycleEnd: "2026-09-01T00:00:00.000Z"
      }
    });

    render(<CreditBalanceCard locale="en" />);

    const toggle = await screen.findByRole("button", { name: /Credits activity/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Net charged")).toBeVisible();
  });

  it("renders without the progress bar hinting a plan when data is unavailable", async () => {
    stubRoutes({ [ENTITLEMENTS]: { ok: false }, [SPEND_SUMMARY]: { ok: false } });

    render(<CreditBalanceCard locale="zh" />);

    await screen.findByText("暂不可用");
    expect(screen.queryByText("employee")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("opens the credit pack store inside the card from the primary buy button", async () => {
    const user = userEvent.setup();
    stubRoutes({
      [ENTITLEMENTS]: { plan: "free", used: 1, monthlyLimit: 50, available: 550 },
      [SPEND_SUMMARY]: { ok: false }
    });

    render(<CreditBalanceCard locale="zh" />);

    const buy = await screen.findByRole("button", { name: /购买补充包/ });
    expect(buy).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("入门包")).not.toBeInTheDocument();

    await user.click(buy);
    expect(buy).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("入门包")).toBeVisible();
    // 每个补充包都有支付宝 / 微信支付两个支付按钮（4 包 × 2）
    expect(screen.getAllByRole("button", { name: /支付宝/ })).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: /微信支付/ })).toHaveLength(4);
  });

  it("keeps the referral entry one click away inside the card", async () => {
    stubRoutes({
      [ENTITLEMENTS]: { plan: "free", used: 1, monthlyLimit: 50, available: 550 },
      [SPEND_SUMMARY]: { ok: false }
    });

    render(<CreditBalanceCard locale="zh" />);

    const invite = await screen.findByRole("link", {
      name: /邀请好友，双方各得 100 创作点数/
    });
    expect(invite).toHaveAttribute("href", "/invite");
  });
});
