"use client";

import type { MouseEvent } from "react";
import { Download } from "@/components/ui/icons";
import { captureEvent } from "@/lib/posthog";
import type { Locale } from "@/lib/i18n";

/**
 * The zip anchor, separated into a client component so the click can be
 * counted. `download` keeps the browser from navigating away.
 */
export function ExtensionDownloadButton({
  href,
  version,
  locale,
  label,
  className
}: {
  href: string;
  version: string;
  locale: Locale;
  label: string;
  className?: string;
}) {
  const onClick = (_event: MouseEvent<HTMLAnchorElement>) => {
    captureEvent("extension_zip_download_clicked", {
      extension_version: version,
      locale
    });
  };

  return (
    <a href={href} download onClick={onClick} className={className}>
      <Download className="h-4.5 w-4.5" />
      {label}
    </a>
  );
}
