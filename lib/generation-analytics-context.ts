import { z } from "zod";

export const generationAnalyticsSchema = z.object({
  traffic_class: z.enum(["production", "qa", "unknown"]),
  first_task_id: z.string().uuid().optional(),
  entry_point: z.enum(["first_task", "workbench", "other"]).default("other")
});
export type GenerationAnalyticsContext = z.infer<typeof generationAnalyticsSchema>;

export function normalizeGenerationAnalytics(value: unknown): GenerationAnalyticsContext {
  const result = generationAnalyticsSchema.safeParse(value);
  return result.success ? result.data : { traffic_class: "unknown", entry_point: "other" };
}
