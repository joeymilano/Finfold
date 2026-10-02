import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDatabaseContract } from "../scripts/check-db-contract.mjs";

describe("multi social authorization database contract", () => {
  const authorizationMigration = readFileSync(
    join(process.cwd(), "supabase/migrations/092_multi_social_authorizations.sql"),
    "utf8"
  );
  const metricsMigration = readFileSync(
    join(process.cwd(), "supabase/migrations/093_official_social_account_metrics.sql"),
    "utf8"
  );

  it("models each provider grant as an independent connection", () => {
    expect(authorizationMigration).toContain("DROP CONSTRAINT IF EXISTS social_connections_unique_user_connector");
    expect(authorizationMigration).toContain("ADD COLUMN IF NOT EXISTS connection_id uuid");
    expect(authorizationMigration).not.toContain("ON CONFLICT (user_id, connector_id)");
    expect(authorizationMigration).not.toContain("DELETE FROM public.social_oauth_authorizations\n  WHERE user_id = p_user_id");
  });

  it("binds callback completion and disconnection to an owned connection id", () => {
    expect(authorizationMigration).toContain("consume_social_oauth_authorization_v2");
    expect(authorizationMigration).toContain("complete_social_oauth_connection_v2");
    expect(authorizationMigration).toContain("disconnect_social_connection_by_id");
    expect(authorizationMigration).toContain("AND user_id = p_user_id");
    expect(authorizationMigration).toContain("AND connector_id = p_connector_id");
    expect(authorizationMigration).toContain("AND status = 'pending'");
    expect(authorizationMigration).not.toMatch(
      /social_oauth_authorizations\s+authorization\b/i
    );
  });

  it("attributes imported results to the exact account without browser access to secrets", () => {
    expect(metricsMigration).toContain("CREATE TABLE IF NOT EXISTS public.official_social_post_metrics");
    expect(metricsMigration).toContain("connection_account_id uuid NOT NULL");
    expect(metricsMigration).toContain("impressions bigint CHECK (impressions IS NULL");
    expect(metricsMigration).toContain("views bigint CHECK (views IS NULL");
    expect(metricsMigration).not.toContain("DEFAULT 0");
    expect(metricsMigration).toContain("connection.user_id = p_user_id");
    expect(metricsMigration).toContain("connection.connector_id IN ('instagram', 'linkedin')");
    expect(metricsMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(metricsMigration).toContain("TO service_role");

    const contract = buildDatabaseContract();
    expect(contract.functions).toContain(
      "public.complete_social_oauth_connection_v2(uuid,uuid,text,text,text,timestamptz,text[])"
    );
    expect(contract.functions).toContain(
      "public.disconnect_social_connection_by_id(uuid,uuid)"
    );
    expect(contract.functions).toContain(
      "public.save_official_social_post_metrics(uuid,uuid,text,text,text,timestamptz,bigint,bigint,bigint,bigint,bigint,timestamptz)"
    );
  });
});
