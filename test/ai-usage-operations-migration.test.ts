import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDatabaseContract } from "../scripts/check-db-contract.mjs";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/068_ai_usage_operations.sql"),
  "utf8"
);

describe("AI usage operation migration", () => {
  it("persists each operation once with an owner-only read policy", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.ai_usage_operations");
    expect(migration).toContain("operation_key text NOT NULL UNIQUE");
    expect(migration).toContain("status IN ('reserved', 'started', 'settled', 'refunded')");
    expect(migration).toContain("ALTER TABLE public.ai_usage_operations ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("USING (auth.uid() = user_id)");
  });

  it("uses locked, service-role-only operation transitions", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.reserve_ai_usage_operation");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.start_ai_usage_operation");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.settle_ai_usage_operation");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.refund_ai_usage_operation");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.recover_stale_ai_usage_operations");
    expect(migration).toContain("ON CONFLICT (operation_key) DO NOTHING");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("public.reserve_credits(");
    expect(migration).toContain("public.refund_credits(");
    expect(migration).toContain("v_operation.status NOT IN ('reserved', 'started')");
    expect(migration).toContain("WHERE status = 'reserved'");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("keeps the start transition executable only by the service role after all grants and revokes", () => {
    const contract = buildDatabaseContract({ root: process.cwd() });
    const startGrants = contract.grants.filter((grant) =>
      grant.signature === "public.start_ai_usage_operation(uuid,uuid)"
    );

    expect(startGrants).toEqual(expect.arrayContaining([
      { signature: "public.start_ai_usage_operation(uuid,uuid)", role: "service_role", allowed: true },
      { signature: "public.start_ai_usage_operation(uuid,uuid)", role: "public", allowed: false },
      { signature: "public.start_ai_usage_operation(uuid,uuid)", role: "anon", allowed: false },
      { signature: "public.start_ai_usage_operation(uuid,uuid)", role: "authenticated", allowed: false }
    ]));
  });
});