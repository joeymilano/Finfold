import { z } from "zod";
import type {
  BusinessMissionReviewBottleneck,
  GrowthMission
} from "@/lib/agent/growth-missions";

export const measurementWindowRequestSchema = z.object({
  windowDays: z.number().int().min(1).max(90),
  idempotencyKey: z.string().uuid()
});

export const businessMissionReviewRequestSchema = z.object({
  locale: z.enum(["zh", "en"]).default("zh"),
  decision: z.enum(["goal_achieved", "fix_bottleneck", "collect_more_evidence"]),
  bottleneck: z.enum([
    "acquisition_message",
    "landing_page",
    "lead_capture",
    "signup_flow",
    "checkout"
  ]).nullable().default(null),
  evidenceNote: z.string().trim().max(500).default(""),
  extensionDays: z.number().int().min(1).max(90).nullable().default(null),
  idempotencyKey: z.string().uuid()
}).superRefine((input, context) => {
  if (input.decision === "fix_bottleneck" && !input.bottleneck) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bottleneck"],
      message: "Select one breakpoint to repair."
    });
  }
  if (
    (input.decision === "fix_bottleneck" || input.decision === "collect_more_evidence")
    && input.evidenceNote.length < 10
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["evidenceNote"],
      message: "Add at least 10 characters describing the verified or missing evidence."
    });
  }
  if (input.decision === "collect_more_evidence" && input.extensionDays === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["extensionDays"],
      message: "Choose a new evidence-collection window."
    });
  }
});

export function suggestedMeasurementWindowDays(
  objectiveType: GrowthMission["objectiveType"]
): number {
  if (objectiveType === "purchases") return 30;
  if (objectiveType === "leads") return 14;
  return 7;
}

export function businessMissionBottlenecks(
  objectiveType: GrowthMission["objectiveType"]
): BusinessMissionReviewBottleneck[] {
  const common: BusinessMissionReviewBottleneck[] = ["acquisition_message", "landing_page"];
  if (objectiveType === "purchases") return [...common, "checkout"];
  if (objectiveType === "signups") return [...common, "signup_flow"];
  return [...common, "lead_capture"];
}
