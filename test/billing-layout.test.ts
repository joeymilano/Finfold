import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const billingPage = readFileSync(
  join(process.cwd(), "app/(dashboard)/billing/page.tsx"),
  "utf8"
);

describe("billing information hierarchy", () => {
  it("keeps all five plan cards in one comparison row", () => {
    expect(billingPage).toContain('aria-label={locale === "en" ? "Plan comparison" : "套餐横向对比"}');
    expect(billingPage).toContain('className="grid min-w-[1320px] grid-cols-5 items-stretch gap-5"');
    expect(billingPage).not.toContain("sm:grid-cols-2 xl:grid-cols-5");
  });

  it("merges application-only plan acquisition without replacing direct checkout", () => {
    expect(billingPage).toContain("getBillingPlanAcquisition");
    expect(billingPage).toContain("function startPlanApplication(plan: PaidPublicPlanKey)");
    expect(billingPage).toContain('acquisition.kind === "checkout"');
    expect(billingPage).toContain('acquisition_mode: "application"');
  });

  it("moves supporting content into two secondary disclosures", () => {
    expect(billingPage).toContain('locale === "en" ? "Help me choose" : "选套餐帮助"');
    expect(billingPage).toContain('locale === "en" ? "Payments & billing" : "支付与账单"');
  });

  it("hosts the top-up store and referral entry inside the balance card", () => {
    // 购买入口并入余额卡：页面底部不再有「点数与加购」面板，
    // CreditPackStore 只在 CreditBalanceCard 内以 embedded 模式渲染。
    expect(billingPage).not.toContain("点数与加购");
    expect(billingPage).not.toContain("Credits & top-ups");
    expect(billingPage).not.toContain("CreditPackStore");
    expect(billingPage).not.toContain('"/invite"');

    const balanceCard = readFileSync(
      join(process.cwd(), "components/billing/CreditBalanceCard.tsx"),
      "utf8"
    );
    expect(balanceCard).toContain('locale === "zh" ? "购买补充包" : "Top up credits"');
    expect(balanceCard).toContain("<CreditPackStore locale={locale} embedded />");
    expect(balanceCard).toContain('href="/invite"');
    expect(balanceCard).toContain('referral_entry_clicked');
  });

  it("advertises the live scan-to-pay wallets without stale suspension copy", () => {
    // Scan-to-pay (Alipay/WeChat via the ZCW gateway) is live: the wallets
    // are advertised, the retired-channel suspension notice is gone.
    expect(billingPage).toContain("支付宝 / 微信支付");
    expect(billingPage).not.toContain("扫码付款已停用");
    expect(billingPage).not.toContain("Alipay QR checkout is suspended");
  });

  it("maps stored plan ids into the current ladder without legacy or support-switch messaging", () => {
    expect(billingPage).toContain('plan === "employee" || plan === "digital_employee_v2"');
    expect(billingPage).not.toContain("你的旧版订阅已保留");
    expect(billingPage).not.toContain("Your legacy subscription is protected");
    expect(billingPage).not.toContain("联系支持切换套餐");
    expect(billingPage).not.toContain("Contact support to switch");
    expect(billingPage).not.toContain("联系支持降级");
  });
});
