import { z } from "zod";
import { GenerationRunError } from "@/lib/generation-runs";

export const stagingGenerationFaultModeSchema = z.enum([
  "provider_timeout_once",
  "terminal_provider_failure",
  "consumer_interruption_once",
  "duplicate_queue_delivery",
  "partial_platform_failure"
]);

export type StagingGenerationFaultMode = z.infer<
  typeof stagingGenerationFaultModeSchema
>;

type StagingFaultEnvironment = {
  FINFOLD_DEPLOYMENT_ENV?: string;
  STAGING_GENERATION_FAULT_MODE?: string;
};

/**
 * Deployment-scoped fault injection for an isolated staging Worker.
 *
 * The mode is deliberately not request-controlled: putting a shared control
 * secret in browser headers would copy it into Playwright traces. Production
 * fails closed if an operator accidentally configures a staging mode there.
 */
export function getStagingGenerationFaultMode(
  env: StagingFaultEnvironment = process.env as unknown as StagingFaultEnvironment
): StagingGenerationFaultMode | null {
  const configured = env.STAGING_GENERATION_FAULT_MODE?.trim();
  if (!configured) return null;
  if (env.FINFOLD_DEPLOYMENT_ENV !== "staging") {
    throw new Error(
      "Refusing staging generation fault injection outside an isolated staging deployment."
    );
  }
  return stagingGenerationFaultModeSchema.parse(configured);
}

export function generationJobLeaseSecondsForFaultMode(
  mode: StagingGenerationFaultMode | null
): number {
  // The interruption scenario starts each claim with a short lease so the
  // Queue's normal 30-second retry can prove reclamation without a 15-minute
  // delay. The route immediately extends a recovered attempt to 900 seconds.
  return mode === "consumer_interruption_once" ? 5 : 900;
}

export class StagingConsumerInterruption extends Error {
  constructor() {
    super("Staging fault injection interrupted the consumer after its lease was claimed.");
    this.name = "StagingConsumerInterruption";
  }
}

export function injectStagingConsumerInterruptionAfterClaim(
  mode: StagingGenerationFaultMode | null,
  durableAttempt: number
): void {
  if (mode === "consumer_interruption_once" && durableAttempt === 1) {
    throw new StagingConsumerInterruption();
  }
}

export function injectStagingFaultBeforeProvider(
  mode: StagingGenerationFaultMode | null,
  durableAttempt: number
): void {
  if (mode === "provider_timeout_once" && durableAttempt === 1) {
    throw new GenerationRunError({
      code: "provider_unavailable",
      message: "Staging fault injection simulated a provider timeout.",
      retryable: true
    });
  }
  if (mode === "terminal_provider_failure") {
    throw new GenerationRunError({
      code: "generation_failed",
      message: "Staging fault injection simulated a terminal provider failure.",
      retryable: false
    });
  }
}

export function applyStagingPartialPlatformFailure<T>(
  mode: StagingGenerationFaultMode | null,
  outputs: T[]
): T[] {
  if (mode !== "partial_platform_failure" || outputs.length < 2) {
    return outputs;
  }
  return outputs.slice(0, -1);
}
