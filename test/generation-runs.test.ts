import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GenerationRunError,
  classifyGenerationFailure,
  decideGenerationRunClaim,
  hashGenerationRequest,
  resolveGenerationRequestId
} from "@/lib/generation-runs";
import { LLMRequestError } from "@/lib/llm-providers";

describe("durable generation runs", () => {
  it("keeps a valid client idempotency key and replaces unsafe input", () => {
    expect(resolveGenerationRequestId("gen_01JABCDEF1234567")).toBe(
      "gen_01JABCDEF1234567"
    );

    const generated = resolveGenerationRequestId("bad key with spaces");
    expect(generated).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("fingerprints equivalent objects deterministically without retaining raw text", async () => {
    const first = await hashGenerationRequest({
      ideaText: "private launch notes",
      platforms: ["x", "linkedin"]
    });
    const reordered = await hashGenerationRequest({
      platforms: ["x", "linkedin"],
      ideaText: "private launch notes"
    });
    const different = await hashGenerationRequest({
      ideaText: "different private launch notes",
      platforms: ["x", "linkedin"]
    });

    expect(first).toHaveLength(64);
    expect(reordered).toBe(first);
    expect(different).not.toBe(first);
    expect(first).not.toContain("private");
  });

  it("treats same-input replay as duplicate and changed-input replay as conflict", () => {
    expect(
      decideGenerationRunClaim(
        { request_fingerprint: "a".repeat(64) },
        "a".repeat(64)
      )
    ).toBe("duplicate");
    expect(
      decideGenerationRunClaim(
        { request_fingerprint: "a".repeat(64) },
        "b".repeat(64)
      )
    ).toBe("conflict");
  });

  it("preserves explicit business failures", () => {
    const failure = classifyGenerationFailure(
      new GenerationRunError({
        code: "moderation_rejected",
        message: "Input rejected.",
        retryable: false
      })
    );

    expect(failure).toEqual({
      code: "moderation_rejected",
      message: "Input rejected.",
      retryable: false
    });
  });

  it("classifies rate limits as retryable and validation as non-retryable", () => {
    expect(classifyGenerationFailure(new LLMRequestError(429, "busy"))).toMatchObject({
      code: "rate_limited",
      retryable: true
    });
    expect(
      classifyGenerationFailure(
        new z.ZodError([
          {
            code: "custom",
            path: ["ideaText"],
            message: "too short"
          }
        ])
      )
    ).toMatchObject({
      code: "invalid_request",
      retryable: false
    });
  });

  it("keeps provider failures actionable after wrapper boundaries", () => {
    expect(
      classifyGenerationFailure(
        new Error("AI generation failed: LLM request failed: 429 busy")
      )
    ).toMatchObject({ code: "rate_limited", retryable: true });
    expect(
      classifyGenerationFailure(
        new Error("AI generation failed: LLM request failed: 503 down")
      )
    ).toMatchObject({ code: "provider_unavailable", retryable: true });
  });

  it("ships owner-only RLS and idempotency/recovery indexes", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/055_generation_runs.sql"),
      "utf8"
    );

    expect(migration).toContain(
      "ON public.generation_runs(user_id, request_id)"
    );
    expect(migration).toContain("USING (auth.uid() = user_id)");
    expect(migration).toContain(
      "WHERE status IN ('queued', 'running')"
    );
    expect(migration).not.toMatch(
      /generation runs: (insert|update|delete) own/i
    );
  });

  it("ships lease-guarded atomic reservation and one-time refund recovery", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/056_generation_run_leases.sql"),
      "utf8"
    );

    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.reserve_generation_run_credits"
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.fail_generation_run"
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.recover_stale_generation_run"
    );
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("v_run.lease_token <> p_lease_token");
    expect(migration).toContain("NOT v_run.credits_refunded");
    expect(migration).toContain(
      "WHERE generation_run_id = p_run_id"
    );
    expect(migration).toContain("'outcome', 'reconciled'");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });
});
