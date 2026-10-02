import { describe, expect, it } from "vitest";
import { generateActivationCodes, seedCohortRequestSchema } from "@/lib/seed-cohorts";

describe("seed cohorts", () => {
  it("generates unique, human-readable activation codes", () => {
    const codes = generateActivationCodes(20);
    expect(new Set(codes).size).toBe(20);
    for (const code of codes) expect(code).toMatch(/^FF-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  });

  it("bounds privileged cohort creation", () => {
    expect(seedCohortRequestSchema.safeParse({ batchLabel: "July founders", count: 10, plan: "pro", durationDays: 30 }).success).toBe(true);
    expect(seedCohortRequestSchema.safeParse({ batchLabel: "x", count: 1000, plan: "pro", durationDays: 365 }).success).toBe(false);
  });
});
