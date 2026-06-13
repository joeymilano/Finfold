"use client";

import posthog from "posthog-js";

let initialized = false;

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
    posthog.capture(event, properties);
  }
}
