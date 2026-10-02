import type { createSupabaseAdminClient } from "@/lib/supabase";
import type { GenerateRequest } from "@/lib/content-schema";
import { fetchHighPerformers } from "@/lib/performance-examples";

// Seed-stage validation needs enough control observations to produce a
// credible readout. Keep the split balanced until the experiment reaches
// its minimum sample threshold; a later rollout can favor treatment after
// uplift is demonstrated.
const TREATMENT_RATIO = 0.5;

export type ExperimentBucket = "treatment" | "control";

export type FlywheelExperimentResult = {
  /** The (possibly enriched) request to pass into generateKitOutputs. */
  input: GenerateRequest;
  /** null when the user had no qualifying history — not a candidate for
   * the experiment at all, so it must not be recorded as 'control'. */
  bucket: ExperimentBucket | null;
  meta: { injectedPlatforms: string[] } | null;
};

/**
 * Fetches this user's high-performing history and, if any exists, randomly
 * assigns this generation to the treatment (examples injected) or control
 * (examples withheld) bucket — so a later readout can compare engagement
 * and edit rates between the two groups instead of just trusting that
 * few-shot injection helps. Fails open: any lookup error degrades to "no
 * experiment, no injection", matching pre-flywheel behavior exactly.
 */
export async function applyFlywheelExperiment(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
  input: GenerateRequest
): Promise<FlywheelExperimentResult> {
  try {
    const examples = await fetchHighPerformers(admin, userId, input.platforms);
    const injectedPlatforms = Object.keys(examples);

    if (injectedPlatforms.length === 0) {
      return { input, bucket: null, meta: null };
    }

    const isTreatment = Math.random() < TREATMENT_RATIO;
    if (!isTreatment) {
      return { input, bucket: "control", meta: { injectedPlatforms: [] } };
    }

    return {
      input: { ...input, perfExamples: examples },
      bucket: "treatment",
      meta: { injectedPlatforms }
    };
  } catch (error) {
    console.error("[flywheel-experiment] failed, degrading to no injection:", error);
    return { input, bucket: null, meta: null };
  }
}
