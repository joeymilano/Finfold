"use client";

import Link from "next/link";
import React from "react";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { captureEvent } from "@/lib/posthog";

export type MarketingCtaSource = "landing" | "blog_post" | "tool" | "use_case";

export function TrackedCtaLink({
  href,
  sourceType,
  sourceSlug,
  destination,
  locale,
  className,
  children
}: {
  href: string;
  sourceType: MarketingCtaSource;
  sourceSlug?: string;
  destination: string;
  locale: Locale;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => captureEvent("marketing_cta_clicked", {
        sourceType,
        sourceSlug,
        destination,
        locale
      })}
    >
      {children}
    </Link>
  );
}
