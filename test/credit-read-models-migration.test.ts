import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/060_credit_read_models.sql"),
  "utf8"
);

describe("atomic Credits read-model migration", () => {
  it("aggregates allowance inside one stable SECURITY DEFINER SQL statement", () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_credit_allowance_snapshot\([\s\S]*?RETURNS jsonb[\s\S]*?LANGUAGE sql[\s\S]*?STABLE[\s\S]*?SECURITY DEFINER/
    );
    expect(migration).toContain("statement_timestamp()");
    expect(migration).toContain("SUM(balance.remaining)");
    expect(migration).toContain("snapshot.plan_batch_count = 1");
  });

  it("uses an inclusive lower and exclusive upper cycle bound without row limits", () => {
    expect(migration).toContain("p_period_start timestamptz");
    expect(migration).toContain("p_period_end timestamptz");
    expect(migration).toContain("tx.created_at >= bounds.period_start");
    expect(migration).toContain("tx.created_at < bounds.period_end");
    expect(migration).toContain("scoped AS MATERIALIZED");
    expect(migration).not.toMatch(/\bLIMIT\b/);
  });

  it("separates manual adjustments and expiry from action attempts", () => {
    expect(migration).toContain("scoped.action NOT IN ('adjustment', 'expire')");
    expect(migration).toContain("scoped.action = 'adjustment'");
    expect(migration).toContain("scoped.action = 'expire'");
    expect(migration).toContain("'manualCredits', totals.manual_credits");
    expect(migration).toContain("'manualDebits', totals.manual_debits");
    expect(migration).toContain("'expiredCredits', totals.expired_credits");
  });

  it("revokes public callers and grants both read models only to service_role", () => {
    for (const signature of [
      "public.get_credit_allowance_snapshot(uuid)",
      "public.get_credit_spend_summary_snapshot("
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature}`);
    }
    expect(migration.match(/FROM PUBLIC, anon, authenticated/g)).toHaveLength(2);
    expect(migration.match(/TO service_role/g)).toHaveLength(2);
  });
});
