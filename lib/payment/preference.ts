import type { Locale } from "@/lib/i18n";
import type { PricingCurrency, PricingMarket } from "@/lib/pricing";
import type { Region } from "@/lib/payment/types";

export type BillingPaymentMethod = "card" | "alipay_qrcode";
export type BillingPreferenceSource =
  | "explicit_locale"
  | "explicit_market"
  | "accept_language"
  | "country"
  | "default";

export type BillingPreference = {
  locale: Locale;
  market: PricingMarket;
  currency: PricingCurrency;
  preferredPaymentMethod: BillingPaymentMethod;
  region: Region;
  source: BillingPreferenceSource;
};

type BillingPreferenceInput = {
  locale?: string | null;
  market?: string | null;
  countryCode?: string | null;
  acceptLanguage?: string | null;
};

const CHINA_REGION_COUNTRIES = new Set(["CN", "HK", "MO"]);

function normalizeCountryCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function localeFromAcceptLanguage(value: string | null | undefined): Locale | null {
  const firstLanguage = value?.split(",", 1)[0]?.trim().toLowerCase() ?? "";
  if (/^zh(?:-|$)/.test(firstLanguage)) return "zh";
  if (/^en(?:-|$)/.test(firstLanguage)) return "en";
  return null;
}

function preferenceForLocale(
  locale: Locale,
  region: Region,
  source: BillingPreferenceSource
): BillingPreference {
  return locale === "zh"
    ? {
        locale,
        market: "cn",
        currency: "CNY",
        preferredPaymentMethod: "alipay_qrcode",
        region,
        source
      }
    : {
        locale,
        market: "global",
        currency: "USD",
        preferredPaymentMethod: "card",
        region,
        source
      };
}

/**
 * Resolves the checkout presentation and preferred settlement path without
 * pretending that locale is a precise geolocation signal. A deliberate UI
 * language wins, then an explicit market from older clients, then the request
 * language, and finally Cloudflare's country header. Users can still choose
 * the alternate payment method; this only determines the safe default.
 */
export function resolveBillingPreference(input: BillingPreferenceInput): BillingPreference {
  const countryCode = normalizeCountryCode(input.countryCode);
  const region: Region = countryCode && CHINA_REGION_COUNTRIES.has(countryCode) ? "CN" : "INTL";

  if (input.locale === "zh" || input.locale === "en") {
    return preferenceForLocale(input.locale, region, "explicit_locale");
  }

  if (input.market === "cn" || input.market === "global") {
    return preferenceForLocale(input.market === "cn" ? "zh" : "en", region, "explicit_market");
  }

  const requestLocale = localeFromAcceptLanguage(input.acceptLanguage);
  if (requestLocale) {
    return preferenceForLocale(requestLocale, region, "accept_language");
  }

  if (region === "CN") {
    return preferenceForLocale("zh", region, "country");
  }

  return preferenceForLocale("en", region, "default");
}

export function resolveBillingPreferenceFromRequest(
  request: Request,
  input?: Pick<BillingPreferenceInput, "locale" | "market">
): BillingPreference {
  return resolveBillingPreference({
    locale: input?.locale,
    market: input?.market,
    countryCode: request.headers.get("CF-IPCountry"),
    acceptLanguage: request.headers.get("Accept-Language")
  });
}
