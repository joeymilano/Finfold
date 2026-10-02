import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canUseAutomaticOutcomeBackflow } from "@/lib/business-mission-entitlements";

describe("automatic outcome backflow persistence", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/087_outcome_webhook_ingestion.sql"),
    "utf8"
  );

  it("is a paid accountability capability without removing manual outcomes", () => {
    expect(canUseAutomaticOutcomeBackflow("free")).toBe(false);
    expect(canUseAutomaticOutcomeBackflow("starter_v2")).toBe(false);
    expect(canUseAutomaticOutcomeBackflow("creator_v2")).toBe(false);
    expect(canUseAutomaticOutcomeBackflow("growth_v2")).toBe(true);
    expect(canUseAutomaticOutcomeBackflow("digital_employee_v2")).toBe(true);
  });

  it("keeps endpoint secrets and delivery diagnostics behind service-role routes", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.outcome_webhook_endpoints");
    expect(migration).toContain("encrypted_secret");
    expect(migration).toContain("ALTER TABLE public.outcome_webhook_endpoints ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.outcome_webhook_deliveries ENABLE ROW LEVEL SECURITY");
    expect(migration).not.toContain("CREATE POLICY");
  });

  it("enforces endpoint ownership again at the delivery-table boundary", () => {
    expect(migration).toContain("FOREIGN KEY (endpoint_id, user_id)");
    expect(migration).toContain("REFERENCES public.outcome_webhook_endpoints(id, user_id)");
  });

  it("rebuilds rerunnable constraints in dependency order", () => {
    const dropDeliveryForeignKey = migration.indexOf(
      "DROP CONSTRAINT IF EXISTS outcome_webhook_deliveries_endpoint_user_fk"
    );
    const dropEndpointUnique = migration.indexOf(
      "DROP CONSTRAINT IF EXISTS outcome_webhook_endpoints_id_user_unique"
    );
    const addEndpointUnique = migration.indexOf(
      "ADD CONSTRAINT outcome_webhook_endpoints_id_user_unique"
    );
    const addDeliveryForeignKey = migration.indexOf(
      "ADD CONSTRAINT outcome_webhook_deliveries_endpoint_user_fk"
    );

    expect(dropDeliveryForeignKey).toBeGreaterThan(-1);
    expect(dropDeliveryForeignKey).toBeLessThan(dropEndpointUnique);
    expect(dropEndpointUnique).toBeLessThan(addEndpointUnique);
    expect(addEndpointUnique).toBeLessThan(addDeliveryForeignKey);
  });

  it("stores hashes rather than raw event IDs or external references", () => {
    expect(migration).toContain("event_id_hash");
    expect(migration).toContain("externalRefHash");
    expect(migration).not.toMatch(/\bevent_id\s+text/);
    expect(migration).not.toMatch(/\bexternal_ref\s+text/);
  });

  it("resolves the mission inside the tenant and preserves human review", () => {
    expect(migration).toContain("endpoint.user_id = p_user_id");
    expect(migration).toContain("AND user_id = p_user_id");
    expect(migration).toContain("missionId and trackingCode refer to different missions");
    expect(migration).toContain("execution_state NOT IN ('measuring', 'review_due')");
    expect(migration).toContain("Recorded business evidence is awaiting the user review decision.");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.ingest_mission_outcome_webhook");
    expect(migration).toContain("TO service_role");
  });
});
