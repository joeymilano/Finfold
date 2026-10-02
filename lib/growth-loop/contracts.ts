import { z } from "zod";

/**
 * Growth loop R1 contracts: feature gates, request schemas, and the
 * deterministic channel capability map.
 *
 * Tenancy note (ADR-001): there are no workspaces — every check in this
 * module and its callers is keyed on the authenticated Supabase user id.
 */

export const GROWTH_LOOP_MISSION_KIND = "growth_loop";
export const ATTRIBUTION_RULE_VERSION = "last-click-90d-frozen-v1";
export const GROWTH_PLAN_PROMPT_VERSION = "growth-plan-2026-09-17.1";
export const GROWTH_REVIEW_PROMPT_VERSION = "growth-review-2026-09-17.1";
export const METRIC_DEFINITION_VERSION = "activation-v1";
export const GROWTH_LOOP_CHANNEL = "xiaohongshu" as const;

/** v1 ships exactly one channel with exactly one executable action type. */
export const CHANNEL_CAPABILITIES = {
  [GROWTH_LOOP_CHANNEL]: {
    platform: GROWTH_LOOP_CHANNEL,
    actionTypes: ["publish_post"],
    executionModes: ["manual", "assisted"],
    evidenceCeiling: "user_reported",
    impressionAccess: false
  }
} as const;

export type GrowthLoopChannelCapability =
  (typeof CHANNEL_CAPABILITIES)[typeof GROWTH_LOOP_CHANNEL];

// ---------------------------------------------------------------------------
// Feature gate (mirrors the extension reply pilot pattern: kill switch +
// mode + per-user whitelist; unknown values fail closed).
// ---------------------------------------------------------------------------

export type GrowthLoopPilotMode = "off" | "whitelist" | "open";

export function growthLoopPilotMode(): GrowthLoopPilotMode {
  const raw = process.env.FINFOLD_GROWTH_LOOP_PILOT_MODE;
  if (raw === "off" || raw === "whitelist" || raw === "open") return raw;
  return "whitelist";
}

export function growthLoopKillSwitchOn(): boolean {
  return process.env.FINFOLD_GROWTH_LOOP_ENABLED === "true";
}

export function growthLoopPilotUserIds(): string[] {
  return (process.env.FINFOLD_GROWTH_LOOP_PILOT_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function growthLoopEnabled(userId: string): boolean {
  if (!growthLoopKillSwitchOn()) return false;
  const mode = growthLoopPilotMode();
  if (mode === "open") return true;
  if (mode === "off") return false;
  return growthLoopPilotUserIds().includes(userId);
}

/** Coarse server-side visibility for the navigation entry. */
export function growthLoopVisibleForNav(): boolean {
  if (!growthLoopKillSwitchOn()) return false;
  const mode = growthLoopPilotMode();
  return mode === "open" || growthLoopPilotUserIds().length > 0;
}

export class GrowthLoopDisabledError extends Error {
  constructor() {
    super("Growth loop is not enabled for this account.");
    this.name = "GrowthLoopDisabledError";
  }
}

export function assertGrowthLoopEnabled(userId: string): void {
  if (!growthLoopEnabled(userId)) throw new GrowthLoopDisabledError();
}

// ---------------------------------------------------------------------------
// Request schemas (strict: no passthrough).
// ---------------------------------------------------------------------------

const isoTimestamp = z.string().datetime({ offset: true });

export const growthGoalInputSchema = z.object({
  title: z.string().trim().min(4).max(200),
  landingUrl: z.string().trim().url().max(2048),
  targetValue: z.number().int().min(1).max(10_000),
  endAt: isoTimestamp,
  timezone: z.string().trim().max(64).default("Asia/Shanghai")
}).superRefine((input, context) => {
  if (new Date(input.endAt).getTime() <= Date.now()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endAt"],
      message: "The goal end time must be in the future."
    });
  }
});

export const growthGoalDecisionSchema = z.object({
  decision: z.enum(["pause", "resume"])
});

export const growthActionDecisionSchema = z.object({
  decision: z.enum(["approve", "cancel"]),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/).optional()
});

const XIAOHONGSHU_EVIDENCE_HOST = /^https:\/\/([a-z0-9-]+\.)*xiaohongshu\.com\/[^\s]*$/;

export const growthEvidenceSchema = z.object({
  variantKey: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  evidenceUrl: z.string().trim().max(2048).regex(
    XIAOHONGSHU_EVIDENCE_HOST,
    "Publication evidence must be an https Xiaohongshu link."
  ),
  executionMode: z.enum(["manual", "assisted"]),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  windowDays: z.number().int().min(1).max(90).default(14)
});

export const growthVariantDraftSchema = z.object({
  variantKey: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  kitId: z.string().uuid()
});

export const growthLearningDecisionSchema = z.object({
  decision: z.enum(["accept", "reject", "revoke"])
});

// ---------------------------------------------------------------------------
// Planner model output contract (spec §5). Draft references stay symbolic —
// real kit binding happens server-side after the user generates content.
// ---------------------------------------------------------------------------

export const experimentPlanModelSchema = z.strictObject({
  hypothesis: z.string().trim().min(10).max(500),
  primaryVariable: z.string().trim().min(2).max(60),
  designType: z.literal("exploratory"),
  variants: z.array(z.strictObject({
    key: z.enum(["A", "B"]),
    angle: z.string().trim().min(2).max(80),
    workbenchIdea: z.string().trim().min(10).max(2000)
  })).min(2).max(2),
  actions: z.array(z.strictObject({
    variantKey: z.enum(["A", "B"]),
    type: z.literal("publish_post"),
    channelRef: z.literal("selected_channel")
  })).length(2),
  missingInputs: z.array(z.string().trim().max(200)).max(5).default([]),
  usedLearningIds: z.array(z.string().uuid()).max(5).default([])
}).superRefine((plan, context) => {
  const keys = new Set(plan.variants.map((variant) => variant.key));
  if (keys.size !== plan.variants.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["variants"],
      message: "Variant keys must be unique."
    });
  }
  for (const [index, action] of plan.actions.entries()) {
    if (!keys.has(action.variantKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actions", index, "variantKey"],
        message: "Actions must reference a declared variant."
      });
    }
  }
});

export type ExperimentPlanModel = z.infer<typeof experimentPlanModelSchema>;

// ---------------------------------------------------------------------------
// Reviewer contract.
// ---------------------------------------------------------------------------

export const reviewConclusionSchema = z.enum([
  "insufficient_data",
  "continue_observing",
  "revise_hypothesis",
  "repeat_test",
  "stop"
]);

export type ReviewConclusion = z.infer<typeof reviewConclusionSchema>;

export const reviewNarrativeModelSchema = z.object({
  conclusion: reviewConclusionSchema,
  narrative: z.string().trim().min(20).max(600),
  suggestedLearning: z.object({
    statement: z.string().trim().min(10).max(500),
    applicableConditions: z.string().trim().max(300).default(""),
    limitations: z.string().trim().max(300).default("")
  })
});

export type ReviewNarrativeModel = z.infer<typeof reviewNarrativeModelSchema>;

// ---------------------------------------------------------------------------
// Row types shared across the growth-loop modules.
// ---------------------------------------------------------------------------

export type GrowthLoopGoalRow = {
  id: string;
  user_id: string;
  title: string;
  objective_type: string;
  metric_definition: Record<string, unknown>;
  metric_definition_version: string;
  landing_url: string;
  channel_platform: string;
  target_value: number | string;
  start_at: string;
  end_at: string;
  timezone: string;
  status: "active" | "paused" | "completed" | "closed";
  created_at: string;
  updated_at: string;
};

export type GrowthLearningRow = {
  id: string;
  user_id: string;
  goal_id: string | null;
  mission_id: string | null;
  statement: string;
  applicable_conditions: string;
  limitations: string;
  evidence: Record<string, unknown>;
  status: "candidate" | "accepted" | "rejected" | "revoked";
  accepted_at: string | null;
  revoked_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type MissionPlanSnapshot = {
  planVersion?: number;
  hypothesis?: string;
  primaryVariable?: string;
  designType?: string;
  variants?: Array<{ key: string; angle: string; workbenchIdea: string; kitId?: string }>;
  usedLearningIds?: string[];
  usedLearningNotes?: Record<string, string>;
  missingInputs?: string[];
  contextDigest?: Record<string, unknown>;
  generatedAt?: string;
  reviewHistory?: Array<Record<string, unknown>>;
};
