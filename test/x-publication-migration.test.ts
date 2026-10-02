import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/110_x_publication_jobs.sql"),
  "utf8"
);

describe("X publication jobs migration", () => {
  it("pins approved content to an immutable fingerprint and stays server-only", () => {
    expect(migration).toContain("content_fingerprint");
    expect(migration).toContain("content_snapshot");
    expect(migration).toContain("ALTER TABLE public.x_publication_jobs ENABLE ROW LEVEL SECURITY");
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*?x_publication_jobs/i);
  });

  it("claims due work atomically and prevents duplicate replies to a target", () => {
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("lease_token = gen_random_uuid()");
    expect(migration).toContain("x_publication_jobs_one_reply_per_target_idx");
    expect(migration).toContain("UNIQUE (user_id, idempotency_key)");
    expect(migration).toContain("TO service_role");
  });

  it("resumes threads instead of duplicating tweets and bounds quotas", () => {
    expect(migration).toContain("posted_tweet_ids");
    expect(migration).toContain("daily_post_limit");
    expect(migration).toContain("daily_reply_limit");
    expect(migration).toContain("review_mode IN ('every_post', 'spot_check')");
  });
});
