import { z } from "zod";
import { searchPublicWebByQuery } from "@/lib/agent/web-search-evidence";
import { sendRawPrompt } from "@/lib/llm";
import { askJev, jevEnabled, type JevQuestions } from "@/lib/jev";
import { logInfo, logWarn } from "@/lib/observability";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import { createXPublicationJob } from "@/lib/x-pipeline/jobs";
import { runJevBatchAutoReview, type AutoReviewDraft } from "@/lib/x-pipeline/auto-review";
import {
  countXJobsCreatedToday,
  getXPipelineSettings,
  listXWatchlist,
  type XPipelineSettings
} from "@/lib/x-pipeline/settings";
import type { XContentSnapshot } from "@/lib/x-pipeline/content";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const PROMPT_VERSION = "x-engagement-2026-09-18.1";
const TARGET_FRESHNESS_SINCE_DAYS = 7;
const MIN_TARGET_SNIPPET_CHARS = 80;

export type XEngagementResult = {
  users: number;
  created: number;
  skipped: string[];
};

type ReplyTarget = {
  tweetId: string;
  handle: string;
  content: string;
  url: string;
  /** Jev triage verdict appended when reply pre-filtering is active. */
  audienceType?: string | null;
};

/** P(worth replying) below this drops the target before sonnet sees it. */
export const TRIAGE_WORTH_REPLYING_MIN = 0.6;

export type ReplyTriageVerdict = {
  target: ReplyTarget;
  /** null = Jev could not judge this target — keep it and let sonnet skip. */
  worthReplying: number | null;
  audienceType: string | null;
};

export function buildReplyTriageQuestions(targetCount: number): JevQuestions {
  const questions: JevQuestions = {};
  for (let index = 0; index < targetCount; index += 1) {
    questions[`worth_${index}`] = {
      type: "noul",
      instructions: `Judging only from the indexed snippet (it may be truncated), is target ${index} substantive enough that a thoughtful reply can add real value — a concrete question, an opinion worth engaging, or a build/result being shared? Pure link drops, memes, and engagement bait are not worth replying to.`
    };
    questions[`audience_${index}`] = {
      type: "choice",
      instructions: `Classify the author of target ${index} from their post.`,
      criteria: {
        potential_customer: "describes a problem or need the brand's product plausibly addresses",
        peer_builder: "a fellow builder or creator sharing work or opinions — reply as a peer",
        noise: "low-substance content: memes, copypasta, engagement bait, off-topic chatter",
        hostile: "aggressive, trolling, or bad-faith content — engaging risks a flame war",
        other: "anything else"
      }
    };
  }
  return questions;
}

/** Filter triage verdicts down to the targets sonnet should draft against. */
export function selectTriageTargets(verdicts: ReplyTriageVerdict[]): ReplyTarget[] {
  return verdicts
    .filter((verdict) => verdict.worthReplying === null
      || verdict.worthReplying >= TRIAGE_WORTH_REPLYING_MIN)
    .map((verdict) => verdict.target);
}

/**
 * Jev pre-filter between target discovery and sonnet drafting: one fan-out
 * call asks worth-replying + author type for every target. Returns null
 * whenever Jev is disabled or unavailable — callers then fall back to the
 * pre-Jev behavior (all targets to sonnet, whose own skip logic still
 * applies), so triage can only narrow spend, never widen it.
 */
export async function triageReplyTargets(
  targets: ReplyTarget[],
  brandDigest: string,
  options: { userId?: string } = {}
): Promise<ReplyTriageVerdict[] | null> {
  if (!targets.length || !jevEnabled()) return null;
  try {
    const result = await askJev(
      {
        brand_context: brandDigest,
        targets: targets.map((target, index) => ({
          index,
          handle: `@${target.handle}`,
          post: target.content
        }))
      },
      buildReplyTriageQuestions(targets.length),
      { operation: "x_engagement_triage", userId: options.userId }
    );
    const answers = result.answers as unknown as Record<string, Record<string, unknown>>;
    return targets.map((target, index) => {
      const worth = answers[`worth_${index}`];
      const audience = answers[`audience_${index}`];
      const probability = worth && typeof worth.noul === "number" ? worth.noul : null;
      return {
        target: {
          ...target,
          audienceType: audience && typeof audience.choice === "string" ? audience.choice : null
        },
        worthReplying: probability,
        audienceType: audience && typeof audience.choice === "string" ? audience.choice : null
      };
    });
  } catch (error) {
    // Triage is an optimization, not a gate: unavailability degrades to the
    // full target list, and sonnet's own skip rule still filters.
    logWarn("jev_triage_unavailable", { userId: options.userId }, {
      operation: "x_engagement_triage",
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown"
    });
    return null;
  }
}

const replyPlanSchema = z.object({
  replies: z
    .array(
      z.object({
        targetIndex: z.coerce.number().int().min(0),
        text: z.string().min(1).max(280),
        skip: z.boolean().optional()
      })
    )
    .min(0)
});

/** Extracts handle + status id from an x.com/twitter.com permalink. */
export function parseStatusUrl(url: string): { handle: string; tweetId: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "x.com" && parsed.hostname !== "twitter.com") return null;
    const match = parsed.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{5,32})(?:\/|$)/);
    if (!match) return null;
    return { handle: match[1].toLowerCase(), tweetId: match[2] };
  } catch {
    return null;
  }
}

async function discoverReplyTargets(
  admin: AdminClient,
  userId: string,
  watchAccounts: string[],
  keywords: string[],
  limit: number
): Promise<ReplyTarget[]> {
  const since = new Date(Date.now() - TARGET_FRESHNESS_SINCE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data: replied } = await admin
    .from("x_publication_jobs")
    .select("reply_to_tweet_id")
    .eq("user_id", userId)
    .eq("kind", "reply")
    .not("reply_to_tweet_id", "is", null);
  const alreadyReplied = new Set((replied ?? []).map((row) => row.reply_to_tweet_id as string));

  const queries: string[] = [];
  for (const account of watchAccounts.slice(0, 6)) {
    queries.push(keywords.length ? `from:${account} ${keywords.slice(0, 2).join(" ")}` : `from:${account}`);
  }
  for (const keyword of keywords.slice(0, 3)) {
    queries.push(keyword);
  }

  const byTweetId = new Map<string, ReplyTarget>();
  for (const query of queries) {
    if (byTweetId.size >= limit * 2) break;
    try {
      const evidence = await searchPublicWebByQuery(
        { query, domains: ["x.com", "twitter.com"], language: "en", since },
        { maxAttempts: 1 }
      );
      if (!evidence.available) continue;
      for (const source of evidence.sources) {
        const status = parseStatusUrl(source.url);
        if (!status) continue;
        if (alreadyReplied.has(status.tweetId)) continue;
        const content = `${source.title} ${source.snippet}`.trim();
        if (content.length < MIN_TARGET_SNIPPET_CHARS) continue;
        if (!byTweetId.has(status.tweetId)) {
          byTweetId.set(status.tweetId, {
            tweetId: status.tweetId,
            handle: status.handle,
            content: content.slice(0, 1_500),
            url: source.url
          });
        }
      }
    } catch {
      // One provider hiccup must not sink the whole engagement pass.
    }
  }
  return [...byTweetId.values()].slice(0, limit);
}

function buildEngagementPrompt(input: {
  targets: ReplyTarget[];
  brandDigest: string;
  targetCount: number;
}): string {
  const targets = input.targets
    .map(
      (target, index) =>
        `${index}. @${target.handle} posted: ${target.content}${target.audienceType ? ` [author type: ${target.audienceType}]` : ""}`
    )
    .join("\n\n");
  return [
    "You write high-quality X (Twitter) replies that earn profile visits for a product account.",
    "",
    "BRAND CONTEXT:",
    input.brandDigest,
    "",
    "TARGET POSTS (index, author, content as indexed by web search — the snippet may be truncated):",
    targets,
    "",
    "REPLY RULES:",
    `- Draft replies for the strongest ${input.targetCount} target(s). Set "skip": true when a snippet is too thin to add real value — never guess at context.`,
    "- Match the tone to the author type when given: talk shop with peer_builder, answer the underlying need for potential_customer (still as a person, not a pitch), and set skip:true for hostile unless one calm sentence genuinely defuses it.",
    "- 1-3 sentences, under 220 characters. Add one concrete thing: a mechanism, a failure mode, a contrarian angle grounded in the target, or a genuinely-first-hand anecdote from BRAND CONTEXT. Never invented statistics.",
    "- Talk like a peer, not an account. No sycophantic openers (\"Great post!\", \"Love this\"), no reversal framing (\"It's not X, it's Y\"), no \"Here's the thing\", no em-dashes (—).",
    "- Mention the product in at most one reply of the batch, and only when it is genuinely the answer.",
    "- Pure English text only — no Chinese characters.",
    "",
    'Return JSON: {"replies":[{"targetIndex":0,"text":"...","skip":false}]}'
  ].join("\n");
}

async function draftXReplies(input: {
  targets: ReplyTarget[];
  brandDigest: string;
  targetCount: number;
}): Promise<z.infer<typeof replyPlanSchema>> {
  const prompt = buildEngagementPrompt(input);
  const raw = await sendRawPrompt(prompt, {
    modelTier: "sonnet",
    operation: "x_engagement_draft",
    promptVersion: PROMPT_VERSION,
    maxTokens: 1_600
  });
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const parsed = replyPlanSchema.safeParse(JSON.parse(trimmed));
  if (!parsed.success) throw new Error("X engagement drafting returned an unusable plan.");
  return parsed.data;
}

async function loadBrandDigestLine(admin: AdminClient, userId: string): Promise<string> {
  const { data } = await admin
    .from("brand_brains")
    .select("brand_name, product_description, positioning_statement")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return "A pragmatic indie builder sharing what actually works.";
  return [data.brand_name, data.product_description, data.positioning_statement]
    .filter(Boolean)
    .join(" — ") || "A pragmatic indie builder sharing what actually works.";
}

async function engageForUser(
  admin: AdminClient,
  userId: string,
  settings: XPipelineSettings,
  now: Date
): Promise<number> {
  const used = await countXJobsCreatedToday(admin, userId, ["reply"], now);
  const remaining = settings.dailyReplyLimit - used;
  if (remaining <= 0) return 0;

  const watchlist = await listXWatchlist(admin, userId, { activeOnly: true });
  const accounts = watchlist.filter((entry) => entry.kind === "account").map((entry) => entry.value);
  const keywords = watchlist.filter((entry) => entry.kind === "keyword").map((entry) => entry.value);
  if (!accounts.length && !keywords.length) return 0;

  const discovered = await discoverReplyTargets(admin, userId, accounts, keywords, remaining + 2);
  if (!discovered.length) return 0;

  const brandDigest = await loadBrandDigestLine(admin, userId);

  // Cheap Jev pre-filter first; only worth-replying targets reach sonnet.
  let targets = discovered;
  const verdicts = await triageReplyTargets(discovered, brandDigest, { userId });
  if (verdicts) {
    targets = selectTriageTargets(verdicts);
    if (!targets.length) return 0;
  }

  const plan = await draftXReplies({ targets, brandDigest, targetCount: remaining });

  let created = 0;
  const pendingAutoReview: AutoReviewDraft[] = [];
  for (const reply of plan.replies) {
    if (reply.skip) continue;
    if (created >= remaining) break;
    const target = targets[reply.targetIndex];
    if (!target) continue;
    const snapshot: XContentSnapshot = {
      kind: "reply",
      tweets: [{ text: reply.text.trim(), mediaUrl: null }],
      replyToTweetId: target.tweetId,
      quoteTweetId: null,
      replyContext: {
        handle: `@${target.handle}`,
        text: target.content.slice(0, 400)
      },
      language: "en",
      topic: {
        source: "watchlist",
        ref: `reply:${target.tweetId}`,
        title: `Reply to @${target.handle}`
      },
      notes: target.url
    };
    const result = await createXPublicationJob(admin, {
      userId,
      snapshot,
      scheduledFor: new Date(now.getTime() + created * 5 * 60_000).toISOString(),
      // jev_guarded creates as needs_approval too; the Jev pass below decides.
      initialStatus: settings.reviewMode === "spot_check" ? "scheduled" : "needs_approval"
    });
    if (result.ok) {
      created += 1;
      pendingAutoReview.push({ jobId: result.id, snapshot });
    }
  }
  if (settings.reviewMode === "jev_guarded" && pendingAutoReview.length) {
    await runJevBatchAutoReview(admin, userId, pendingAutoReview, {
      brandDigest,
      operation: "x_engagement_draft"
    });
  }
  return created;
}

/**
 * Engagement pass (20:30 Beijing): discover fresh watchlist posts via public
 * web search (status IDs parsed from result URLs — zero X API read quota),
 * draft replies, and queue them behind the same review gate as posts.
 */
export async function runXEngagementPass(
  admin: AdminClient,
  input: { now?: Date; userId?: string } = {}
): Promise<XEngagementResult> {
  const now = input.now ?? new Date();
  const result: XEngagementResult = { users: 0, created: 0, skipped: [] };
  if (input.userId) {
    const settings = await getXPipelineSettings(admin, input.userId);
    if (!settings.engagementEnabled || settings.paused) {
      result.skipped.push("engagement_disabled_or_paused");
      return result;
    }
    result.users = 1;
    result.created = await engageForUser(admin, input.userId, settings, now);
    return result;
  }

  const { data: enabledUsers, error } = await admin
    .from("x_pipeline_settings")
    .select("user_id")
    .eq("engagement_enabled", true)
    .eq("paused", false);
  if (error) throw error;
  for (const row of enabledUsers ?? []) {
    const userId = row.user_id as string;
    try {
      const settings = await getXPipelineSettings(admin, userId);
      result.users += 1;
      result.created += await engageForUser(admin, userId, settings, now);
    } catch (userError) {
      result.skipped.push(
        `user_failed:${userError instanceof Error ? userError.message.slice(0, 120) : "unknown"}`
      );
    }
  }
  logInfo("x_engagement_completed", {}, {
    users: result.users,
    created: result.created,
    skipped: result.skipped.length
  });
  return result;
}
