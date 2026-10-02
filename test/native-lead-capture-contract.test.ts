import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("native lead capture database contract", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/094_native_lead_capture.sql"),
    "utf8"
  );

  it("keeps contact details encrypted and behind server routes", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.native_lead_submissions");
    expect(migration).toContain("encrypted_work_email");
    expect(migration).toContain("encrypted_company");
    expect(migration).toContain("encrypted_need");
    expect(migration).toContain("ALTER TABLE public.native_lead_submissions ENABLE ROW LEVEL SECURITY");
    expect(migration).not.toContain("CREATE POLICY");
    expect(migration).toContain("TO service_role");
  });

  it("resolves the mission through the tracking link and owner boundary", () => {
    expect(migration).toContain("FOREIGN KEY (mission_id, mission_owner_user_id)");
    expect(migration).toContain("FOREIGN KEY (tracking_link_id, mission_owner_user_id, mission_id)");
    expect(migration).toContain("WHERE code = trim(p_tracking_code)");
    expect(migration).toContain("AND user_id = v_link.user_id");
    expect(migration).toContain("mission_owner_user_id = p_user_id");
  });

  it("stores a candidate first and counts a lead only after owner qualification", () => {
    const candidateFunction = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.ingest_native_lead_candidate"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.review_native_lead_candidate")
    );
    expect(candidateFunction).not.toContain("INSERT INTO public.outcome_events");
    expect(migration).toContain("p_decision NOT IN ('qualify', 'reject')");
    expect(migration).toContain("'native:lead:' || v_lead.id::text");
    expect(migration).toContain("'finfold-native-lead-form'");
    expect(migration).toContain("'piiStoredInOutcomeLedger', false");
  });

  it("makes candidate ingestion and qualification replay-safe", () => {
    expect(migration).toContain("UNIQUE (tracking_link_id, submission_hash)");
    expect(migration).toContain("Submission identifier was already used with different content.");
    expect(migration).toContain("ON CONFLICT (mission_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING");
    expect(migration).toContain("'replayed', v_inserted = 0");
  });
});
