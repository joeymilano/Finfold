/**
 * 日更流水线 · 公众号长文通道（P0）。
 *
 * Daily generation: radar/positioning topic selection → one Chinese
 * long-form article draft (strict JSON, anti-AI-tell voice) → deterministic
 * human-writing checks → Jev five-question gate (fail-closed: without a
 * passing judgment the article waits for the human in the console, it never
 * auto-sends) → optional cover image → minimal content_kit/kit_outputs rows
 * so the untouched wechat_publication_jobs machine can carry it to the
 * Official Account draft box. Publishing always stops at the draft box.
 */
import { z } from "zod";
import { sendRawPrompt } from "@/lib/llm";
import { logInfo } from "@/lib/observability";
import { reserveCredits, refundCredits } from "@/lib/payment/credits";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import {
  buildTextFreeVisualPrompt,
  coverImageSizeForPlatform,
  generateImage,
  isImageGenConfigured
} from "@/lib/image-gen";
import { persistGeneratedImageForDelivery } from "@/lib/image-persistence";
import { ANTI_AI_RULES, HUMAN_WRITING_RULES, PLATFORM_FORMAT_RULES } from "@/lib/prompts";
import { loadBrandDigest } from "@/lib/x-pipeline/generate";
import { runWechatJevReview, type WechatJevReview } from "@/lib/wechat-jev-review";
import { createWechatPublicationJobFromOutput } from "@/lib/wechat-publication-create";
import { listSocialConnectionsWithAccounts } from "@/lib/social-connections";
import {
  contentPipelineEnabled,
  countBilledRunsToday,
  getContentPipelineSettings,
  type ContentPipelineChannel,
  type ContentPipelineSettings
} from "@/lib/content-pipeline/settings";
import { fetchHighPerformers } from "@/lib/performance-examples";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const PROMPT_VERSION = "daily-article-2026-09-24.1";
const TOPIC_REUSE_LOOKBACK_DAYS = 30;
/** Per-article credit cost — mirror of the signal-discovery per-call pricing. */
export const WECHAT_ARTICLE_CREDIT_COST = 2;
const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;

export type DailyArticleGenerationResult = {
  users: number;
  created: number;
  skipped: string[];
};

export type DailyTopic = {
  source: "radar" | "pillar";
  ref: string;
  title: string;
  whyNow: string | null;
  whyYou: string | null;
};

// ---------------------------------------------------------------------------
// Topic selection (shared by both channels; dedup is per channel).
// ---------------------------------------------------------------------------

export async function selectDailyTopic(
  admin: AdminClient,
  userId: string,
  channel: ContentPipelineChannel
): Promise<DailyTopic | null> {
  const since = new Date(Date.now() - TOPIC_REUSE_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: usedRuns } = await admin
    .from("content_pipeline_runs")
    .select("topic_ref")
    .eq("user_id", userId)
    .eq("channel", channel)
    .in("status", ["awaiting_review", "jev_blocked", "draft_sent"])
    .gte("created_at", since);
  const used = new Set((usedRuns ?? []).map((row) => String(row.topic_ref ?? "")).filter(Boolean));

  // The X pipeline screens cross-platform radar topics through a Jev
  // adaptability gate because a China-platform-specific mechanic cannot carry
  // an English post. Both daily-pipeline channels write Chinese for Chinese
  // platforms, so that failure mode disappears — every active radar topic
  // flows, no extra Jev call is spent.
  const { data: opportunities } = await admin
    .from("topic_opportunities")
    .select("id, main_angle, why_now, why_you, rank_score")
    .eq("user_id", userId)
    .eq("state", "active")
    .order("rank_score", { ascending: false })
    .limit(24);
  const radarTopic = (opportunities ?? [])
    .find((row) => row.main_angle && !used.has(`radar:${row.id}`));
  if (radarTopic) {
    return {
      source: "radar",
      ref: `radar:${radarTopic.id}`,
      title: radarTopic.main_angle,
      whyNow: radarTopic.why_now,
      whyYou: radarTopic.why_you
    };
  }

  // Fallback: the confirmed Xiaohongshu positioning pillars — durable topic
  // directions the user has already committed to.
  const { data: profile } = await admin
    .from("creator_strategy_profiles")
    .select("content_pillars")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const pillars = Array.isArray(profile?.content_pillars)
    ? profile.content_pillars.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const pillar = pillars.find((value) => !used.has(`pillar:${value}`));
  if (pillar) {
    return { source: "pillar", ref: `pillar:${pillar}`, title: pillar, whyNow: null, whyYou: null };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Past top performers (perfExamples-style voice anchoring), shared by both
// channels — the xiaohongshu side reads the same imported note metrics.
// ---------------------------------------------------------------------------

export async function loadPerfDigest(admin: AdminClient, userId: string, platform: string): Promise<string> {
  const byPlatform = await fetchHighPerformers(admin, userId, [platform]);
  const examples = byPlatform[platform] ?? [];
  if (!examples.length) return "暂无数据。";
  return examples
    .slice(0, 2)
    .map((example) => `《${example.title}》片段：${example.body.replace(/\s+/g, " ").slice(0, 160)}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Draft generation.
// ---------------------------------------------------------------------------

const articleDraftSchema = z
  .object({
    titleCandidates: z.array(z.string().min(6).max(32)).length(5),
    title: z.string().min(6).max(32),
    summary: z.string().min(36).max(120),
    body: z.string().min(1_200).max(3_500),
    cta: z.string().min(1).max(200),
    hookSection: z.string().max(600).nullable(),
    coverIdea: z.string().max(200).optional(),
    tags: z.array(z.string().min(1).max(30)).min(5).max(8)
  })
  .superRefine((value, ctx) => {
    if (!CJK_PATTERN.test(value.title)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "title must be Chinese" });
    }
    const dense = value.body.replace(/\s/g, "");
    const cjkCount = (dense.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
    if (dense.length > 0 && cjkCount / dense.length < 0.25) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "body must be Chinese-dominant" });
    }
    if (value.body.includes("**")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "body must not contain literal ** markers" });
    }
    if (value.body.includes("—")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "body must not contain em-dashes" });
    }
  });

export type DailyArticleDraft = z.infer<typeof articleDraftSchema>;

function buildDailyArticlePrompt(input: {
  topic: DailyTopic;
  brandDigest: string;
  perfExamples: string;
  leadMagnets: { name: string; hookCopy: string; deliveryNote: string }[];
}): string {
  const magnets = input.leadMagnets.length
    ? input.leadMagnets.map((magnet) => `- 素材名：${magnet.name}；领取方式：${magnet.deliveryNote || "见文内说明"}${magnet.hookCopy ? `；参考话术：${magnet.hookCopy}` : ""}`).join("\n")
    : "无（则 hookSection 必须为 null，结尾只做自然的下一步引导）";
  return [
    "你为一位公众号号主写今天的日更长文。只输出严格 JSON，不要输出任何其他文字。",
    "",
    "品牌背景（唯一可作为第一手事实来源的材料，超出范围的事实一律不编造）：",
    input.brandDigest,
    "",
    "过往爆款（已验证读者买账的写法参考，只学语气和切入角度，不复用内容）：",
    input.perfExamples,
    "",
    "今日选题（只写这一篇）：",
    input.topic.title,
    input.topic.whyNow ? `时机：${input.topic.whyNow}` : null,
    input.topic.whyYou ? `与号主的匹配：${input.topic.whyYou}` : null,
    "",
    "结尾资料钩子素材（钩子段落唯一允许引用的素材）：",
    magnets,
    "",
    "VOICE — 像一个具体的、见过事的人在说话，不像一个内容账号：",
    "- 你是一个实际在做事、有观点的人。没有真实数字和事件时就不编造，改为讲机制、讲推理、坦承不确定。",
    "- 开头直接进入一个具体的想法或场景，不做预告，不写「今天想聊聊」。",
    "- 观点先给，依据紧跟。允许有倾向，也允许公开修正看法。",
    "- 每一段都要推进一点新东西：一个理由、一个机制、一个来自品牌背景的真实事实、一个反面考虑。换个说法重复同一个意思不算推进。",
    "- 句子长短要有变化，短句可以用，大白话好过书面词。",
    "- 想法讲完就停。不写总结段，不写金句收尾。",
    "",
    "绝对不要（出现即作废）：",
    "- 不用翻案句式：「不是……而是……」「很多人以为……其实……」「真正的关键是」「真相是」。",
    "- 不编造第一人称数据、成长故事或案例。",
    "- 不硬拆三点五步式编号框架，除非材料本身就是那个清单。",
    "- 不用破折号（——或—），用句号和逗号。",
    `- 不用这些词：值得注意的是、综上所述、与此同时、先说结论、赋能、抓手、底层逻辑。`,
    "- 不输出 Markdown 加粗符号 **，正文用纯文本，段与段之间空一行。",
    "- 标题不标题党，承诺必须是正文兑现得了的。",
    "",
    "格式：",
    "- 标题不超过 25 个字，前 10 个字里埋核心关键词。",
    "- 开头 100 字内进入痛点或一个反常识的观察，绝不以产品介绍开头。",
    "- 每段不超过 5 行，可以每 800 字加一个「## 」开头的小标题。",
    "- 全文 1500-3000 个汉字。",
    "- 结尾给一个具体、不咄咄逼人的下一步。",
    "",
    '返回 JSON：{"titleCandidates":["5 个候选标题"],"title":"选定标题","summary":"36-120 字摘要","body":"正文全文","cta":"结尾行动号召一句话","hookSection":"资料钩子段落或 null","coverIdea":"封面画面构想（主体+氛围+色调，不含任何文字）","tags":["话题标签，不带#号"]}'
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function draftDailyArticle(input: {
  topic: DailyTopic;
  brandDigest: string;
  perfExamples: string;
  leadMagnets: { name: string; hookCopy: string; deliveryNote: string }[];
}): Promise<DailyArticleDraft> {
  const prompt = buildDailyArticlePrompt(input);
  const raw = await sendRawPrompt(prompt, {
    modelTier: "sonnet",
    operation: "content_pipeline_article",
    promptVersion: PROMPT_VERSION,
    maxTokens: 6_500
  });
  let parsed = articleDraftSchema.safeParse(JSON.parse(stripJsonFence(raw)));
  if (!parsed.success) {
    // One repair round-trip: surface the validation errors to the model.
    const repaired = await sendRawPrompt(
      `${prompt}\n\n你上一条回复不符合要求（${parsed.error.issues[0]?.message ?? "schema mismatch"}）。只返回修正后的 JSON。`,
      { modelTier: "sonnet", operation: "content_pipeline_article_repair", promptVersion: PROMPT_VERSION, maxTokens: 6_500 }
    );
    parsed = articleDraftSchema.safeParse(JSON.parse(stripJsonFence(repaired)));
    if (!parsed.success) throw new Error("daily article generation returned an unusable draft.");
  }
  if (!input.leadMagnets.length) parsed.data.hookSection = null;
  return parsed.data;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Cover image (required by the publication snapshot; failure only degrades).
// ---------------------------------------------------------------------------

async function generateArticleCover(userId: string, coverIdea: string | undefined): Promise<string | null> {
  if (!coverIdea || !isImageGenConfigured("cover")) return null;
  try {
    const outcome = await generateImage(
      buildTextFreeVisualPrompt(coverIdea, "wechat"),
      coverImageSizeForPlatform("wechat"),
      undefined,
      { purpose: "cover" }
    );
    if (outcome.kind === "url") return outcome.url;
    return await persistGeneratedImageForDelivery(userId, outcome);
  } catch (error) {
    logInfo("content_pipeline_cover_skipped", { userId }, {
      reason: error instanceof Error ? error.message.slice(0, 200) : "image_generation_failed"
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Persistence.
// ---------------------------------------------------------------------------

export type WechatConnectionTarget = {
  accountId: string;
  displayName: string | null;
};

/** P0 supports a single WeChat connection per user (credential-path limit). */
export async function findWechatConnectionTarget(
  admin: AdminClient,
  userId: string
): Promise<WechatConnectionTarget | null> {
  const connections = await listSocialConnectionsWithAccounts(admin, userId);
  const connection = connections.find((item) => item.connectorId === "wechat" && item.status === "connected");
  const account = connection?.accounts[0];
  if (!connection || !account) return null;
  return { accountId: account.id, displayName: account.displayName ?? account.handle ?? null };
}

async function persistArticleRows(
  admin: AdminClient,
  userId: string,
  topic: DailyTopic,
  draft: DailyArticleDraft,
  coverUrl: string | null
): Promise<{ kitId: string; outputId: string; outputUpdatedAt: string }> {
  const kitId = crypto.randomUUID();
  const outputId = crypto.randomUUID();
  const now = new Date().toISOString();
  const ideaText = [
    `日更流水线 · 公众号长文`,
    `选题：${topic.title}`,
    topic.whyNow ? `时机：${topic.whyNow}` : null,
    topic.whyYou ? `匹配：${topic.whyYou}` : null
  ].filter((line): line is string => Boolean(line)).join("\n");
  const { error: kitError } = await admin.from("content_kits").insert({
    id: kitId,
    user_id: userId,
    idea_text: ideaText,
    goal: "daily_pipeline",
    persona: "",
    platforms: ["wechat"],
    media_assets: [],
    status: "saved",
    created_at: now
  });
  if (kitError) throw new Error(kitError.message);
  const { data: outputRow, error: outputError } = await admin
    .from("kit_outputs")
    .insert({
      id: outputId,
      kit_id: kitId,
      user_id: userId,
      platform: "wechat",
      title: draft.title,
      body: draft.body,
      summary: draft.summary,
      cta: draft.cta,
      notes: draft.tags.join(" "),
      strategy: draft.hookSection ?? "",
      locked: false,
      publish_status: "draft",
      image_url: coverUrl,
      image_prompt: draft.coverIdea ?? null,
      image_source: null,
      final_body: null,
      user_edited: false,
      created_at: now
    })
    .select("updated_at")
    .single();
  if (outputError) {
    await admin.from("content_kits").delete().eq("id", kitId).eq("user_id", userId);
    throw new Error(outputError.message);
  }
  return { kitId, outputId, outputUpdatedAt: outputRow.updated_at };
}

type RunRecordInput = {
  userId: string;
  status: "awaiting_review" | "jev_blocked" | "draft_sent" | "discarded" | "skipped_no_topic" | "failed";
  topicRef: string | null;
  topicTitle: string | null;
  kitId?: string | null;
  outputId?: string | null;
  publicationJobId?: string | null;
  autoReview?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  extra?: Record<string, unknown>;
};

async function recordRun(admin: AdminClient, input: RunRecordInput): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("content_pipeline_runs")
    .insert({
      user_id: input.userId,
      channel: "wechat_articles",
      run_date: now.slice(0, 10),
      status: input.status,
      topic_ref: input.topicRef,
      topic_title: input.topicTitle,
      kit_id: input.kitId ?? null,
      output_id: input.outputId ?? null,
      publication_job_id: input.publicationJobId ?? null,
      auto_review: input.autoReview ?? null,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage?.slice(0, 500) ?? null,
      extra: input.extra ?? {},
      created_at: now,
      updated_at: now
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

// ---------------------------------------------------------------------------
// Per-user generation.
// ---------------------------------------------------------------------------

async function generateArticleForUser(
  admin: AdminClient,
  userId: string,
  settings: ContentPipelineSettings,
  now: Date,
  options: { free?: boolean } = {}
): Promise<{ created: boolean; reason?: string }> {
  if (!settings.wechatArticlesEnabled || settings.paused) return { created: false, reason: "disabled_or_paused" };
  if (!contentPipelineEnabled(userId)) return { created: false, reason: "not_in_pilot" };

  // No WeChat connection required to generate: the article lands in the
  // content library for manual publishing either way. The connection only
  // matters when jev_guarded wants to auto-send into the draft box — without
  // it that run degrades to the every_post console flow with a hint.

  if (!options.free) {
    const usedToday = await countBilledRunsToday(admin, userId, "wechat_articles", now);
    if (usedToday >= settings.wechatDailyCap) return { created: false, reason: "cap_reached" };
  }

  const topic = await selectDailyTopic(admin, userId, "wechat_articles");
  if (!topic) {
    await recordRun(admin, {
      userId, status: "skipped_no_topic", topicRef: null, topicTitle: null,
      errorMessage: "今天没有可用选题：机会雷达无活跃话题，定位支柱也用尽了。"
    });
    return { created: false, reason: "no_topic" };
  }

  let charged = 0;
  if (!options.free) {
    const reservation = await reserveCredits(userId, WECHAT_ARTICLE_CREDIT_COST, "contentPipelineArticle", "daily_pipeline", {
      channel: "wechat_articles",
      topic_ref: topic.ref
    });
    if (reservation === null) {
      await recordRun(admin, {
        userId, status: "failed", topicRef: topic.ref, topicTitle: topic.title,
        errorCode: "insufficient_credits",
        errorMessage: "套餐 Credits 不足，今天的日更长文未生成。"
      });
      return { created: false, reason: "insufficient_credits" };
    }
    charged = reservation.cost;
  }

  try {
    const [brandDigest, perfExamples] = await Promise.all([
      loadBrandDigest(admin, userId),
      loadPerfDigest(admin, userId, "wechat")
    ]);
    const draft = await draftDailyArticle({ topic, brandDigest, perfExamples, leadMagnets: settings.leadMagnets });
    const coverUrl = await generateArticleCover(userId, draft.coverIdea);
    const persisted = await persistArticleRows(admin, userId, topic, draft, coverUrl);

    // Jev gate — fail-closed for the unattended path: a pass is required
    // before anything auto-sends; a block or an outage parks the article in
    // the console for the human.
    let review: WechatJevReview | null = null;
    let jevErrorCode: string | null = null;
    try {
      review = await runWechatJevReview(userId, {
        title: draft.title, summary: draft.summary, contentHtml: draft.body
      });
      if (review.decision !== "pass") jevErrorCode = review.reasons.join(",") || "jev_blocked";
    } catch (error) {
      jevErrorCode = "jev_unavailable";
      logInfo("jev_unavailable", { userId }, {
        operation: "content_pipeline_article_review",
        reason: (error instanceof Error ? error.message : "unknown").slice(0, 200)
      });
    }

    if (jevErrorCode !== null) {
      await recordRun(admin, {
        userId, status: "jev_blocked", topicRef: topic.ref, topicTitle: topic.title,
        kitId: persisted.kitId, outputId: persisted.outputId,
        autoReview: review ? (review as unknown as Record<string, unknown>) : null,
        errorCode: jevErrorCode,
        extra: { billed: charged > 0 }
      });
      return { created: true };
    }

    if (settings.wechatReviewMode === "jev_guarded" && review) {
      const connection = await findWechatConnectionTarget(admin, userId);
      if (connection) {
        const creation = await createWechatPublicationJobFromOutput(admin, {
          userId,
          kitId: persisted.kitId,
          outputId: persisted.outputId,
          accountId: connection.accountId,
          mode: "draft_only",
          scheduledFor: now.toISOString(),
          contentVersion: persisted.outputUpdatedAt,
          idempotencyKey: crypto.randomUUID(),
          theme: settings.wechatTheme,
          precomputedAutoReview: review as unknown as Record<string, unknown>
        });
        if (creation.ok) {
          await recordRun(admin, {
            userId, status: "draft_sent", topicRef: topic.ref, topicTitle: topic.title,
            kitId: persisted.kitId, outputId: persisted.outputId,
            publicationJobId: creation.job.id,
            autoReview: review as unknown as Record<string, unknown>,
            extra: { billed: charged > 0 }
          });
          return { created: true };
        }
        await recordRun(admin, {
          userId, status: "failed", topicRef: topic.ref, topicTitle: topic.title,
          kitId: persisted.kitId, outputId: persisted.outputId,
          errorCode: `publish_${creation.code}`,
          errorMessage: creation.message ?? null,
          extra: { billed: charged > 0 }
        });
        return { created: true };
      }
      // Connected later, not yet: the article waits in the console with a
      // manual-publish path instead of failing the auto-send.
      await recordRun(admin, {
        userId, status: "awaiting_review", topicRef: topic.ref, topicTitle: topic.title,
        kitId: persisted.kitId, outputId: persisted.outputId,
        autoReview: review as unknown as Record<string, unknown>,
        errorCode: "no_wechat_connection",
        errorMessage: "尚未连接公众号，自动进草稿箱暂不可用。可在内容库手动发布，或完成授权后再发。",
        extra: { billed: charged > 0 }
      });
      return { created: true };
    }

    await recordRun(admin, {
      userId, status: "awaiting_review", topicRef: topic.ref, topicTitle: topic.title,
      kitId: persisted.kitId, outputId: persisted.outputId,
      autoReview: review as unknown as Record<string, unknown>,
      extra: { billed: charged > 0 }
    });
    return { created: true };
  } catch (error) {
    // Hard failure must never bill.
    if (charged > 0) {
      await refundCredits(userId, charged, "content_pipeline_article_refund", {
        channel: "wechat_articles",
        topic_ref: topic.ref
      });
    }
    await recordRun(admin, {
      userId, status: "failed", topicRef: topic.ref, topicTitle: topic.title,
      errorCode: "generation_failed",
      errorMessage: error instanceof Error ? error.message : "unknown error"
    });
    return { created: false, reason: "generation_failed" };
  }
}

/**
 * Daily generation pass (10:30 Beijing): one Chinese long-form article per
 * enabled user, parked in the review console or pushed to the Official
 * Account draft box depending on the review mode.
 */
export async function runDailyArticleGeneration(
  admin: AdminClient,
  input: { now?: Date; userId?: string } = {}
): Promise<DailyArticleGenerationResult> {
  const now = input.now ?? new Date();
  const result: DailyArticleGenerationResult = { users: 0, created: 0, skipped: [] };
  if (input.userId) {
    const settings = await getContentPipelineSettings(admin, input.userId);
    const outcome = await generateArticleForUser(admin, input.userId, settings, now);
    result.users = 1;
    if (outcome.created) result.created += 1;
    else if (outcome.reason) result.skipped.push(outcome.reason);
    return result;
  }

  const { data: enabledUsers, error } = await admin
    .from("content_pipeline_settings")
    .select("user_id")
    .eq("wechat_articles_enabled", true)
    .eq("paused", false);
  if (error) throw error;
  for (const row of enabledUsers ?? []) {
    const userId = row.user_id as string;
    try {
      const settings = await getContentPipelineSettings(admin, userId);
      const outcome = await generateArticleForUser(admin, userId, settings, now);
      result.users += 1;
      if (outcome.created) result.created += 1;
      else if (outcome.reason) result.skipped.push(outcome.reason);
    } catch (userError) {
      result.skipped.push(
        `user_failed:${userError instanceof Error ? userError.message.slice(0, 120) : "unknown"}`
      );
    }
  }
  logInfo("content_pipeline_generation_completed", {}, {
    users: result.users,
    created: result.created,
    skipped: result.skipped.length
  });
  return result;
}

/**
 * Console "重新生成": discards the referenced run and generates a fresh
 * article. Free (no credits, no quota) once after a quality-gate block;
 * afterwards it bills like a normal generation.
 */
export async function regenerateDailyArticle(
  admin: AdminClient,
  userId: string,
  runId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: run } = await admin
    .from("content_pipeline_runs")
    .select("id, status, extra, created_at")
    .eq("id", runId)
    .eq("user_id", userId)
    .eq("channel", "wechat_articles")
    .maybeSingle();
  if (!run) return { ok: false, error: "找不到这条生成记录。" };
  if (run.status === "draft_sent") return { ok: false, error: "这篇内容已进入草稿箱，不能重新生成。" };

  const extra = (run.extra ?? {}) as Record<string, unknown>;
  const free = run.status === "jev_blocked" && extra.freeRegenerationUsed !== true;
  const now = new Date().toISOString();
  const { error: discardError } = await admin
    .from("content_pipeline_runs")
    .update({
      status: "discarded",
      error_code: "superseded",
      extra: { ...extra, ...(free ? { freeRegenerationUsed: true } : {}) },
      updated_at: now
    })
    .eq("id", runId)
    .eq("user_id", userId);
  if (discardError) return { ok: false, error: "更新原记录失败，请重试。" };

  const settings = await getContentPipelineSettings(admin, userId);
  const outcome = await generateArticleForUser(admin, userId, settings, new Date(), { free });
  if (!outcome.created) return { ok: false, error: outcome.reason === "insufficient_credits" ? "套餐 Credits 不足，重新生成未执行。" : "重新生成未完成，请稍后再试。" };
  return { ok: true };
}
