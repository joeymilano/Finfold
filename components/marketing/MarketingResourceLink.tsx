"use client";

import Link from "next/link";
import React from "react";
import type { ReactNode } from "react";
import { captureEvent } from "@/lib/posthog";
import type { Locale } from "@/lib/i18n";

export type MarketingResourceKind = "tool" | "blog" | "use_case";
export type MarketingResourceSurface = "landing" | "tools_index" | "blog_index" | "use_cases_index";

export function MarketingResourceLink({
  href,
  resourceType,
  slug,
  surface,
  locale,
  className,
  children
}: {
  href: string;
  resourceType: MarketingResourceKind;
  slug: string;
  surface: MarketingResourceSurface;
  locale: Locale;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => captureEvent("marketing_resource_clicked", {
        resourceType,
        slug,
        surface,
        locale
      })}
    >
      {children}
    </Link>
  );
}
