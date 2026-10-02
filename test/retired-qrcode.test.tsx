import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QrcodePayClient } from "@/components/billing/QrcodePayClient";
import { CreditPackStore } from "@/components/billing/CreditPackStore";
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("retired static QR collection", () => {
  it.each(["2099-01-01", "2020-01-01"])("keeps unpaid order records without soliciting payment even at expiry %s", async (expiresAt) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({order: {
      id: "order", orderCode: "FF-EXISTING", amountYuan: "79.88", status: "pending", plan: "starter_v2", expiresAt
    }}) })));
    render(<QrcodePayClient orderId="order" />);
    expect(await screen.findByRole("heading", { name: "此付款方式已停用" })).toBeInTheDocument();
    expect(screen.getByText(/原订单金额.*79.88/)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "支付宝收款码" })).not.toBeInTheDocument();
    expect(screen.queryByText(/请返回重新下单|请按精确金额支付|自动匹配/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "处理已付款订单" })).toHaveAttribute("href", expect.stringContaining("FF-EXISTING"));
  });
  it("preserves fulfilled order status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({order: {
      id: "order", status: "paid", plan: "starter_v2", credits: 600
    }}) })));
    render(<QrcodePayClient orderId="order" />);
    expect(await screen.findByRole("heading", { name: "支付成功，已确认到账" })).toBeInTheDocument();
  });
  it("offers Alipay and WeChat scan-to-pay at CNY prices for zh credit packs", async () => {
    const user = userEvent.setup();
    render(<CreditPackStore locale="zh" />);
    await user.click(screen.getByRole("button", { name: /购买创作点数补充包/ }));
    expect(screen.getAllByRole("button", { name: "支付宝" })).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "微信支付" })).toHaveLength(4);
    // Brand marks ride along inside the buttons (decorative — the text label
    // carries the accessible name): Alipay blue #1677FF, WeChat green #07C160.
    const alipayBtn = screen.getAllByRole("button", { name: "支付宝" })[0];
    expect(alipayBtn.querySelector("svg[aria-hidden='true'] rect[fill='#1677FF']")).toBeInTheDocument();
    const wechatBtn = screen.getAllByRole("button", { name: "微信支付" })[0];
    expect(wechatBtn.querySelector("svg[aria-hidden='true'] rect[fill='#07C160']")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "信用卡 · USD" })).not.toBeInTheDocument();
    // zh buyers see explicit CNY prices, not runtime-converted USD.
    expect(screen.getAllByText(/¥\d+/).length).toBeGreaterThanOrEqual(4);
  });
});
