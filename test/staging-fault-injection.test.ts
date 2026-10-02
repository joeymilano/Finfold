import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyStagingPartialPlatformFailure,
  generationJobLeaseSecondsForFaultMode,
  getStagingGenerationFaultMode,
  injectStagingConsumerInterruptionAfterClaim,
  injectStagingFaultBeforeProvider,
  StagingConsumerInterruption
} from "@/lib/staging-fault-injection";
import { classifyGenerationFailure } from "@/lib/generation-runs";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("staging generation fault injection", () => {
  it("is absent by default and refuses every non-staging deployment", () => {
    expect(getStagingGenerationFaultMode({})).toBeNull();
    expect(() =>
      getStagingGenerationFaultMode({
        FINFOLD_DEPLOYMENT_ENV: "production",
        STAGING_GENERATION_FAULT_MODE: "provider_timeout_once"
      })
    ).toThrow(/outside an isolated staging deployment/);
  });

  it("rejects unknown modes even on staging", () => {
    expect(() =>
      getStagingGenerationFaultMode({
        FINFOLD_DEPLOYMENT_ENV: "staging",
        STAGING_GENERATION_FAULT_MODE: "damage-production"
      })
    ).toThrow();
  });

  it("injects one retryable provider timeout only on the first durable attempt", () => {
    expect(() =>
      injectStagingFaultBeforeProvider("provider_timeout_once", 1)
    ).toThrow();
    try {
      injectStagingFaultBeforeProvider("provider_timeout_once", 1);
    } catch (error) {
      expect(classifyGenerationFailure(error)).toMatchObject({
        code: "provider_unavailable",
        retryable: true
      });
    }
    expect(() =>
      injectStagingFaultBeforeProvider("provider_timeout_once", 2)
    ).not.toThrow();
  });

  it("injects a terminal provider failure that is eligible for the normal refund path", () => {
    try {
      injectStagingFaultBeforeProvider("terminal_provider_failure", 1);
      throw new Error("expected terminal staging fault");
    } catch (error) {
      expect(classifyGenerationFailure(error)).toMatchObject({
        code: "generation_failed",
        retryable: false
      });
    }
  });

  it("uses a short lease for interruption recovery and interrupts only once", () => {
    expect(
      generationJobLeaseSecondsForFaultMode("consumer_interruption_once")
    ).toBe(5);
    expect(generationJobLeaseSecondsForFaultMode(null)).toBe(900);
    expect(() =>
      injectStagingConsumerInterruptionAfterClaim(
        "consumer_interruption_once",
        1
      )
    ).toThrow(StagingConsumerInterruption);
    expect(() =>
      injectStagingConsumerInterruptionAfterClaim(
        "consumer_interruption_once",
        2
      )
    ).not.toThrow();
  });

  it("turns a multi-platform result into an explicit partial result", () => {
    const outputs = [{ platform: "x" }, { platform: "linkedin" }];
    expect(
      applyStagingPartialPlatformFailure("partial_platform_failure", outputs)
    ).toEqual([{ platform: "x" }]);
    expect(applyStagingPartialPlatformFailure(null, outputs)).toBe(outputs);
    expect(
      applyStagingPartialPlatformFailure("partial_platform_failure", [outputs[0]])
    ).toHaveLength(1);
  });
});
