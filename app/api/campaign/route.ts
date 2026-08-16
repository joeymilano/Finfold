
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUserId, createSupabaseAdminClient } from "@/lib/supabase";
import {
  buildCampaignPlan,
  explainCampaignPlan,
  getLocalizedCampaignPlan,
  mergeLocalizedCampaignPlan
} from "@/lib/campaign";
import { sendRawPrompt } from "@/lib/llm";
import { detectLocaleFromHeaders } from "@/lib/i18n";
import { getActiveSubscription, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { ACTION_CREDITS, ensurePlanCredits } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { hashGenerationRequest } from "@/lib/generation-runs";
import type { GoalId } from "@/lib/goals";
import type { PersonaId } from "@/lib/personas";
import type { PlatformId } from "@/lib/platforms";

/**
 * 7 天内容计划（P1-3 增强 + P2-5 持久化）：从用户最近一个 kit 推断
 * CampaignRequest，调 buildCampaignPlan 生成逐日计划 + explainCampaignPlan
 * 补 LLM 策略依据，并 upsert 到 campaign_plans 表（按 user+week 唯一），
 * 让计划在一周内稳定可见、可逐天标记完成。无 kit / 数据不足时返回
 * plan=null + reason。PATCH 标记某天完成。
 */
export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ plan: null, reason: "unavailable" }, { status: 503 });
    }

    const requestedLocale = new URL(request.url).searchParams.get("locale");
    const locale = requestedLocale === "zh" || requestedLocale === "en"
      ? requestedLocale
      : detectLocaleFromHeaders(await headers());

    // P2-5：本周已有计划 → 复用，避免每次刷新都重跑 LLM。
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    const dow = (weekStart.getDay() + 6) % 7; // 周一=0
    weekStart.setDate(weekStart.getDate() - dow);

    const { data: existing } = await admin
      .from("campaign_plans")
      .select("plan, completed_days")
      .eq("user_id", userId)
      .eq("week_start", weekStart.toISOString().slice(0, 10))
      .maybeSingle();

    const existingPlan = getLocalizedCampaignPlan(existing?.plan, locale);
    if (existingPlan) {
      return NextResponse.json({
        plan: existingPlan,
        completedDays: Array.isArray(existing?.completed_days) ? (existing.completed_days as number[]) : [],
        progressTrackingAvailable: true
      });
    }

    const { data: kit } = await admin
      .from("content_kits")
      .select("idea_text, goal, persona, platforms")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!kit || !kit.idea_text || String(kit.idea_text).length < 20) {
      return NextResponse.json({ plan: null, reason: "no-kit" });
    }

    // campaign schema 上限 11 个平台（见 lib/campaign.ts），裁剪。
    const platforms = (Array.isArray(kit.platforms) ? (kit.platforms as PlatformId[]) : []).slice(0, 11);
    if (platforms.length === 0) {
      return NextResponse.json({ plan: null, reason: "no-platforms" });
    }

    const [{ data: profile }, { data: subscriptions }] = await Promise.all([
      admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
      admin
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", userId)
        .eq("payment_provider", "creem")
        .order("updated_at", { ascending: false })
    ]);
    const effectivePlan = resolveEffectivePlan(
      profile?.plan,
      getActiveSubscription(
        (subscriptions ?? []).map((subscription) => ({
          status: String(subscription.status ?? ""),
          currentPeriodEnd: subscription.current_period_end
        }))
      )
    );

    try {
      const basePlan = buildCampaignPlan({
        ideaText: String(kit.idea_text),
        goal: kit.goal as GoalId,
        persona: kit.persona as PersonaId,
        platforms,
        durationDays: 7,
        language: locale
      });
      await ensurePlanCredits(userId, effectivePlan);
      const weekKey = weekStart.toISOString().slice(0, 10);
      const billing = createAiUsageBilling({
        operationKey: `campaign-plan:${userId}:${weekKey}:${locale}`,
        userId,
        action: "aiScoreOptimize",
        cost: ACTION_CREDITS.aiScoreOptimize,
        source: "campaign_plan",
        detail: {
          weekStart: weekKey,
          locale,
          inputFingerprint: await hashGenerationRequest({ ideaText: kit.idea_text, platforms, locale })
        }
      });
      const reservation = await billing.reserveAndStart();
      let plan = basePlan;
      if (reservation.outcome === "authorized") {
        let resultReady = false;
        try {
          plan = await explainCampaignPlan(basePlan, String(kit.idea_text), locale, {
            invoke: async (prompt) => {
              const result = await sendRawPrompt(prompt);
              resultReady = true;
              return result;
            }
          });
          await billing.settle();
        } catch (error) {
          if (!resultReady) await billing.refund("campaign_plan_failed").catch(() => undefined);
          console.error("[campaign] LLM explanation billing failed; using deterministic plan:", error);
          plan = basePlan;
        }
      }

      // P2-5：持久化本周计划（upsert on user+week）。失败不阻塞展示。
      const { error: upsertError } = await admin
        .from("campaign_plans")
        .upsert(
          {
            user_id: userId,
            plan: mergeLocalizedCampaignPlan(existing?.plan, locale, plan) as unknown as Record<string, unknown>,
            completed_days: Array.isArray(existing?.completed_days) ? existing.completed_days : [],
            week_start: weekStart.toISOString().slice(0, 10)
          },
          { onConflict: "user_id,week_start" }
        );
      if (upsertError) {
        console.error("[campaign] persist failed:", JSON.stringify(upsertError));
      }

      return NextResponse.json({
        plan,
        completedDays: Array.isArray(existing?.completed_days) ? existing.completed_days : [],
        progressTrackingAvailable: !upsertError
      });
    } catch {
      // 无效 goal/persona 等数据漂移 → 不崩溃，降级为无计划。
      return NextResponse.json({ plan: null, reason: "invalid-input" });
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }
    console.error("[campaign] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build campaign plan." },
      { status: 400 }
    );
  }
}

/**
 * P2-5：标记某天完成/未完成（toggle）。前端逐天点"完成"更新 completed_days。
 */
export async function PATCH(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Unavailable." }, { status: 503 });
    }

    const body = (await request.json()) as { day?: number };
    if (typeof body.day !== "number" || body.day < 1 || body.day > 30) {
      return NextResponse.json({ error: "Invalid day." }, { status: 400 });
    }

    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    const dow = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - dow);

    const { data: row, error: fetchError } = await admin
      .from("campaign_plans")
      .select("id, completed_days")
      .eq("user_id", userId)
      .eq("week_start", weekStart.toISOString().slice(0, 10))
      .maybeSingle();

    if (fetchError || !row) {
      return NextResponse.json({ error: "No plan for this week." }, { status: 404 });
    }

    const current: number[] = Array.isArray(row.completed_days) ? (row.completed_days as number[]) : [];
    const next = current.includes(body.day)
      ? current.filter((d) => d !== body.day)
      : [...current, body.day].sort((a, b) => a - b);

    const { error: updateError } = await admin
      .from("campaign_plans")
      .update({ completed_days: next, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    if (updateError) {
      console.error("[campaign] toggle failed:", JSON.stringify(updateError));
      return NextResponse.json({ error: "Failed to update." }, { status: 400 });
    }

    return NextResponse.json({ completedDays: next });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update." },
      { status: 400 }
    );
  }
}
