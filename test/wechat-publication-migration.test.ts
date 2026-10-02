import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/096_wechat_publication_jobs.sql"),
  "utf8"
);

describe("WeChat publication jobs migration", () => {
  it("binds approval to an immutable snapshot and keeps publishing server-only", () => {
    expect(migration).toContain("approved_output_updated_at");
    expect(migration).toContain("content_fingerprint");
    expect(migration).toContain("content_snapshot");
    expect(migration).toContain("prepared_snapshot");
    expect(migration).toContain("ALTER TABLE public.wechat_publication_jobs ENABLE ROW LEVEL SECURITY");
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*?wechat_publication_jobs/i);
  });

  it("claims due work atomically and prevents duplicate active publication jobs", () => {
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("lease_token = gen_random_uuid()");
    expect(migration).toContain("wechat_publication_jobs_one_active_output_idx");
    expect(migration).toContain("UNIQUE (user_id, connection_account_id, idempotency_key)");
    expect(migration).toContain("TO service_role");
  });

  it("preserves unknown formal-submit results instead of blindly retrying", () => {
    expect(migration).toContain("attention_required");
    expect(migration).toContain("publish_id IS NOT NULL");
    expect(migration).toContain("wechat_publication_callback_events");
  });
});
