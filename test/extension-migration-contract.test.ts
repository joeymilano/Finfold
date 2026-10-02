import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/100_chrome_extension_v1.sql", "utf8");

describe("Chrome extension migration contract", () => {
  it("atomically enforces installation, IP, global, and replay limits", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("status IN ('reserved', 'succeeded')");
    expect(sql).toContain("ip_day_hash IN (p_ip_day_hash, p_previous_ip_day_hash)");
    expect(sql).toContain("created_at >= now() - interval '24 hours'");
    expect(sql).toContain("usage_day = p_usage_day");
    expect(sql).toContain("request_id uuid NOT NULL UNIQUE");
  });

  it("stores no anonymous URL, domain, body, or generated result", () => {
    const table = sql.slice(
      sql.indexOf("CREATE TABLE IF NOT EXISTS public.extension_anonymous_actions"),
      sql.indexOf("CREATE INDEX IF NOT EXISTS idx_extension_anon_install")
    );
    expect(table).not.toMatch(/\b(url|domain|page_body|source_text|generated_result)\b/i);
    expect(table).toContain("installation_hash text");
    expect(table).toContain("ip_day_hash text");
    expect(table).toContain("input_tokens integer");
  });

  it("keeps OAuth codes single-use and refresh tokens rotatable/revocable", () => {
    expect(sql).toContain("code_hash text NOT NULL UNIQUE");
    expect(sql).toContain("consumed_at timestamptz");
    expect(sql).toContain("refresh_token_hash text NOT NULL UNIQUE");
    expect(sql).toContain("revoked_at timestamptz");
  });
});
