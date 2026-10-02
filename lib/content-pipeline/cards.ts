/**
 * 日更流水线 · 小红书卡片轮播通道（P1）。
 *
 * Nightly generation (21:30 Beijing): shared topic selection → one sonnet
 * strict-JSON call producing a VisualStory-compatible card set (cover + 3-6
 * content cards + CTA), the note caption, five title candidates, and tags →
 * Jev three-question review (advisory in every_post, fail-closed in
 * jev_guarded) → optional illustration cover → minimal content_kit/
 * kit_outputs + visual_stories rows. Delivery is a material zip the human
 * posts manually — Xiaohongshu has no publishing API by design.
 */
import { z } from "zod";
import { sendRawPrompt } from "@/lib/llm";
import { logInfo } from "@/lib/observability";
import { reserveCredits, refundCredits } from "@/lib/payment/credits";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import { buildTextFreeVisualPrompt, generateImage, isImageGenConfigured } from "@/lib/image-gen";
import { persistGeneratedImageForDelivery } from "@/lib/image-persistence";
import { visualStorySchema, type VisualStory } from "@/lib/visual-story";
import { loadBrandDigest } from "@/lib/x-pipeline/generate";
import { runCardJevReview, type CardJevReview } from "@/lib/content-pipeline/cards-review";
import {
  contentPipelineEnabled,
  countBilledRunsToday,
  getContentPipelineSettings,
  type ContentPipelineSettings
} from "@/lib/content-pipeline/settings";
import { loadPerfDigest, selectDailyTopic, type DailyTopic } from "@/lib/content-pipeline/generate";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const PROMPT_VERSION = "xhs-cards-2026-09-24.1";
const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;
/** Per-card-set credit cost — mirror of the signal-discovery per-call pricing. */
export const XHS_CARD_SET_CREDIT_COST = 3;

export type DailyCardGenerationResult = {
  users: number;
  created: number;
  skipped: string[];
};

const CARD_TYPE_RULES: Record<string, string> = {
  quote: [
    "卡型：双语金句卡。每张内容卡（role 用 quote 或 insight）的 title 放英文原句，body 放中文译文，kicker 放这一卡的主题词。",
    "- 英文句口语直白、像人话，配得上翻译的中文要顺，不是词典腔。",
    "- 金句必须原创或公版，不逐字摘外刊，不编造名人名言和出处。",
    "- 金句之间要有递进关系（同一主题的不同侧面），不做互不相关的金句拼盘。"
  ].join("\n"),
  list: [
    "卡型：清单卡。每张内容卡（role 用 list）围绕一个要点标题给出 2-5 条真正并列的 points，body 补一句把清单串起来的话。",
    "- 每条 point 都是可单独执行的具体动作，不写「保持心态」这类空话。",
    "- 清单之间不重复，同一条信息只出现在一张卡上。"
  ].join("\n"),
  opinion: [
    "卡型：观点卡。每张内容卡（role 用 insight 或 quote）是一个短观点（title）加一句展开（body）。",
    "- 观点直接给，依据紧跟；每张卡推进一个新想法。",
    "- 整组卡像一个人把一件事从头讲到尾，每张都是下一步。"
  ].join("\n")
};

const cardDraftSchema = z
  .object({
    noteTitleCandidates: z.array(z.string().min(4).max(24)).length(5),
    noteTitle: z.string().min(4).max(24),
    noteBody: z.string().min(150).max(500),
    tags: z.array(z.string().min(1).max(30)).min(5).max(8),
    coverIdea: z.string().max(200).optional(),
    story: visualStorySchema
  })
  .superRefine((value, ctx) => {
    if (value.story.pages.length < 4 || value.story.pages.length > 9) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "story needs 4-9 pages" });
    }
    if (!CJK_PATTERN.test(value.noteTitle) || !CJK_PATTERN.test(value.noteBody)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "note title and body must be Chinese" });
    }
    if (value.noteBody.includes("**") || value.noteBody.includes("—")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "note body must not contain ** or em-dashes" });
    }
  });

export type DailyCardDraft = z.infer<typeof cardDraftSchema>;

function buildCardPrompt(input: {
  topic: DailyTopic;
  brandDigest: string;
  perfExamples: string;
  cardType: string;
  theme: string;
  withIllustration: boolean;
}): string {
  return [
    "你为一位小红书号主生成今天的图文轮播笔记。只输出严格 JSON，不要输出任何其他文字。",
    "",
    "品牌背景（唯一可作为第一手事实来源的材料）：",
    input.brandDigest,
    "",
    "过往高收藏笔记（已验证读者买账的写法参考，只学语气和结构，不复用内容）：",
    input.perfExamples,
    "",
    "今日选题（整组卡围绕这一个主题递进）：",
    input.topic.title,
    input.topic.whyNow ? `时机：${input.topic.whyNow}` : null,
    input.topic.whyYou ? `与号主的匹配：${input.topic.whyYou}` : null,
    "",
    CARD_TYPE_RULES[input.cardType] ?? CARD_TYPE_RULES.quote,
    "",
    "整组结构：",
    '- pages[0] 是封面（role 固定 "cover"）：title 是笔记钩子（≤20 个汉字，数字+身份+痛点或反常识式），body 留空。',
    '- 中间 3-6 张内容卡（role 按卡型用 quote / insight / list）。',
    '- 最后一张 role 固定 "cta"：引导收藏和关注，给一个具体下一步（如「收藏这组卡，明天开工前翻一遍」）。',
    "- 每张卡都要推进新信息，封面标题不在内容卡里重复出现。",
    "- 字段硬上限（超出即作废）：kicker ≤32 字符，title ≤90 字符，body ≤320 字符，points 每条 ≤90 字符且最多 5 条，emphasis ≤48 字符。",
    `- story.theme 固定填 "${input.theme}"，story.strategy 填 "information-dense"。`,
    '封面图片构想 coverIdea：一段画面描述（主体+氛围+色调），画面里不能有任何文字。',
    "",
    "笔记正文 noteBody（200-400 个汉字）：开头两行钩子（和封面呼应），中间两三段把卡里的要点串成自然的讲述，结尾一个具体下一步。不用破折号，不用「不是……而是……」，不编数据，不用「值得注意的是、综上所述、赋能、抓手、底层逻辑」这类词。",
    "标题候选 noteTitleCandidates 给 5 个，每个 ≤20 个汉字。话题标签 tags 给 5-8 个：大流量词 2 个 + 精准词 3 个 + 身份词 1-2 个，不带#号。",
    "",
    '返回 JSON：{"noteTitleCandidates":["…"],"noteTitle":"…","noteBody":"…","tags":["…"],"coverIdea":"…","story":{"title":"…","theme":"' + input.theme + '","strategy":"information-dense","artDirection":"…","pages":[{"role":"cover","kicker":"","title":"","body":"","points":[],"emphasis":""}]}}',
    "pages 里每页的 id 字段填 page-1、page-2 这样即可。"
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function draftCardSet(input: {
  topic: DailyTopic;
  brandDigest: string;
  perfExamples: string;
  cardType: string;
  theme: string;
  withIllustration: boolean;
}): Promise<DailyCardDraft> {
  const prompt = buildCardPrompt(input);
  const raw = await sendRawPrompt(prompt, {
    modelTier: "sonnet",
    operation: "content_pipeline_cards",
    promptVersion: PROMPT_VERSION,
    maxTokens: 4_000
  });
  let parsed = cardDraftSchema.safeParse(JSON.parse(stripJsonFence(raw)));
  if (!parsed.success) {
    // One repair round-trip: surface the validation errors to the model.
    const repaired = await sendRawPrompt(
      `${prompt}\n\n你上一条回复不符合要求（${parsed.error.issues[0]?.message ?? "schema mismatch"}）。只返回修正后的 JSON。`,
      { modelTier: "sonnet", operation: "content_pipeline_cards_repair", promptVersion: PROMPT_VERSION, maxTokens: 4_000 }
    );
    parsed = cardDraftSchema.safeParse(JSON.parse(stripJsonFence(repaired)));
    if (!parsed.success) throw new Error("card set generation returned an unusable draft.");
  }
  // Page ids are re-pinned so repeated regenerations never collide.
  parsed.data.story.pages = parsed.data.story.pages.map((page, index) => ({
    ...page,
    id: `card-${index + 1}-${crypto.randomUUID()}`
  }));
  return parsed.data;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  return trimmed;
}

function cardTextOf(story: VisualStory): string {
  return story.pages
    .map((page) => [page.kicker, page.title, page.body, ...page.points, page.emphasis].filter(Boolean).join(" "))
    .join("\n");
}

async function generateCardCover(userId: string, coverIdea: string | undefined): Promise<string | null> {
  if (!coverIdea || !isImageGenConfigured("illustration")) return null;
  try {
    const outcome = await generateImage(
      buildTextFreeVisualPrompt(coverIdea, "xiaohongshu"),
      "3:4",
      undefined,
      { purpose: "illustration" }
    );
    if (outcome.kind === "url") return outcome.url;
    return await persistGeneratedImageForDelivery(userId, outcome);
  } catch (error) {
    logInfo("content_pipeline_card_cover_skipped", { userId }, {
      reason: error instanceof Error ? error.message.slice(0, 200) : "image_generation_failed"
    });
    return null;
  }
}

async function persistCardRows(
  admin: AdminClient,
  userId: string,
  topic: DailyTopic,
  draft: DailyCardDraft,
  coverUrl: string | null
): Promise<{ kitId: string; outputId: string }> {
  const kitId = crypto.randomUUID();
  const outputId = crypto.randomUUID();
  const now = new Date().toISOString();
  const ideaText = [
    "日更流水线 · 小红书卡片轮播",
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
    platforms: ["xiaohongshu"],
    media_assets: [],
    status: "saved",
    created_at: now
  });
  if (kitError) throw new Error(kitError.message);
  const { error: outputError } = await admin.from("kit_outputs").insert({
    id: outputId,
    kit_id: kitId,
    user_id: userId,
    platform: "xiaohongshu",
    title: draft.noteTitle,
    body: draft.noteBody,
    summary: null,
    cta: draft.story.pages[draft.story.pages.length - 1]?.title ?? "",
    notes: draft.tags.join(" "),
    strategy: "",
    locked: false,
    publish_status: "draft",
    image_url: coverUrl,
    image_prompt: draft.coverIdea ?? null,
    image_source: null,
    final_body: null,
    user_edited: false,
    created_at: now
  });
  if (outputError) {
    await admin.from("content_kits").delete().eq("id", kitId).eq("user_id", userId);
    throw new Error(outputError.message);
  }
  const { error: storyError } = await admin.from("visual_stories").upsert({
    user_id: userId,
    kit_id: kitId,
    output_id: outputId,
    story_json: draft.story,
    format_id: "portrait-3x4",
    revision: 1,
    created_at: now,
    updated_at: now
  });
  if (storyError) {
    console.error("[content-pipeline] visual story persist failed:", storyError.message);
  }
  return { kitId, outputId };
}

type CardRunRecordInput = {
  userId: string;
  status: "awaiting_review" | "jev_blocked" | "discarded" | "skipped_no_topic" | "failed";
  topicRef: string | null;
  topicTitle: string | null;
  kitId?: string | null;
  outputId?: string | null;
  autoReview?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  extra?: Record<string, unknown>;
};

async function recordCardRun(admin: AdminClient, input: CardRunRecordInput): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("content_pipeline_runs")
    .insert({
      user_id: input.userId,
      channel: "xhs_cards",
      run_date: now.slice(0, 10),
      status: input.status,
      topic_ref: input.topicRef,
      topic_title: input.topicTitle,
      kit_id: input.kitId ?? null,
      output_id: input.outputId ?? null,
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

async function generateCardSetForUser(
  admin: AdminClient,
  userId: string,
  settings: ContentPipelineSettings,
  now: Date,
  options: { free?: boolean } = {}
): Promise<{ created: boolean; reason?: string }> {
  if (!settings.xhsCardsEnabled || settings.paused) return { created: false, reason: "disabled_or_paused" };
  if (!contentPipelineEnabled(userId)) return { created: false, reason: "not_in_pilot" };

  if (!options.free) {
    const usedToday = await countBilledRunsToday(admin, userId, "xhs_cards", now);
    if (usedToday >= settings.xhsDailyCap) return { created: false, reason: "cap_reached" };
  }

  const topic = await selectDailyTopic(admin, userId, "xhs_cards");
  if (!topic) {
    await recordCardRun(admin, {
      userId, status: "skipped_no_topic", topicRef: null, topicTitle: null,
      errorMessage: "今天没有可用选题：机会雷达无活跃话题，定位支柱也用尽了。"
    });
    return { created: false, reason: "no_topic" };
  }

  let charged = 0;
  if (!options.free) {
    const reservation = await reserveCredits(userId, XHS_CARD_SET_CREDIT_COST, "contentPipelineCards", "daily_pipeline", {
      channel: "xhs_cards",
      topic_ref: topic.ref
    });
    if (reservation === null) {
      await recordCardRun(admin, {
        userId, status: "failed", topicRef: topic.ref, topicTitle: topic.title,
        errorCode: "insufficient_credits",
        errorMessage: "套餐 Credits 不足，今天的卡片组未生成。"
      });
      return { created: false, reason: "insufficient_credits" };
    }
    charged = reservation.cost;
  }

  try {
    const [brandDigest, perfExamples] = await Promise.all([
      loadBrandDigest(admin, userId),
      loadPerfDigest(admin, userId, "xiaohongshu")
    ]);
    const draft = await draftCardSet({
      topic,
      brandDigest,
      perfExamples,
      cardType: settings.xhsCardType,
      theme: settings.xhsTheme,
      withIllustration: settings.xhsWithIllustration
    });
    const coverUrl = settings.xhsWithIllustration
      ? await generateCardCover(userId, draft.coverIdea)
      : null;
    const persisted = await persistCardRows(admin, userId, topic, draft, coverUrl);

    // Jev gate — advisory in every_post (badge only), fail-closed in
    // jev_guarded (the material zip waits for an explicit override).
    let review: CardJevReview | null = null;
    let jevErrorCode: string | null = null;
    try {
      review = await runCardJevReview(userId, {
        noteTitle: draft.noteTitle,
        noteBody: draft.noteBody,
        cardText: cardTextOf(draft.story)
      });
      if (review.decision !== "pass") jevErrorCode = review.reasons.join(",") || "jev_blocked";
    } catch (error) {
      // Jev outage: fail-closed only in jev_guarded mode; every_post keeps
      // the set downloadable with a "review unavailable" note.
      jevErrorCode = settings.xhsReviewMode === "jev_guarded" ? "jev_unavailable" : null;
      logInfo("jev_unavailable", { userId }, {
        operation: "content_pipeline_card_review",
        reason: (error instanceof Error ? error.message : "unknown").slice(0, 200)
      });
    }

    await recordCardRun(admin, {
      userId,
      status: jevErrorCode !== null ? "jev_blocked" : "awaiting_review",
      topicRef: topic.ref,
      topicTitle: topic.title,
      kitId: persisted.kitId,
      outputId: persisted.outputId,
      autoReview: review ? (review as unknown as Record<string, unknown>) : null,
      errorCode: jevErrorCode,
      extra: {
        billed: charged > 0,
        cardType: settings.xhsCardType,
        theme: settings.xhsTheme,
        titleCandidates: draft.noteTitleCandidates
      }
    });
    return { created: true };
  } catch (error) {
    // Hard failure must never bill.
    if (charged > 0) {
      await refundCredits(userId, charged, "content_pipeline_cards_refund", {
        channel: "xhs_cards",
        topic_ref: topic.ref
      });
    }
    await recordCardRun(admin, {
      userId, status: "failed", topicRef: topic.ref, topicTitle: topic.title,
      errorCode: "generation_failed",
      errorMessage: error instanceof Error ? error.message : "unknown error"
    });
    return { created: false, reason: "generation_failed" };
  }
}

/**
 * Nightly card generation pass (21:30 Beijing): one card set per enabled
 * user, parked in the review console with a material zip for manual
 * Xiaohongshu posting.
 */
export async function runDailyCardGeneration(
  admin: AdminClient,
  input: { now?: Date; userId?: string } = {}
): Promise<DailyCardGenerationResult> {
  const now = input.now ?? new Date();
  const result: DailyCardGenerationResult = { users: 0, created: 0, skipped: [] };
  if (input.userId) {
    const settings = await getContentPipelineSettings(admin, input.userId);
    const outcome = await generateCardSetForUser(admin, input.userId, settings, now);
    result.users = 1;
    if (outcome.created) result.created += 1;
    else if (outcome.reason) result.skipped.push(outcome.reason);
    return result;
  }

  const { data: enabledUsers, error } = await admin
    .from("content_pipeline_settings")
    .select("user_id")
    .eq("xhs_cards_enabled", true)
    .eq("paused", false);
  if (error) throw error;
  for (const row of enabledUsers ?? []) {
    const userId = row.user_id as string;
    try {
      const settings = await getContentPipelineSettings(admin, userId);
      const outcome = await generateCardSetForUser(admin, userId, settings, now);
      result.users += 1;
      if (outcome.created) result.created += 1;
      else if (outcome.reason) result.skipped.push(outcome.reason);
    } catch (userError) {
      result.skipped.push(
        `user_failed:${userError instanceof Error ? userError.message.slice(0, 120) : "unknown"}`
      );
    }
  }
  logInfo("content_pipeline_cards_completed", {}, {
    users: result.users,
    created: result.created,
    skipped: result.skipped.length
  });
  return result;
}

/**
 * Console "重新生成" for a card run: discards the referenced run and
 * generates a fresh set. Free once after a quality-gate block.
 */
export async function regenerateDailyCardSet(
  admin: AdminClient,
  userId: string,
  runId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: run } = await admin
    .from("content_pipeline_runs")
    .select("id, status, extra")
    .eq("id", runId)
    .eq("user_id", userId)
    .eq("channel", "xhs_cards")
    .maybeSingle();
  if (!run) return { ok: false, error: "找不到这条生成记录。" };

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
  const outcome = await generateCardSetForUser(admin, userId, settings, new Date(), { free });
  if (!outcome.created) return { ok: false, error: outcome.reason === "insufficient_credits" ? "套餐 Credits 不足，重新生成未执行。" : "重新生成未完成，请稍后再试。" };
  return { ok: true };
}
