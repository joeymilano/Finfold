import type { PlatformId } from "@/lib/platforms";

/**
 * Per-platform safe posting cadence, extending the bestFor/avoidList
 * knowledge already in lib/platforms.ts with a numeric safety rule this
 * module can actually check against publish history. Values are
 * conservative, publicly-known platform norms (not scraped rate limits) —
 * the goal is warning a user BEFORE they trip a platform's spam/风控
 * detector, not modeling the platform's actual internal thresholds.
 *
 * This reframes 风控 from "Finfold's platform risk" (a judge concern) into
 * "Finfold protects you from platform risk" (a sellable feature): the same
 * concern, told from the user's side of the risk instead of ours.
 */
export type CadenceRule = {
  /** Maximum posts considered safe within the rolling window below. */
  maxPostsPerWindow: number;
  /** Rolling window, in hours, that maxPostsPerWindow applies to. */
  windowHours: number;
  /** Minimum hours to leave between two posts on this platform. */
  minHoursBetweenPosts: number;
};

const DEFAULT_RULE: CadenceRule = { maxPostsPerWindow: 3, windowHours: 24, minHoursBetweenPosts: 2 };

export const PLATFORM_CADENCE_RULES: Record<PlatformId, CadenceRule> = {
  // Search/recommendation platforms with strong spam detection on repeat
  // posting from the same account in a short window.
  xiaohongshu: { maxPostsPerWindow: 2, windowHours: 24, minHoursBetweenPosts: 4 },
  // Zhihu penalizes low-quality and spam-like behavior at the community
  // level. This is deliberately conservative and advisory, not a claimed
  // platform rate limit.
  zhihu: { maxPostsPerWindow: 2, windowHours: 24, minHoursBetweenPosts: 6 },
  wechat: { maxPostsPerWindow: 1, windowHours: 24, minHoursBetweenPosts: 20 },
  moments: { maxPostsPerWindow: 3, windowHours: 24, minHoursBetweenPosts: 3 },
  // X's own dedup/spam filter flags bursts of near-identical posts —
  // see lib/platforms.ts's X avoidList entry on mass reposting.
  x: { maxPostsPerWindow: 4, windowHours: 24, minHoursBetweenPosts: 2 },
  linkedin: { maxPostsPerWindow: 1, windowHours: 24, minHoursBetweenPosts: 20 },
  instagram: { maxPostsPerWindow: 2, windowHours: 24, minHoursBetweenPosts: 4 },
  facebook: { maxPostsPerWindow: 2, windowHours: 24, minHoursBetweenPosts: 4 },
  // Reddit's self-promotion norms are stricter than any other platform here
  // — most subreddits' 9:1 rule effectively means "rarely more than once a
  // week" per community; this is the account-level floor.
  reddit: { maxPostsPerWindow: 1, windowHours: 168, minHoursBetweenPosts: 72 },
  "product-hunt": { maxPostsPerWindow: 1, windowHours: 720, minHoursBetweenPosts: 720 },
  threads: { maxPostsPerWindow: 4, windowHours: 24, minHoursBetweenPosts: 2 },
  "hacker-news": { maxPostsPerWindow: 1, windowHours: 168, minHoursBetweenPosts: 48 },
  "indie-hackers": { maxPostsPerWindow: 2, windowHours: 168, minHoursBetweenPosts: 24 },
  "medium-substack": { maxPostsPerWindow: 1, windowHours: 72, minHoursBetweenPosts: 48 }
};

export function getCadenceRule(platform: PlatformId): CadenceRule {
  return PLATFORM_CADENCE_RULES[platform] ?? DEFAULT_RULE;
}

export type CadenceWarning = {
  platform: PlatformId;
  /** "window" = would exceed the rolling-window post cap; "spacing" = too
   * soon after the most recent post. A platform can trigger both — the
   * caller decides whether to show one or both. */
  reason: "window" | "spacing";
  postsInWindow: number;
  rule: CadenceRule;
  /** Hours until the next post would be safe under the violated rule. */
  hoursUntilSafe: number;
};

/**
 * Checks whether posting to `platform` right now would exceed its safe
 * cadence, given the user's own recent published_at timestamps on that
 * platform (already-flat list of ISO strings — caller filters to one
 * platform and one user before calling, matching kit_outputs.published_at
 * used by PerformancePanel/OutputBoard "posted" tracking).
 *
 * Returns null when posting now is safe. This is advisory only — it never
 * blocks the publish action itself (users can and do publish through
 * external tools first, then just log the outcome in Finfold), it only
 * warns.
 */
export function checkPublishCadence(
  platform: PlatformId,
  recentPublishedAtIso: string[],
  now: Date = new Date()
): CadenceWarning | null {
  const rule = getCadenceRule(platform);
  const nowMs = now.getTime();

  const timestamps = recentPublishedAtIso
    .map((iso) => new Date(iso).getTime())
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => b - a);

  const windowMs = rule.windowHours * 60 * 60 * 1000;
  const postsInWindow = timestamps.filter((ms) => nowMs - ms < windowMs).length;

  if (postsInWindow >= rule.maxPostsPerWindow) {
    const oldestInWindow = Math.min(...timestamps.filter((ms) => nowMs - ms < windowMs));
    const hoursUntilSafe = Math.max(0, Math.ceil((oldestInWindow + windowMs - nowMs) / (60 * 60 * 1000)));
    return { platform, reason: "window", postsInWindow, rule, hoursUntilSafe };
  }

  const mostRecent = timestamps[0];
  if (mostRecent !== undefined) {
    const hoursSinceLast = (nowMs - mostRecent) / (60 * 60 * 1000);
    if (hoursSinceLast < rule.minHoursBetweenPosts) {
      const hoursUntilSafe = Math.max(0, Math.ceil(rule.minHoursBetweenPosts - hoursSinceLast));
      return { platform, reason: "spacing", postsInWindow, rule, hoursUntilSafe };
    }
  }

  return null;
}
