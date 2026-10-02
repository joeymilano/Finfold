import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("public demand signal database contract", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/095_public_demand_signal_queue.sql"),
    "utf8"
  );

  it("stores public evidence separately from the commercial outcome ledger", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.public_demand_signals");
    expect(migration).not.toContain("INSERT INTO public.outcome_events");
    expect(migration).not.toContain("INSERT INTO public.native_lead_submissions");
    expect(migration).not.toMatch(/\n\s+(author|contact|email)(_|\s)/i);
  });

  it("deduplicates by the official source item and preserves human judgment", () => {
    expect(migration).toContain("UNIQUE (user_id, source, source_item_id)");
    expect(migration).toContain("ON CONFLICT (user_id, source, source_item_id) DO UPDATE SET");
    const conflictUpdate = migration.slice(migration.indexOf("ON CONFLICT (user_id, source, source_item_id)"));
    expect(conflictUpdate).not.toMatch(/first_seen_at\s*=/);
    expect(conflictUpdate).not.toMatch(/status\s*=/);
    expect(conflictUpdate).not.toMatch(/reviewed_at\s*=/);
    expect(conflictUpdate).toContain("last_seen_at = EXCLUDED.last_seen_at");
  });

  it("keeps writes server-side and review states explicit", () => {
    expect(migration).toContain("ALTER TABLE public.public_demand_signals ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FOR SELECT");
    expect(migration).not.toContain("FOR INSERT");
    expect(migration).not.toContain("FOR UPDATE");
    expect(migration).toContain("status IN ('new', 'kept', 'dismissed')");
    expect(migration).toContain("TO service_role");
  });
});
