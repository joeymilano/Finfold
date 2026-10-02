"use client";

import posthog from "posthog-js";
import { getAcquisitionPersonProperties, getAcquisitionProperties } from "@/lib/acquisition";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;
let identifiedUserId: string | null = null;

export function initPostHog() {
  if (initialized || !process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return;
  }

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: true,
    // Automatic pageviews/clicks follow the same exclusions as custom events.
    before_send: (event) => event ? {
      ...event, properties: { ...event.properties, ...getAcquisitionProperties() }
    } : event,
    loaded: (client) => client.register(getAcquisitionProperties())
  });
  initialized = true;
}

export function captureEvent(event: string, properties?: Record<string, unknown>) {
  if (!initialized) {
    initPostHog();
  }

  if (initialized) {
    const acquisition = getAcquisitionProperties();
    posthog.register(acquisition);
    posthog.capture(event, { ...acquisition, ...properties });
  }

  captureGoogleGrowthEvent(event, properties);
}

/**
 * Mirrors only the small set of decision-grade funnel events GA4 needs.
 * Arbitrary PostHog properties are intentionally excluded so credentials,
 * free text, and product-operating details never drift into Google Analytics.
 */
export function captureGoogleGrowthEvent(event: string, properties: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;

  if (event === "marketing_cta_clicked" && properties.destination === "signup") {
    window.gtag("event", "generate_lead", {
      content_type: stringProperty(properties.source_type),
      content_id: stringProperty(properties.source_slug),
      locale: stringProperty(properties.locale)
    });
    return;
  }

  if (event === "signup_destination_reached" && properties.destination_matches === true) {
    window.gtag("event", "sign_up", {
      method: stringProperty(properties.auth_method),
      locale: stringProperty(properties.locale),
      signup_value_variant: stringProperty(properties.signup_value_variant)
    });
    return;
  }

  if (event === "checkout_started") {
    const planKey = stringProperty(properties.plan_key);
    window.gtag("event", "begin_checkout", {
      currency: stringProperty(properties.currency),
      value: numberProperty(properties.price),
      items: planKey ? [{ item_id: planKey, item_name: planKey, quantity: 1 }] : []
    });
  }
}

function stringProperty(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 100 ? value : undefined;
}

function numberProperty(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Joins anonymous acquisition events to the authenticated product journey.
 * Email is intentionally excluded; only stable product dimensions are sent.
 */
export function identifyAnalyticsUser(user: { id: string; plan?: string | null; locale?: string | null }) {
  if (!initialized) initPostHog();
  if (!initialized || identifiedUserId === user.id) return;

  const acquisition = getAcquisitionPersonProperties();
  const identityProperties: Record<string, string> = {
    locale: user.locale ?? "unknown",
    ...acquisition.set
  };
  if (user.plan) identityProperties.plan = user.plan;
  posthog.identify(
    user.id,
    identityProperties,
    acquisition.setOnce
  );
  identifiedUserId = user.id;
}

export function clearAnalyticsIdentity() {
  if (!initialized || !identifiedUserId) return;
  posthog.reset();
  identifiedUserId = null;
}
