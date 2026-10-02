import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/084_growth_portfolio.sql"),
  "utf8"
);

describe("growth portfolio migration", () => {
  it("creates an owned real-data ledger and one active goal", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.managed_social_accounts");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.social_account_snapshots");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.growth_portfolio_goals");
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "managed social accounts: select own" ON public.managed_social_accounts'
    );
    expect(migration.match(/DROP POLICY IF EXISTS/g)).toHaveLength(11);
    expect(migration.match(/CREATE POLICY/g)).toHaveLength(11);
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("growth_portfolio_goals_one_active_idx");
  });

  it("keeps account and snapshot writes atomic behind service role", () => {
    expect(migration).toContain("FUNCTION public.save_growth_portfolio_account");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("source IN ('manual', 'import', 'official_sync')");
  });
});
