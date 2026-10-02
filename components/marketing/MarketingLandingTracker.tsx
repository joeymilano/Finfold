"use client";

import { useEffect } from "react";
import { captureEvent } from "@/lib/posthog";
import type { AcquisitionContentType } from "@/lib/acquisition";
import type { Locale } from "@/lib/i18n";

export function MarketingLandingTracker({
  contentType,
  contentSlug,
  locale
}: {
  contentType: AcquisitionContentType;
  contentSlug?: string;
  locale: Locale;
}) {
  useEffect(() => {
    captureEvent("landing_view", {
      contentType,
      ...(contentSlug ? { contentSlug } : {}),
      locale,
      path: window.location.pathname
    });
  }, [contentSlug, contentType, locale]);

  return null;
}
