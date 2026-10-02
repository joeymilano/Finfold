import { describe, expect, it } from "vitest";
import {
  resolveBillingPreference,
  resolveBillingPreferenceFromRequest
} from "@/lib/payment/preference";

describe("billing preference", () => {
  it("prioritizes USD card settlement for an explicit English experience", () => {
    expect(resolveBillingPreference({ locale: "en", countryCode: "CN" })).toMatchObject({
      locale: "en",
      market: "global",
      currency: "USD",
      preferredPaymentMethod: "card",
      region: "CN",
      source: "explicit_locale"
    });
  });

  it("prioritizes Alipay CNY for an explicit Chinese experience", () => {
    expect(resolveBillingPreference({ locale: "zh", countryCode: "US" })).toMatchObject({
      locale: "zh",
      market: "cn",
      currency: "CNY",
      preferredPaymentMethod: "alipay_qrcode",
      region: "INTL",
      source: "explicit_locale"
    });
  });

  it("uses Cloudflare country only when no language or market preference exists", () => {
    const request = new Request("https://finfold.app/api/checkout", {
      headers: { "CF-IPCountry": "HK", "Accept-Language": "fr-FR,fr;q=0.9" }
    });

    expect(resolveBillingPreferenceFromRequest(request)).toMatchObject({
      locale: "zh",
      market: "cn",
      currency: "CNY",
      preferredPaymentMethod: "alipay_qrcode",
      region: "CN",
      source: "country"
    });
  });

  it("keeps older explicit market clients deterministic when locale is absent", () => {
    expect(resolveBillingPreference({ market: "global", countryCode: "CN" })).toMatchObject({
      locale: "en",
      market: "global",
      currency: "USD",
      preferredPaymentMethod: "card",
      source: "explicit_market"
    });
  });
});
