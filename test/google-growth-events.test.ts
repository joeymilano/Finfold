import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn(), identify: vi.fn(), init: vi.fn(), reset: vi.fn() }
}));

vi.mock("@/lib/acquisition", () => ({
  getAcquisitionPersonProperties: () => ({ set: {}, setOnce: {} }),
  getAcquisitionProperties: () => ({ traffic_class: "production" })
}));

import { captureGoogleGrowthEvent } from "@/lib/posthog";

describe("GA4 growth event bridge", () => {
  const gtag = vi.fn();

  beforeEach(() => {
    gtag.mockClear();
    Object.defineProperty(window, "gtag", { configurable: true, value: gtag });
  });

  it("records only signup CTAs as leads", () => {
    captureGoogleGrowthEvent("marketing_cta_clicked", {
      destination: "signup",
      source_type: "blog_post",
      source_slug: "reddit-first-customers-manual-outreach",
      locale: "en"
    });
    captureGoogleGrowthEvent("marketing_cta_clicked", { destination: "workbench_preview" });

    expect(gtag).toHaveBeenCalledOnce();
    expect(gtag).toHaveBeenCalledWith("event", "generate_lead", {
      content_type: "blog_post",
      content_id: "reddit-first-customers-manual-outreach",
      locale: "en"
    });
  });

  it("records a sign up only after the requested destination is reached", () => {
    captureGoogleGrowthEvent("signup_destination_reached", {
      destination_matches: false,
      auth_method: "google"
    });
    captureGoogleGrowthEvent("signup_destination_reached", {
      destination_matches: true,
      auth_method: "google",
      locale: "en",
      signup_value_variant: "free_value_v1"
    });

    expect(gtag).toHaveBeenCalledOnce();
    expect(gtag).toHaveBeenCalledWith("event", "sign_up", {
      method: "google",
      locale: "en",
      signup_value_variant: "free_value_v1"
    });
  });

  it("records checkout value without passing arbitrary properties", () => {
    captureGoogleGrowthEvent("checkout_started", {
      plan_key: "starter",
      currency: "USD",
      price: 12,
      email: "must-not-leak@example.com"
    });

    expect(gtag).toHaveBeenCalledWith("event", "begin_checkout", {
      currency: "USD",
      value: 12,
      items: [{ item_id: "starter", item_name: "starter", quantity: 1 }]
    });
    expect(JSON.stringify(gtag.mock.calls)).not.toContain("must-not-leak");
  });
});
