import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/100_finfold_mcp_oauth_audience.sql"),
  "utf8"
);

describe("public MCP OAuth audience migration", () => {
  it("returns only the claims object expected by Supabase Auth hooks", () => {
    expect(migration).toContain("return jsonb_build_object('claims', claims)");
    expect(migration).not.toContain("return jsonb_set(event");
  });

  it("maps each exact Supabase issuer to its production or staging MCP audience", () => {
    expect(migration).toContain("https://www.finfold.app/mcp");
    expect(migration).toContain("https://staging.finfold.app/mcp");
    expect(migration).toContain("https://your-project-ref.supabase.co/auth/v1");
    expect(migration).toContain("https://your-staging-project-ref.supabase.co/auth/v1");
    expect(migration).toContain("mcp_audience := case token_issuer");
    expect(migration).not.toContain("event->>'resource'");
    expect(migration).not.toContain("claims->>'resource'");
    expect(migration).not.toMatch(/security\s+definer/i);
  });

  it("leaves ordinary browser sessions and unknown issuers unchanged", () => {
    expect(migration).toContain("oauth_client_id := nullif(claims->>'client_id', '')");
    expect(migration).toContain("if oauth_client_id is null then");
    expect(migration).toContain("if mcp_audience is null then");
  });
});
