// @vitest-environment node
// Opt-in live QA of the jev_guarded pipeline against the real database:
// runs the actual morning generation for the owner account (real LLM draft
// via local LLM config), then verifies the Jev auto-review gate left every
// job in the human queue with an explanatory auto_review record. With no
// local JEV_API_KEY this exercises and proves the fail-closed path; set
// JEV_API_KEY in the env file to exercise the real decision call instead.
// Drafts are intentionally left in needs_approval for console inspection —
// that status is never auto-published by the dispatcher.
//
// Required env: JEV_QA_LIVE=1  (plus SUPABASE_SERVICE_ROLE_KEY etc. via
// JEV_QA_ENV_FILE, default .env.local) and JEV_QA_USER_ID=<owner uuid>.
import { expect, it } from "vitest";

const live = process.env.JEV_QA_LIVE === "1";
const OWNER = process.env.JEV_QA_USER_ID ?? "00000000-0000-0000-0000-000000000000";

it.skipIf(!live)("jev_guarded morning generation leaves borderline-free fail-closed evidence", async () => {
  if (process.env.JEV_QA_ENV_FILE) process.loadEnvFile(process.env.JEV_QA_ENV_FILE);
  else process.loadEnvFile(".env.local");

  const { createSupabaseAdminClient } = await import("@/lib/supabase");
  const { runXMorningGeneration } = await import("@/lib/x-pipeline/generate");
  const { getXPipelineSettings } = await import("@/lib/x-pipeline/settings");
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for the live QA run");

  const settings = await getXPipelineSettings(admin, OWNER);
  expect(settings.reviewMode).toBe("jev_guarded");
  expect(settings.generationEnabled).toBe(true);

  const result = await runXMorningGeneration(admin, { userId: OWNER });
  console.info("[jev-live] generation result:", JSON.stringify(result));
  expect(result.created).toBeGreaterThan(0);

  const { data: jobs, error } = await admin
    .from("x_publication_jobs")
    .select("id,kind,status,scheduled_for,created_at,auto_review,content_snapshot->tweets->0->>text")
    .eq("user_id", OWNER)
    .gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .order("created_at", { ascending: true });
  if (error) throw error;
  console.info("[jev-live] created jobs:");
  for (const job of jobs ?? []) {
    console.info(JSON.stringify({
      id: job.id,
      kind: job.kind,
      status: job.status,
      draft: (job.text ?? "").slice(0, 90),
      autoReview: job.auto_review
    }, null, 2));
  }

  // Fail-closed contract: with Jev unavailable locally every job must sit in
  // the human queue with an explanatory record — never scheduled blindly.
  const expectedReason = process.env.JEV_API_KEY ? "approved-or-borderline" : "jev_disabled";
  for (const job of jobs ?? []) {
    expect(["needs_approval", "scheduled"]).toContain(job.status);
    expect(job.auto_review).not.toBeNull();
    if (expectedReason === "jev_disabled") {
      expect(job.status).toBe("needs_approval");
      expect(job.auto_review.reasons).toContain("jev_disabled");
    }
  }
}, 240_000);
