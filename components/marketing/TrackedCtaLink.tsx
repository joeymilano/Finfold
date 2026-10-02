"use client";

import Link from "next/link";
import React from "react";
import type { MouseEvent, ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { captureEvent } from "@/lib/posthog";

export type MarketingCtaSource = "landing" | "site_header" | "blog_post" | "tool" | "use_case";

export function TrackedCtaLink({
  href,
  sourceType,
  sourceSlug,
  sourceSurface = "content",
  ctaId,
  destination,
  locale,
  className,
  ariaLabel,
  audienceState,
  onClick,
  children
}: {
  href: string;
  sourceType: MarketingCtaSource;
  sourceSlug?: string;
  sourceSurface?: string;
  ctaId?: string;
  destination: string;
  locale: Locale;
  className?: string;
  ariaLabel?: string;
  audienceState?: "anonymous" | "authenticated";
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  children: ReactNode;
}) {
  const stableCtaId = ctaId ?? [sourceType, sourceSlug ?? "index", destination].join(":");

  return (
    <Link
      href={href}
      className={className}
      aria-label={ariaLabel}
      onClick={(event) => {
        captureEvent("marketing_cta_clicked", {
          cta_id: stableCtaId,
          source_type: sourceType,
          ...(sourceSlug ? { source_slug: sourceSlug } : {}),
          source_surface: sourceSurface,
          destination,
          locale,
          ...(audienceState ? { audience_state: audienceState } : {})
        });
        onClick?.(event);
      }}
    >
      {children}
    </Link>
  );
}
