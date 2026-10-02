import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/043_shared_activation_codes.sql"),
  "utf8"
);

describe("shared activation-code migration", () => {
  it("keeps existing codes single-use by default", () => {
    expect(migration).toMatch(/max_redemptions integer NOT NULL DEFAULT 1/);
  });

  it("serializes claims and prevents duplicate redemption by one user", () => {
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("PRIMARY KEY (code, user_id)");
    expect(migration).toContain("v_redemption_count >= v_max_redemptions");
  });

  it("uses a unique subscription marker for every shared-code recipient", () => {
    expect(migration).toContain("'activation_code:' || p_code || ':' || p_user_id::text");
  });
});
