import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BillingPage from "@/app/(dashboard)/billing/page";

const mocks = vi.hoisted(() => ({ locale: "zh", plan: "free", paymentProvider: null as string | null, selectedPlan: null as string | null }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => mocks.locale }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mocks.selectedPlan ? `plan=${mocks.selectedPlan}` : "") }));
vi.mock("@/lib/posthog", () => ({ captureEvent: vi.fn() }));
vi.mock("@/components/billing/CreditBalanceCard", () => ({ CreditBalanceCard: () => null }));
vi.mock("@/components/billing/CreditPackStore", () => ({ CreditPackStore: () => null }));

beforeEach(() => {
  mocks.locale = "zh";
  mocks.plan = "free";
  mocks.paymentProvider = null;
  mocks.selectedPlan = null;
  vi.stubGlobal("fetch", vi.fn(async (url) => ({
    ok: !String(url).includes("checkout"),
    json: async () => String(url).includes("entitlements")
      ? { authenticated: true, plan: mocks.plan, paymentProvider: mocks.paymentProvider }
      : { error: "Checkout test stop" }
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("monthly renewal billing UI", () => {
  it("opens a payment-method panel with branded scan wallets and card checkout", async () => {
    const user = userEvent.setup();
    render(<BillingPage />);
    // Chinese purchasable plans have no checkbox — payment methods live in the
    // panel behind the single subscribe button.
    await screen.findByRole("article", { name: "入门版" });
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    const starter = within(screen.getByRole("article", { name: "入门版" }));
    expect(starter.getByText("¥79")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "免费试用" })).getByText("¥0")).toBeInTheDocument();
    const growth = within(screen.getByRole("article", { name: "增长引擎" }));
    expect(growth.getByText("¥999")).toBeInTheDocument();
    await user.click(starter.getByRole("button", { name: "开始使用" }));
    const panel = starter.getByRole("group", { name: "选择支付方式" });
    // Official brand marks: Alipay blue, WeChat Pay green.
    expect(within(panel).getByRole("img", { name: "支付宝" })).toBeInTheDocument();
    expect(within(panel).getByRole("img", { name: "微信支付" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /支付宝/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /微信支付/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /信用卡 · 连续包月/ })).toBeInTheDocument();
    // Alipay row starts the CNY scan checkout.
    await user.click(within(panel).getByRole("button", { name: /支付宝/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/checkout-zcwpay", expect.objectContaining({
      body: expect.stringContaining('"channel":"alipay"')
    })));
    // Card row enters the Creem monthly offer without any checkbox round-trip.
    await waitFor(() => expect(within(panel).getByRole("button", { name: /信用卡 · 连续包月/ })).toBeEnabled());
    await user.click(within(panel).getByRole("button", { name: /信用卡 · 连续包月/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/checkout", expect.objectContaining({
      body: JSON.stringify({ plan: "starter", market: "cn", locale: "zh", paymentMethod: "creem", autoRenew: true })
    })));
  });

  it("lets zh buyers self-serve the digital employee through the same panel", async () => {
    const user = userEvent.setup();
    render(<BillingPage />);
    const employee = within(await screen.findByRole("article", { name: "数字员工" }));
    expect(employee.getByText("¥2,999")).toBeInTheDocument();
    // No application dead end in zh — the card opens the same payment panel.
    await user.click(employee.getByRole("button", { name: "开通" }));
    const panel = employee.getByRole("group", { name: "选择支付方式" });
    expect(within(panel).getByRole("button", { name: /支付宝/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /微信支付/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /信用卡 · 连续包月/ })).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: /微信支付/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/checkout-zcwpay", expect.objectContaining({
      body: expect.stringContaining('"planId":"digital_employee_v2"')
    })));
  });

  it("shows the USD discount and disclosure in English", async () => {
    mocks.locale = "en";
    const user = userEvent.setup();
    render(<BillingPage />);
    const choices = await screen.findAllByRole("checkbox", { name: /Monthly auto-renewal/ });
    await user.click(choices[1]);
    const creator = within(screen.getByRole("article", { name: "Creator" }));
    expect(creator.getAllByText("$26.10", { exact: false })).toHaveLength(2);
    expect(creator.getByText(/First month and every renewal are 10% off/)).toBeInTheDocument();
    // en has no scan channel yet — the digital employee stays application-based.
    const employee = within(screen.getByRole("article", { name: "Digital Employee" }));
    expect(employee.getByRole("button", { name: "Apply for access" })).toBeInTheDocument();
    expect(employee.getByText("$399")).toBeInTheDocument();
  });

  it("does not promise a new subscription offer to existing subscribers", async () => {
    mocks.plan = "creator_v2";
    mocks.paymentProvider = "creem";
    render(<BillingPage />);
    expect(await screen.findByRole("button", { name: "取消连续包月" })).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("lets a current subscriber downgrade through the same payment panel", async () => {
    mocks.plan = "creator_v2";
    mocks.paymentProvider = "zcwpay";
    const user = userEvent.setup();
    render(<BillingPage />);
    const starter = within(await screen.findByRole("article", { name: "入门版" }));
    // The downgrade card keeps its label but opens the normal panel — no
    // "contact support" dead end.
    await user.click(starter.getByRole("button", { name: "降级至入门版" }));
    const panel = starter.getByRole("group", { name: "选择支付方式" });
    expect(within(panel).getByRole("button", { name: /支付宝/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /微信支付/ })).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: /支付宝/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/checkout-zcwpay", expect.objectContaining({
      body: expect.stringContaining('"planId":"starter_v2"')
    })));
  });
});
