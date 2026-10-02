import { z } from "zod";
import { sendRawPrompt } from "@/lib/llm";
import { logInfo } from "@/lib/observability";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import {
  buildTextFreeVisualPrompt,
  coverImageSizeForPlatform,
  generateImage,
  isImageGenConfigured
} from "@/lib/image-gen";
import { persistGeneratedImageForDelivery } from "@/lib/image-persistence";
import {
  createXPublicationJob
} from "@/lib/x-pipeline/jobs";
import { runJevBatchAutoReview, type AutoReviewDraft } from "@/lib/x-pipeline/auto-review";
import { filterAdaptableTopics } from "@/lib/x-pipeline/topic-adaptability";
import {
  countXJobsCreatedToday,
  getXPipelineSettings,
  listXWatchlist,
  type XPipelineSettings
} from "@/lib/x-pipeline/settings";
import type { XContentSnapshot } from "@/lib/x-pipeline/content";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const PROMPT_VERSION = "x-morning-2026-09-18.1";
const TOPIC_REUSE_LOOKBACK_DAYS = 30;
const STAGGER_MINUTES_PER_POST = 8;

export type XMorningGenerationResult = {
  users: number;
  created: number;
  skipped: string[];
};

type DraftTopic = XContentSnapshot["topic"] & {
  whyNow: string | null;
  whyYou: string | null;
  format: string | null;
};

const draftPlanSchema = z
  .object({
    posts: z
      .array(
        z.object({
          format: z.enum(["post", "thread"]),
          tweets: z.array(z.string().min(1).max(280)).min(1).max(12),
          imageIdea: z.string().max(600).optional(),
          topicIndex: z.coerce.number().int().min(0)
        })
      )
      .min(1)
  })
  .superRefine((value, ctx) => {
    for (const [index, post] of value.posts.entries()) {
      if (post.format === "post" && post.tweets.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Post ${index}: a single post must be exactly one tweet.`
        });
      }
      if (post.format === "thread" && post.tweets.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Post ${index}: a thread needs at least two tweets.`
        });
      }
      for (const [tweetIndex, tweet] of post.tweets.entries()) {
        if (/[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/.test(tweet)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Post ${index} tweet ${tweetIndex}: English output only — CJK characters are not allowed.`
          });
        }
      }
    }
  });

export async function loadBrandDigest(admin: AdminClient, userId: string): Promise<string> {
  const { data } = await admin
    .from("brand_brains")
    .select("brand_name, product_description, target_audience, positioning_statement, tone_keywords")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return "No brand profile is filled in yet — write as a pragmatic indie builder sharing what actually works.";
  const lines = [
    data.brand_name ? `Brand: ${data.brand_name}` : null,
    data.product_description ? `Product: ${data.product_description}` : null,
    data.target_audience ? `Audience: ${data.target_audience}` : null,
    data.positioning_statement ? `Positioning: ${data.positioning_statement}` : null,
    data.tone_keywords ? `Tone keywords: ${data.tone_keywords}` : null
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n") || "No brand profile details available yet.";
}

export async function selectTopics(
  admin: AdminClient,
  userId: string,
  limit: number,
  brandDigest: string
): Promise<DraftTopic[]> {
  const since = new Date(Date.now() - TOPIC_REUSE_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: usedRefs } = await admin
    .from("x_publication_jobs")
    .select("content_snapshot->topic->>ref")
    .eq("user_id", userId)
    .gte("created_at", since)
    // A rejected or cancelled draft did not ship, so its topic stays usable.
    .not("status", "in", "(rejected,cancelled)");
  const used = new Set(
    (usedRefs ?? []).map((row) => String((row as Record<string, unknown>)["ref"] ?? ""))
  );

  // The radar tags every opportunity with the user's single best platform,
  // so recommended_platform="x" alone starves the pipeline. x-tagged topics
  // flow directly; topics recommended for other platforms must pass the Jev
  // adaptability screen (fail-closed: without a judgment only x-tagged flow).
  const { data: opportunities } = await admin
    .from("topic_opportunities")
    .select("id, main_angle, why_now, why_you, rank_score, recommended_format, recommended_platform")
    .eq("user_id", userId)
    .eq("state", "active")
    .order("rank_score", { ascending: false })
    .limit(24);
  const rows = (opportunities ?? []).filter((row) => !used.has(`radar:${row.id}`));
  const xTagged = rows.filter((row) => row.recommended_platform === "x");
  const crossPlatform = rows.filter((row) => row.recommended_platform !== "x");
  const adaptable = await filterAdaptableTopics(
    userId,
    brandDigest,
    crossPlatform.map((row) => ({
      id: String(row.id),
      title: String(row.main_angle),
      whyNow: row.why_now,
      whyYou: row.why_you
    }))
  );
  const eligibleIds = new Set(xTagged.map((row) => String(row.id)));
  if (adaptable !== null) for (const id of adaptable) eligibleIds.add(id);
  const radarTopics: DraftTopic[] = rows
    .filter((row) => eligibleIds.has(String(row.id)))
    .slice(0, limit)
    .map((row) => ({
      source: "radar" as const,
      ref: `radar:${row.id}`,
      title: row.main_angle,
      whyNow: row.why_now,
      whyYou: row.why_you,
      format: row.recommended_format
    }));
  if (radarTopics.length >= limit) return radarTopics;

  const keywords = (await listXWatchlist(admin, userId, { activeOnly: true }))
    .filter((entry) => entry.kind === "keyword" && !used.has(`keyword:${entry.value}`))
    .slice(0, limit - radarTopics.length)
    .map((entry) => ({
      source: "watchlist" as const,
      ref: `keyword:${entry.value}`,
      title: entry.value,
      whyNow: entry.note,
      whyYou: null,
      format: null
    }));
  return [...radarTopics, ...keywords];
}

function buildMorningPrompt(input: {
  topics: DraftTopic[];
  brandDigest: string;
  targetCount: number;
  watchedAccounts: string[];
}): string {
  const topics = input.topics
    .map(
      (topic, index) =>
        `${index}. ${topic.title}${topic.whyNow ? ` | why now: ${topic.whyNow}` : ""}${topic.whyYou ? ` | why us: ${topic.whyYou}` : ""}`
    )
    .join("\n");
  const accounts = input.watchedAccounts.length
    ? input.watchedAccounts.map((handle) => `@${handle}`).join(", ")
    : "none configured";
  return [
    "You draft the day's X (Twitter) content for a product account. Output strict JSON only.",
    "Topics may arrive in Chinese — your output is always pure English.",
    "",
    "BRAND CONTEXT (the only first-hand facts you may speak from):",
    input.brandDigest,
    "",
    "TOPICS (pick the strongest; at most one item per topic):",
    topics,
    "",
    `WATCHED CREATORS (structural inspiration for hooks only — never imitate a specific post or mention them): ${accounts}.`,
    "",
    "VOICE — write like one specific builder talking, not a content account:",
    "- You are a person who ships things and has opinions. When you don't have a real number or event, you don't invent one — you give the mechanism, the reasoning, or the honest uncertainty instead.",
    "- Start in the middle of a concrete thought. The first tweet is an actual claim or observation, never a trailer for what follows.",
    "- State opinions directly, then give the grounds next to them. Mild bias is fine; so is changing your mind on the record.",
    "- Every tweet adds one new concrete thing (a reason, a mechanism, a real product fact from BRAND CONTEXT, a counter-consideration). Restating the same point in new words is not progress.",
    "- Vary sentence length. Short fragments are fine. Plain words beat vocabulary.",
    "- End where the thought ends. No summary tweet, no callback, no 'that's the whole strategy'.",
    "",
    "NEVER do these (they are instant AI tells):",
    "- No reversal framing: 'It's not X, it's Y', 'Most people think… actually…', 'The real secret is', 'Unpopular opinion', 'Here's the thing', 'The truth is'.",
    "- No invented first-person metrics, growth arcs, or case studies (fake 'Month 1: 200 likes' narratives are the worst offender).",
    "- No numbered-lesson scaffolding ('5 lessons', '3 things I learned', Month 1/2/3 arcs) unless the material truly is that list.",
    "- No em-dashes (—). Use periods and commas.",
    "- No engagement bait, no '🧵 thread' openers, at most 1 hashtag, no sycophancy.",
    "",
    "FORMAT:",
    `- Produce exactly ${input.targetCount} item(s): a mix of single posts and threads.`,
    "- Single post: exactly one tweet, under 240 characters.",
    "- Thread: 5-12 tweets, each 150-240 characters (hard cap 280).",
    "- Every item includes imageIdea: one visual concept (subject + mood + palette) that works WITHOUT any text in the image.",
    "",
    'Return JSON: {"posts":[{"format":"post"|"thread","tweets":["..."],"imageIdea":"...","topicIndex":0}]}'
  ].join("\n");
}

async function draftXPosts(input: {
  topics: DraftTopic[];
  brandDigest: string;
  targetCount: number;
  watchedAccounts: string[];
}): Promise<z.infer<typeof draftPlanSchema>> {
  const prompt = buildMorningPrompt(input);
  const raw = await sendRawPrompt(prompt, {
    modelTier: "sonnet",
    operation: "x_morning_generation",
    promptVersion: PROMPT_VERSION,
    maxTokens: 2_800
  });
  let parsed = draftPlanSchema.safeParse(JSON.parse(stripJsonFence(raw)));
  if (!parsed.success) {
    // One repair round-trip: surface the validation errors to the model.
    const repaired = await sendRawPrompt(
      `${prompt}\n\nYour previous reply was invalid JSON (${parsed.error.issues[0]?.message ?? "schema mismatch"}). Return ONLY corrected JSON.`,
      { modelTier: "sonnet", operation: "x_morning_generation_repair", promptVersion: PROMPT_VERSION, maxTokens: 2_800 }
    );
    parsed = draftPlanSchema.safeParse(JSON.parse(stripJsonFence(repaired)));
    if (!parsed.success) throw new Error("X draft generation returned an unusable plan.");
  }
  return parsed.data;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  return trimmed;
}

async function generatePostImage(
  userId: string,
  imageIdea: string | undefined
): Promise<string | null> {
  if (!imageIdea || !isImageGenConfigured("illustration")) return null;
  try {
    const outcome = await generateImage(
      buildTextFreeVisualPrompt(imageIdea, "x"),
      coverImageSizeForPlatform("x"),
      undefined,
      { purpose: "illustration" }
    );
    if (outcome.kind === "url") return outcome.url;
    return await persistGeneratedImageForDelivery(userId, outcome);
  } catch (error) {
    // A failed image must never block the draft from reaching review.
    logInfo("x_publication_image_skipped", { userId }, {
      reason: error instanceof Error ? error.message.slice(0, 200) : "image_generation_failed"
    });
    return null;
  }
}

async function generateForUser(
  admin: AdminClient,
  userId: string,
  settings: XPipelineSettings,
  now: Date
): Promise<number> {
  const used = await countXJobsCreatedToday(admin, userId, ["post", "thread"], now);
  const remaining = settings.dailyPostLimit - used;
  if (remaining <= 0) return 0;

  const brandDigest = await loadBrandDigest(admin, userId);
  const topics = await selectTopics(admin, userId, Math.min(remaining, 6), brandDigest);
  if (!topics.length) return 0;

  const watchlist = await listXWatchlist(admin, userId, { activeOnly: true });
  const watchedAccounts = watchlist
    .filter((entry) => entry.kind === "account")
    .map((entry) => entry.value);

  const plan = await draftXPosts({
    topics,
    brandDigest,
    targetCount: remaining,
    watchedAccounts
  });

  let created = 0;
  const pendingAutoReview: AutoReviewDraft[] = [];
  for (const [index, post] of plan.posts.slice(0, remaining).entries()) {
    const topic = topics[Math.min(post.topicIndex, topics.length - 1)];
    const mediaUrl = await generatePostImage(userId, post.imageIdea);
    const snapshot: XContentSnapshot = {
      kind: post.format,
      tweets: post.tweets.map((text) => ({ text: text.trim(), mediaUrl: index === 0 ? mediaUrl : null })),
      replyToTweetId: null,
      quoteTweetId: null,
      language: "en",
      topic,
      notes: post.imageIdea ?? null
    };
    const scheduledFor = new Date(now.getTime() + index * STAGGER_MINUTES_PER_POST * 60_000).toISOString();
    const result = await createXPublicationJob(admin, {
      userId,
      snapshot,
      scheduledFor,
      // jev_guarded creates as needs_approval too; the Jev pass below decides.
      initialStatus: settings.reviewMode === "spot_check" ? "scheduled" : "needs_approval"
    });
    if (result.ok) {
      created += 1;
      pendingAutoReview.push({
        jobId: result.id,
        snapshot,
        topicBackground: [topic.whyNow, topic.whyYou].filter(Boolean).join(" | ") || null
      });
    }
  }
  if (settings.reviewMode === "jev_guarded" && pendingAutoReview.length) {
    await runJevBatchAutoReview(admin, userId, pendingAutoReview, {
      brandDigest,
      operation: "x_morning_generation"
    });
  }
  return created;
}

/**
 * Morning generation pass (08:00 Beijing): topic selection → English drafts
 * → one illustration for the lead item → needs_approval jobs. Spot-check
 * mode schedules directly instead of waiting for review.
 */
export async function runXMorningGeneration(
  admin: AdminClient,
  input: { now?: Date; userId?: string } = {}
): Promise<XMorningGenerationResult> {
  const now = input.now ?? new Date();
  const result: XMorningGenerationResult = { users: 0, created: 0, skipped: [] };
  if (input.userId) {
    const settings = await getXPipelineSettings(admin, input.userId);
    if (!settings.generationEnabled || settings.paused) {
      result.skipped.push("generation_disabled_or_paused");
      return result;
    }
    result.users = 1;
    result.created = await generateForUser(admin, input.userId, settings, now);
    return result;
  }

  const { data: enabledUsers, error } = await admin
    .from("x_pipeline_settings")
    .select("user_id")
    .eq("generation_enabled", true)
    .eq("paused", false);
  if (error) throw error;
  for (const row of enabledUsers ?? []) {
    const userId = row.user_id as string;
    try {
      const settings = await getXPipelineSettings(admin, userId);
      result.users += 1;
      result.created += await generateForUser(admin, userId, settings, now);
    } catch (userError) {
      result.skipped.push(
        `user_failed:${userError instanceof Error ? userError.message.slice(0, 120) : "unknown"}`
      );
    }
  }
  logInfo("x_morning_generation_completed", {}, {
    users: result.users,
    created: result.created,
    skipped: result.skipped.length
  });
  return result;
}
