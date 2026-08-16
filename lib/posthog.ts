"use client";

import posthog from "posthog-js";
import { getAcquisitionPersonProperties, getAcquisitionProperties } from "@/lib/acquisition";

let initialized = false;
let identifiedUserId: string | null = null;

export function initPostHog() {
  if (initialized || !process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return;
  }

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: true
  });
  initialized = true;
}

export function captureEvent(event: string, properties?: Record<string, unknown>) {
  if (!initialized) {
    initPostHog();
  }

  if (initialized) {
    posthog.capture(event, { ...getAcquisitionProperties(), ...properties });
  }
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
