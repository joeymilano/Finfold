
import { NextResponse } from "next/server";
import { apiError } from "@/lib/i18n";
import { z } from "zod";
import {
  advanceDueBusinessMissionReviews,
  createBusinessGrowthMissionFollowUp,
  createGrowthMission,
  getGrowthMission,
  listGrowthMissions,
  type GrowthMission,
  type GrowthMissionFollowUpSource
} from "@/lib/agent/growth-missions";
import type { GrowthBriefing } from "@/lib/agent/growth-briefing";
import { advancePatrolAfterEvent } from "@/lib/agent/patrol";
import { platformIdSchema } from "@/lib/content-schema";
import { captureServerEvent } from "@/lib/posthog-server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const createMissionSchema = z.object({
  locale: z.enum(["zh", "en"]).default("zh"),
  platform: platformIdSchema.optional(),
  sourceMissionId: z.string().uuid().optional()
});

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: apiError(request.headers, "增长任务存储未配置。", "Growth Missions require Supabase.") }, { status: 503 });
    }
    await advanceDueBusinessMissionReviews(admin, userId);
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 10);
    const missions = await listGrowthMissions(admin, userId, limit);
    return NextResponse.json({
      missions,
      activeMission: missions.find((mission) => ["accepted", "draft_ready", "posted"].includes(mission.status)) ?? null
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "登录后才能查看增长任务。", "Please log in to view Growth Missions.") }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : apiError(request.headers, "暂时无法加载增长任务。", "Failed to load Growth Missions.") },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = createMissionSchema.parse(await request.json().catch(() => ({})));
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: apiError(request.headers, "增长任务存储未配置。", "Growth Missions require Supabase.") }, { status: 503 });
    }
    let contentFollowUpSource: GrowthMissionFollowUpSource | undefined;
    let businessFollowUpSource: GrowthMission | undefined;
    let preferredPlatform = input.platform;
    let result: { mission: GrowthMission; existing: boolean; briefing?: GrowthBriefing };
    if (input.sourceMissionId) {
      const sourceMission = await getGrowthMission(admin, userId, input.sourceMissionId);
      if (!sourceMission) {
        return NextResponse.json({ error: apiError(request.headers, "上一轮增长任务不存在。", "The source Growth Mission was not found.") }, { status: 404 });
      }
      if (sourceMission.status !== "completed" || !sourceMission.verdict) {
        return NextResponse.json({ error: apiError(request.headers, "上一轮任务还没有可用于续建的结论。", "The source Growth Mission does not have a completed verdict yet.") }, { status: 409 });
      }
      if (preferredPlatform && preferredPlatform !== sourceMission.platform) {
        return NextResponse.json({ error: apiError(request.headers, "下一轮任务必须沿用已复盘的平台。", "The follow-up mission must use the reviewed platform.") }, { status: 400 });
      }
      preferredPlatform = sourceMission.platform;
      if (sourceMission.missionKind === "growth_opportunity") {
        const canReplicate = sourceMission.verdict === "won";
        const canRepair = sourceMission.verdict === "lost"
          && sourceMission.reviewDecision === "fix_bottleneck"
          && Boolean(sourceMission.reviewBottleneck);
        if (!canReplicate && !canRepair) {
          return NextResponse.json({
            error: apiError(
              request.headers,
              "商业任务只有在确认达标，或复盘选定一个修复断点后才能续建；未达标结果不会被自动放大。",
              "A commercial mission can continue only after a confirmed target result or a reviewed single-breakpoint repair; an unmet result is never scaled automatically."
            )
          }, { status: 409 });
        }
        const businessResult = await createBusinessGrowthMissionFollowUp(admin, userId, input.locale, sourceMission.id);
        if (!businessResult.mission) {
          return NextResponse.json(
            { error: businessResult.error ?? apiError(request.headers, "暂时无法复现这轮业务结果。", "Unable to repeat this business result.") },
            { status: businessResult.errorStatus ?? 409 }
          );
        }
        businessFollowUpSource = sourceMission;
        result = { mission: businessResult.mission, existing: businessResult.existing };
      } else if (sourceMission.missionKind === "content_experiment") {
        contentFollowUpSource = {
          missionId: sourceMission.id,
          verdict: sourceMission.verdict,
          completedAt: sourceMission.completedAt
        };
        const contentResult = await createGrowthMission(admin, userId, input.locale, preferredPlatform, contentFollowUpSource);
        if (!contentResult.mission) {
          return NextResponse.json({
            error: input.locale === "en"
              ? "Add at least one measured result before accepting a Growth Mission."
              : "先补一篇真实发布数据，再接受增长任务。",
            briefing: contentResult.briefing
          }, { status: 409 });
        }
        result = { ...contentResult, mission: contentResult.mission };
      } else {
        return NextResponse.json({
          error: apiError(request.headers, "这类任务还不能自动续建。", "This mission type cannot be continued automatically yet.")
        }, { status: 409 });
      }
    } else {
      const contentResult = await createGrowthMission(admin, userId, input.locale, preferredPlatform);
      if (!contentResult.mission) {
        return NextResponse.json({
          error: input.locale === "en"
            ? "Add at least one measured result before accepting a Growth Mission."
            : "先补一篇真实发布数据，再接受增长任务。",
          briefing: contentResult.briefing
        }, { status: 409 });
      }
      result = { ...contentResult, mission: contentResult.mission };
    }
    let dutyItem = null;
    try {
      dutyItem = await advancePatrolAfterEvent(admin, userId, {
        type: "mission_created",
        missionId: result.mission.id
      });
    } catch (error) {
      console.error("[agent/missions] Agent patrol advancement failed:", error);
    }
    if ((contentFollowUpSource || businessFollowUpSource) && !result.existing) {
      try {
        const source = businessFollowUpSource ?? contentFollowUpSource;
        const businessEvent = businessFollowUpSource?.verdict === "lost"
          ? "business_result_repair_mission_created"
          : "business_result_replication_mission_created";
        await captureServerEvent(userId, businessFollowUpSource ? businessEvent : "follow_up_mission_created", {
          source_mission_id: businessFollowUpSource?.id ?? contentFollowUpSource?.missionId,
          source_verdict: source?.verdict,
          mission_id: result.mission.id,
          platform: result.mission.platform,
          objective_type: businessFollowUpSource?.objectiveType ?? null
        });
      } catch (error) {
        console.error("[agent/missions] Follow-up analytics capture failed:", error);
      }
    }
    return NextResponse.json({ ...result, dutyItem }, { status: result.existing ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "登录后才能创建增长任务。", "Please log in to create a Growth Mission.") }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : apiError(request.headers, "暂时无法创建增长任务。", "Failed to create Growth Mission.") },
      { status: 400 }
    );
  }
}
