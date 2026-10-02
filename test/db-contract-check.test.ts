import { describe, expect, it } from "vitest";
import {
  buildDatabaseContract,
  renderDatabaseContractSql
} from "../scripts/check-db-contract.mjs";

describe("database catalog contract", () => {
  it("derives the committed 000-061 catalog contract from ordered migrations", () => {
    const contract = buildDatabaseContract({ maxMigration: 61 });

    expect(contract.files).toHaveLength(62);
    expect(contract.functions.length).toBeGreaterThanOrEqual(30);
    expect(contract.triggers.length).toBeGreaterThanOrEqual(3);
    expect(contract.rls.length).toBeGreaterThanOrEqual(30);
    expect(contract.policies.length).toBeGreaterThanOrEqual(60);
    expect(contract.grants.length).toBeGreaterThanOrEqual(20);
    expect(contract.removedPolicies).toContainEqual({
      schema: "storage",
      table: "objects",
      name: "Users can upload own media"
    });
  });

  it("renders a read-only failing SQL gate for every required catalog surface", () => {
    const sql = renderDatabaseContractSql(
      buildDatabaseContract({ maxMigration: 61 })
    );

    expect(sql).toContain("to_regprocedure(signature)");
    expect(sql).toContain("FROM pg_trigger");
    expect(sql).toContain("relation.relrowsecurity");
    expect(sql).toContain("FROM pg_policies");
    expect(sql).toContain("has_function_privilege");
    expect(sql).toContain("forbidden policy remains");
    expect(sql).toContain("RAISE EXCEPTION 'Database contract violations:%'");
  });
});
