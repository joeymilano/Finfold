import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { sendRawPrompt } from "@/lib/llm";
import { getPlatform, type PlatformId } from "@/lib/platforms";
import { refundCredits } from "@/lib/payment/credits";

/**
 * WeApp draft generation — a single-platform copy built from the same platform
 * playbook (voice / constraints / viral patterns) the web workbench uses, plus
 * the user's brand context. Runs inside `after()` so the client can poll.
 */

export type WeappDraftTopic = {
  title: string;
  fact?: string;
  angle?: string;
  keywords?: string[];
};

export type WeappDraftRow = {
  id: string;
  user_id: string;
  source: "opportunity" | "free";
  opportunity_id: string | null;
  topic: WeappDraftTopic;
  platform: "wechat" | "xiaohongshu" | "moments";
  status: "pending" | "ready" | "failed";
  content: string | null;
  error: string | null;
  credits_charged: number;
  created_at: string;
  finished_at: string | null;
};

const PLATFORM_LABELS: Record<WeappDraftRow["platform"], string> = {
  wechat: "微信公众号文章",
  xiaohongshu: "小红书笔记",
  moments: "微信朋友圈"
};

function buildWeappDraftPrompt(input: {
  platform: WeappDraftRow["platform"];
  topic: WeappDraftTopic;
  brand: { business: string; audience: string; keywords: string[]; bannedPhrases: string[] };
}): string {
  const meta = getPlatform(input.platform as PlatformId);
  const lines: string[] = [
    `你是深谙${PLATFORM_LABELS[input.platform]}生态的资深内容操盘手。请基于下面的选题，为一个真实业务写一篇可以直接发布的${PLATFORM_LABELS[input.platform]}。`
  ];

  lines.push("", "【选题】", `标题/话题：${input.topic.title}`);
  if (input.topic.fact) lines.push(`背景事实：${input.topic.fact}`);
  if (input.topic.angle) lines.push(`建议切入角度：${input.topic.angle}`);
  if (input.topic.keywords?.length) lines.push(`相关关键词：${input.topic.keywords.join("、")}`);

  lines.push("", "【业务背景（写作者的真实业务，内容要自然关联它，不硬广）】");
  lines.push(`业务介绍：${input.brand.business || "（未提供，保持通用价值，不虚构具体业务细节）"}`);
  if (input.brand.audience) lines.push(`目标读者：${input.brand.audience}`);

  lines.push("", `【${meta.label}平台要求】`);
  lines.push(`语气：${meta.voice}`);
  lines.push(`篇幅：不超过 ${meta.charLimit} 字`);
  for (const constraint of meta.constraints ?? []) lines.push(`- ${constraint}`);
  if (meta.viralPatterns?.length) {
    lines.push("可参考的高互动形态（任选其一，不要生硬套用）：");
    for (const pattern of meta.viralPatterns.slice(0, 4)) lines.push(`- ${pattern}`);
  }
  if (meta.avoidList?.length) {
    lines.push("绝对避免：");
    for (const avoid of meta.avoidList.slice(0, 5)) lines.push(`- ${avoid}`);
  }
  if (input.brand.bannedPhrases.length) {
    lines.push(`作者明令禁用的词句：${input.brand.bannedPhrases.join("、")}`);
  }

  lines.push(
    "",
    "【输出要求】",
    "- 只输出正文本身，不要任何解释、前后缀或 markdown 代码块围栏",
    "- 不得虚构具体数据、案例、人名、对话；不确定的事实留白让作者补",
    input.platform === "xiaohongshu" ? "- 第一行给一个 20 字以内的笔记标题，然后空一行写正文，正文末尾附 3-5 个相关话题标签" : "- 开头三行内必须让读者知道这篇在讲什么、和他有什么关系"
  );
  return lines.join("\n");
}

async function loadBrandContext(admin: SupabaseClient, userId: string) {
  const [brainResult, programResult] = await Promise.all([
    admin.from("brand_brains").select("product_description,target_audience,banned_phrases").eq("user_id", userId).maybeSingle(),
    admin.from("operating_programs").select("watchlist").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle()
  ]);
  return {
    business: brainResult.data?.product_description ?? "",
    audience: brainResult.data?.target_audience ?? "",
    keywords: Array.isArray(programResult.data?.watchlist?.keywords) ? programResult.data.watchlist.keywords : [],
    bannedPhrases: Array.isArray(brainResult.data?.banned_phrases) ? brainResult.data.banned_phrases : []
  };
}

/** Executes a pending draft: LLM call, settle, or refund on failure. */
export async function runWeappDraftGeneration(draftId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  const { data: draft } = await admin
    .from("weapp_drafts")
    .select("*")
    .eq("id", draftId)
    .maybeSingle();
  const row = draft as unknown as WeappDraftRow | null;
  if (!row || row.status !== "pending") return;

  try {
    const brand = await loadBrandContext(admin, row.user_id);
    const content = await sendRawPrompt(
      buildWeappDraftPrompt({ platform: row.platform, topic: row.topic, brand }),
      { operation: "weapp-draft", promptVersion: "weapp-draft-v1", modelTier: "sonnet" }
    );
    const { error } = await admin
      .from("weapp_drafts")
      .update({
        status: "ready",
        content: content.trim(),
        credits_charged: row.credits_charged,
        finished_at: new Date().toISOString()
      })
      .eq("id", row.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "generation failed";
    await admin
      .from("weapp_drafts")
      .update({
        status: "failed",
        error: message.slice(0, 500),
        credits_charged: 0,
        finished_at: new Date().toISOString()
      })
      .eq("id", row.id)
      .eq("status", "pending");
    if (row.credits_charged > 0) {
      await refundCredits(row.user_id, row.credits_charged, "refund", { weappDraftId: row.id, reason: "generation_failed" });
    }
  }
}

/** Marks a draft that has been pending past all sane execution time as failed and refunded. */
export async function settleStaleWeappDraft(admin: SupabaseClient, row: WeappDraftRow): Promise<WeappDraftRow> {
  const staleMs = Date.parse(row.created_at) ? Date.now() - Date.parse(row.created_at) : Infinity;
  if (row.status !== "pending" || staleMs < 240_000) return row;
  const { error } = await admin
    .from("weapp_drafts")
    .update({
      status: "failed",
      error: "生成超时，额度已退回。",
      credits_charged: 0,
      finished_at: new Date().toISOString()
    })
    .eq("id", row.id)
    .eq("status", "pending");
  if (!error && row.credits_charged > 0) {
    await refundCredits(row.user_id, row.credits_charged, "refund", { weappDraftId: row.id, reason: "generation_timeout" });
  }
  return { ...row, status: "failed", error: "生成超时，额度已退回。", credits_charged: 0 };
}
