import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/085_account_health_multiplatform.sql"),
  "utf8"
);

describe("account health multiplatform migration", () => {
  it("adds Reddit, content samples, removals, uploads, and OAuth without weakening RLS", () => {
    expect(migration).toContain("'reddit'");
    expect(migration).toContain("'content_removed'");
    expect(migration).toContain("'content_sample'");
    expect(migration).toContain("'user_upload'");
    expect(migration).toContain("'oauth'");
    expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });
});
