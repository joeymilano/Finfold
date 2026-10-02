import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/113_account_health_linkedin.sql"),
  "utf8"
);

describe("account health LinkedIn migration", () => {
  it("adds LinkedIn to the platform check without weakening RLS", () => {
    expect(migration).toContain("'linkedin'");
    expect(migration).toContain("'xiaohongshu'");
    expect(migration).toContain("'reddit'");
    expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(migration).not.toMatch(/DROP TABLE/i);
  });
});
