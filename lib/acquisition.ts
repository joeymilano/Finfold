const STORAGE_KEY = "finfold-acquisition-v1";

export type AcquisitionContentType =
  | "landing"
  | "blog_index"
  | "blog_post"
  | "tools_index"
  | "tool"
  | "use_cases_index"
  | "use_case"
  | "other";

export type AcquisitionTouch = {
  capturedAt: string;
  landingPath: string;
  referrerDomain: string;
  locale: "zh" | "en";
  contentType: AcquisitionContentType;
  contentSlug?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
};

type AcquisitionContext = {
  first: AcquisitionTouch;
  latest: AcquisitionTouch;
};

function clean(value: string | null, maxLength = 160): string | undefined {
  const normalized = value?.trim().slice(0, maxLength);
  return normalized || undefined;
}

export function classifyMarketingPath(pathname: string): {
  contentType: AcquisitionContentType;
  contentSlug?: string;
  locale: "zh" | "en";
} {
  const segments = pathname.split("/").filter(Boolean);
  const locale = segments[0] === "en" ? "en" : "zh";
  const route = locale === "en" ? segments.slice(1) : segments;

  if (route.length === 0) return { contentType: "landing", locale };
  if (route[0] === "blog") {
    return route[1]
      ? { contentType: "blog_post", contentSlug: route[1], locale }
      : { contentType: "blog_index", locale };
  }
  if (route[0] === "tools") {
    return route[1]
      ? { contentType: "tool", contentSlug: route[1], locale }
      : { contentType: "tools_index", locale };
  }
  if (route[0] === "use-cases") {
    return route[1]
      ? { contentType: "use_case", contentSlug: route[1], locale }
      : { contentType: "use_cases_index", locale };
  }
  return { contentType: "other", locale };
}

function referrerDomain(): string {
  if (!document.referrer) return "direct";
  try {
    const referrer = new URL(document.referrer);
    return referrer.hostname === window.location.hostname ? "internal" : referrer.hostname;
  } catch {
    return "unknown";
  }
}

function currentTouch(): AcquisitionTouch {
  const classified = classifyMarketingPath(window.location.pathname);
  const query = new URLSearchParams(window.location.search);
  return {
    capturedAt: new Date().toISOString(),
    landingPath: window.location.pathname,
    referrerDomain: referrerDomain(),
    locale: classified.locale,
    contentType: classified.contentType,
    contentSlug: classified.contentSlug,
    utmSource: clean(query.get("utm_source")),
    utmMedium: clean(query.get("utm_medium")),
    utmCampaign: clean(query.get("utm_campaign")),
    utmContent: clean(query.get("utm_content")),
    utmTerm: clean(query.get("utm_term"))
  };
}

function readContext(): AcquisitionContext | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<AcquisitionContext>;
    return parsed.first && parsed.latest ? parsed as AcquisitionContext : null;
  } catch {
    return null;
  }
}

function sameTouch(left: AcquisitionTouch, right: AcquisitionTouch): boolean {
  return left.landingPath === right.landingPath
    && left.contentType === right.contentType
    && left.contentSlug === right.contentSlug
    && left.utmSource === right.utmSource
    && left.utmMedium === right.utmMedium
    && left.utmCampaign === right.utmCampaign
    && left.utmContent === right.utmContent
    && left.utmTerm === right.utmTerm;
}

/**
 * Saves first-touch once and refreshes last-touch only on public acquisition
 * pages. Navigating to signup, billing, or the app must not erase the content
 * page that actually brought the visitor into the funnel.
 */
export function refreshAcquisitionContext(): AcquisitionContext | null {
  if (typeof window === "undefined") return null;

  const touch = currentTouch();
  const stored = readContext();
  const context: AcquisitionContext = stored ?? { first: touch, latest: touch };

  if (touch.contentType !== "other" && !sameTouch(context.latest, touch)) {
    context.latest = touch;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
  } catch {
    // Attribution is helpful, never required for the product to work.
  }
  return context;
}

function flattenTouch(prefix: "first" | "latest", touch: AcquisitionTouch): Record<string, string> {
  const values: Record<string, string | undefined> = {
    [`${prefix}_touch_at`]: touch.capturedAt,
    [`${prefix}_landing_path`]: touch.landingPath,
    [`${prefix}_referrer_domain`]: touch.referrerDomain,
    [`${prefix}_locale`]: touch.locale,
    [`${prefix}_content_type`]: touch.contentType,
    [`${prefix}_content_slug`]: touch.contentSlug,
    [`${prefix}_utm_source`]: touch.utmSource,
    [`${prefix}_utm_medium`]: touch.utmMedium,
    [`${prefix}_utm_campaign`]: touch.utmCampaign,
    [`${prefix}_utm_content`]: touch.utmContent,
    [`${prefix}_utm_term`]: touch.utmTerm
  };
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

export function getAcquisitionProperties(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const context = refreshAcquisitionContext();
  if (!context) return {};
  return {
    ...flattenTouch("first", context.first),
    ...flattenTouch("latest", context.latest)
  };
}

export function getAcquisitionPersonProperties(): {
  set: Record<string, string>;
  setOnce: Record<string, string>;
} {
  const properties = getAcquisitionProperties();
  return {
    set: Object.fromEntries(Object.entries(properties).filter(([key]) => key.startsWith("latest_"))),
    setOnce: Object.fromEntries(Object.entries(properties).filter(([key]) => key.startsWith("first_")))
  };
}
