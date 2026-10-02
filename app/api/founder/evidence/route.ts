
import { NextResponse } from "next/server";
import { apiError } from "@/lib/i18n";
import { getFounderAccess } from "@/lib/founder-access";
import {
  buildFounderEvidence,
  type ActivationCodeEvidenceRow,
  type BrainEvidenceRow,
  type FeedbackEvidenceRow,
  type KitEvidenceRow,
  type OutputEvidenceRow,
  type PerformanceEvidenceRow,
  type ProfileEvidenceRow,
  type ReferralEvidenceRow,
  type SubscriptionEvidenceRow
} from "@/lib/founder-evidence";
import { createSupabaseAdminClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const access = await getFounderAccess();
  if (!access.authenticated) return NextResponse.json({ error: apiError(request.headers, "请先登录。", "Authentication required.") }, { status: 401 });
  if (!access.authorized) return NextResponse.json({ error: apiError(request.headers, "未找到。", "Not found.") }, { status: 404 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: apiError(request.headers, "创始人证据功能尚未配置。", "Founder evidence is not configured.") }, { status: 503 });

  try {
    const [profiles, kits, outputs, performance, subscriptions, activationCodes, feedback, brains, referrals] = await Promise.all([
      fetchAllRows("profiles", (from, to) => admin.from("profiles").select("id, plan, founding_member, created_at").range(from, to)),
      fetchAllRows("kits", (from, to) => admin.from("content_kits").select("id, user_id, created_at, experiment_bucket").range(from, to)),
      fetchAllRows("outputs", (from, to) => admin.from("kit_outputs").select("id, kit_id, user_id, publish_status, user_edited, created_at, published_at").range(from, to)),
      fetchAllRows("performance", (from, to) => admin.from("performance_metrics").select("kit_id, user_id, likes, comments, saves, shares, leads, signups, revenue").range(from, to)),
      fetchAllRows("subscriptions", (from, to) => admin.from("subscriptions").select("user_id, status, provider_customer_id, current_period_end, created_at").range(from, to)),
      fetchAllRows("activation codes", (from, to) => admin.from("activation_codes").select("batch_label, plan, duration_days, redeemed_by, redeemed_at, created_at").range(from, to)),
      fetchAllRows("feedback", (from, to) => admin.from("output_feedback").select("user_id, rating, reason_codes, created_at").range(from, to)),
      fetchAllRows("brains", (from, to) => admin.from("brand_brains").select("user_id, learned_style, learned_negative, performance_rules, approved_examples").range(from, to)),
      fetchAllRows("referrals", (from, to) => admin.from("referrals").select("referrer_user_id, status, risk_flag, attributed_at, rewarded_at, referrer_reward_credits, referred_reward_credits").range(from, to))
    ]);

    return NextResponse.json({
      evidence: buildFounderEvidence({
        profiles: profiles as ProfileEvidenceRow[],
        kits: kits as KitEvidenceRow[],
        outputs: outputs as OutputEvidenceRow[],
        performance: performance as PerformanceEvidenceRow[],
        subscriptions: subscriptions as SubscriptionEvidenceRow[],
        activationCodes: activationCodes as ActivationCodeEvidenceRow[],
        feedback: feedback as FeedbackEvidenceRow[],
        brains: brains as BrainEvidenceRow[],
        referrals: referrals as ReferralEvidenceRow[]
      })
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[founder/evidence] failed:", error);
    return NextResponse.json({ error: apiError(request.headers, "创始人证据暂时无法加载。", "Founder evidence is temporarily unavailable.") }, { status: 503 });
  }
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

async function fetchAllRows(
  name: string,
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${name} evidence query failed: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new Error(`${name} evidence exceeded the safe pagination limit.`);
}
