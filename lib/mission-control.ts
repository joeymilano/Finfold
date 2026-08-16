import type { createSupabaseAdminClient } from "@/lib/supabase";
import { getGrowthMission, type GrowthMission } from "@/lib/agent/growth-missions";
import {
  appendTrackingParams,
  emptyMissionOutcomeSummary,
  summarizeMissionOutcomeRows,
  type MissionAction,
  type MissionOutcomeSummary,
  type MissionTimelineEvent,
  type MissionTrackingLink
} from "@/lib/mission-attribution";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type MissionControlDetail = {
  mission: GrowthMission;
  actions: MissionAction[];
  events: MissionTimelineEvent[];
  trackingLink: MissionTrackingLink | null;
  outcomeSummary: MissionOutcomeSummary;
  decisionCount: number;
  workbenchHref: string;
};

export async function loadMissionControlDetail(
  admin: AdminClient,
  userId: string,
  missionId: string,
  appUrl: string
): Promise<MissionControlDetail | null> {
  const mission = await getGrowthMission(admin, userId, missionId);
  if (!mission) return null;

  const [actionsResult, eventsResult, trackingResult, outcomesResult] = await Promise.all([
    admin
      .from("mission_actions")
      .select("id, kind, status, risk_level, requires_approval, input, output, error, created_at, updated_at, completed_at")
      .eq("mission_id", missionId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    admin
      .from("mission_events")
      .select("id, event_type, payload, occurred_at")
      .eq("mission_id", missionId)
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(80),
    admin
      .from("tracking_links")
      .select("id, code, destination_url, source, medium, campaign, content, status")
      .eq("mission_id", missionId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("outcome_events")
      .select("event_type, quantity, value, currency")
      .eq("mission_id", missionId)
      .eq("user_id", userId)
  ]);
  if (actionsResult.error) throw actionsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (trackingResult.error) throw trackingResult.error;
  if (outcomesResult.error) throw outcomesResult.error;

  const actions: MissionAction[] = (actionsResult.data ?? []).map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    status: row.status as MissionAction["status"],
    riskLevel: row.risk_level as MissionAction["riskLevel"],
    requiresApproval: Boolean(row.requires_approval),
    input: asRecord(row.input),
    output: row.output ? asRecord(row.output) : null,
    error: row.error ? String(row.error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : null
  }));
  const events: MissionTimelineEvent[] = (eventsResult.data ?? []).map((row) => ({
    id: String(row.id),
    eventType: String(row.event_type),
    payload: asRecord(row.payload),
    occurredAt: String(row.occurred_at)
  }));
  const trackingLink = trackingResult.data ? mapTrackingLink(trackingResult.data, appUrl) : null;
  const outcomeSummary = outcomesResult.data?.length
    ? summarizeMissionOutcomeRows(outcomesResult.data)
    : emptyMissionOutcomeSummary();

  return {
    mission: { ...mission, outcomeSummary },
    actions,
    events,
    trackingLink,
    outcomeSummary,
    decisionCount: actions.filter((action) => action.status === "awaiting_approval").length,
    workbenchHref: mission.kitId
      ? `/kits/${mission.kitId}`
      : `/workbench?missionId=${encodeURIComponent(mission.id)}&platform=${encodeURIComponent(mission.platform)}&idea=${encodeURIComponent(mission.workbenchIdea)}`
  };
}

export function mapTrackingLink(row: {
  id: unknown;
  code: unknown;
  destination_url: unknown;
  source: unknown;
  medium: unknown;
  campaign: unknown;
  content: unknown;
  status: unknown;
}, appUrl: string): MissionTrackingLink {
  return {
    id: String(row.id),
    code: String(row.code),
    destinationUrl: String(row.destination_url),
    trackingUrl: `${appUrl.replace(/\/$/, "")}/go/${encodeURIComponent(String(row.code))}`,
    source: String(row.source),
    medium: String(row.medium),
    campaign: String(row.campaign),
    content: row.content ? String(row.content) : null,
    status: row.status === "disabled" ? "disabled" : "active"
  };
}

export function resolvedTrackingDestination(link: MissionTrackingLink): string {
  return appendTrackingParams(link.destinationUrl, link);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
