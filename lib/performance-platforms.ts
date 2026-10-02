import type { PlatformId } from "@/lib/platforms";

export const POLLABLE_PLATFORMS = ["reddit", "hacker-news", "product-hunt", "x"] as const;
export type PollablePlatform = (typeof POLLABLE_PLATFORMS)[number];

export function isPollablePlatform(platform: string): platform is PollablePlatform {
  return (POLLABLE_PLATFORMS as readonly string[]).includes(platform);
}

export function isAllowedPlatformUrl(platform: PollablePlatform, value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    switch (platform) {
      case "reddit":
        return host === "reddit.com" || host.endsWith(".reddit.com") || host === "redd.it";
      case "hacker-news":
        return host === "news.ycombinator.com";
      case "product-hunt":
        return host === "producthunt.com" || host.endsWith(".producthunt.com");
      case "x":
        return host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com");
    }
  } catch {
    return false;
  }
}

export function supportsPublishedUrlBackfill(platform: PlatformId): platform is PollablePlatform {
  return isPollablePlatform(platform);
}
