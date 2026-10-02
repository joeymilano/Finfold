import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDatabaseContract } from "../scripts/check-db-contract.mjs";

describe("first-party signup and Creem outcome bridge contract", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/091_native_outcome_attribution.sql"),
    "utf8"
  );
  const creemRoute = readFileSync(
    join(process.cwd(), "app/api/webhooks/creem/route.ts"),
    "utf8"
  );
  const signupRoute = readFileSync(
    join(process.cwd(), "app/api/auth/signup/route.ts"),
    "utf8"
  );
  const callbackRoute = readFileSync(
    join(process.cwd(), "app/(auth)/auth/callback/route.ts"),
    "utf8"
  );

  it("keeps subject-to-mission attribution server-only and first-touch locked", () => {
    expect(migration).toContain("subject_user_id        uuid        PRIMARY KEY");
    expect(migration).toContain("ALTER TABLE public.native_outcome_attributions ENABLE ROW LEVEL SECURITY");
    expect(migration).not.toContain("CREATE POLICY");
    expect(migration).toContain("ON CONFLICT (subject_user_id) DO NOTHING");
    expect(migration).toContain("FOREIGN KEY (mission_id, mission_owner_user_id)");
    expect(migration).toContain("FOREIGN KEY (tracking_link_id, mission_owner_user_id, mission_id)");
    expect(migration).toContain("link.user_id = click.user_id");
    expect(migration).toContain("mission.user_id = click.user_id");
  });

  it("accepts only eligible commercial missions and preserves human review", () => {
    expect(migration).toContain("mission.mission_kind = 'growth_opportunity'");
    expect(migration).toContain("mission.status = 'posted'");
    expect(migration).toContain("mission.execution_state IN ('measuring', 'review_due')");
    expect(migration).toContain("Recorded business evidence is awaiting the user review decision.");
    expect(migration).not.toContain("verdict = 'won'");
  });

  it("hashes provider references and grants ingestion only to the service role", () => {
    expect(migration).toContain("providerEventHash");
    expect(migration).toContain("externalRefHash");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.ingest_native_attributed_outcome");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");

    const contract = buildDatabaseContract();
    expect(contract.rls).toContainEqual(expect.objectContaining({
      schema: "public",
      table: "native_outcome_attributions",
      enabled: true
    }));
    expect(contract.functions).toContain(
      "public.ingest_native_attributed_outcome(uuid,uuid,text,text,text,numeric,text,timestamptz)"
    );
    expect(contract.grants.some((grant) => (
      grant.signature.replaceAll(" ", "")
        === "public.ingest_native_attributed_outcome(uuid,uuid,text,text,text,numeric,text,timestamptz)"
      && grant.role === "service_role"
      && grant.allowed
    ))).toBe(true);
  });

  it("wires genuine signup and signed Creem paid events without inventing lead events", () => {
    expect(signupRoute).toContain("recordNativeSignupOutcome");
    expect(signupRoute).toContain("data.user.identities?.length !== 0");
    expect(signupRoute).toContain("!needsConfirmation");
    expect(signupRoute).toContain('body.trafficClass !== "qa"');
    expect(callbackRoute).toContain("recordNativeSignupOutcome");
    expect(callbackRoute).toContain('trafficClass !== "qa"');
    expect(creemRoute).toContain('case "subscription.paid"');
    expect(creemRoute).toContain("recordCreemRevenueOutcome");
    expect(creemRoute).toContain("last_transaction_id");
    expect(migration).not.toContain("'finfold-native-lead'");
  });
});
