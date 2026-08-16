"use client";

import { useEffect } from "react";
import { clearAnalyticsIdentity, identifyAnalyticsUser, initPostHog } from "@/lib/posthog";

/** Mounted once in the root layout so PostHog captures pageviews across the app. */
export function PostHogInit() {
  useEffect(() => {
    initPostHog();

    const controller = new AbortController();
    void fetch("/api/auth/user", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((data: { user?: { id: string; plan?: string | null; locale?: string | null } | null }) => {
        if (data.user?.id) identifyAnalyticsUser(data.user);
        else clearAnalyticsIdentity();
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  return null;
}
