import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/105_plan_credit_upgrade_topup.sql"),
  "utf8"
);

// Regression: redeeming an activation code upgraded the profile to starter
// but left the cycle's plan batch at the free allowance (grant_plan_credits
// no-opped on the (user_id, period_key) conflict), so the user kept the free
// plan's leftover credits until the next cycle.
describe("same-cycle plan credit upgrade top-up (migration 105)", () => {
  it("replaces the DO-NOTHING-only grant with a grant-or-top-up function", () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.grant_plan_credits\(\s*p_user_id uuid,\s*p_credits integer,\s*p_period_key text,\s*p_expires_at timestamptz\s*\) RETURNS uuid/
    );
    // The first grant for a cycle still inserts exactly one batch.
    expect(migration).toContain(
      "ON CONFLICT (user_id, period_key) WHERE source = 'plan' DO NOTHING"
    );
  });

  it("tops the batch up by the difference when the cycle's allowance grows", () => {
    expect(migration).toContain(
      "IF v_id IS NOT NULL AND v_granted IS NOT NULL AND p_credits > v_granted THEN"
    );
    expect(migration).toContain("v_delta := p_credits - v_granted");
    expect(migration).toContain("SET granted = p_credits");
    // `used` is untouched so remaining (generated column) grows by exactly
    // the delta — mid-cycle consumption is never reset or double-counted.
    expect(migration).not.toContain("SET used");
  });

  it("keeps the grant idempotent and never claws credits back", () => {
    // Only a positive difference reaches the ledger; replays and
    // downgrades (p_credits <= granted) write no transaction.
    expect(migration).toContain("IF v_delta > 0 THEN");
    expect(migration).toContain(
      "VALUES (p_user_id, v_delta, 'grant', 'system', v_id)"
    );
  });

  it("handles the concurrent-insert race by re-reading the winner's row", () => {
    expect(migration).toMatch(
      /Lost an insert race[\s\S]*?SELECT id, granted INTO v_id, v_granted/
    );
    // Concurrent grants for the same cycle serialize on the batch row.
    expect(migration).toContain("FOR UPDATE");
  });

  it("restates the server-only RPC permissions from 057", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.grant_plan_credits(");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });
});
