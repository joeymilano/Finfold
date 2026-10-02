import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("trusted upload storage boundary", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/061_lock_down_public_upload_ingress.sql"
    ),
    "utf8"
  );

  it("removes authenticated direct writes to public upload buckets", () => {
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Users can upload own media"'
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Users can update own media"'
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Users can upload own avatar"'
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "avatars: upload own"'
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "avatars: update own"'
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "avatars: delete own"'
    );
    expect(migration).toContain(
      "RAISE EXCEPTION\n      'Direct upload Storage policies remain after lockdown: %'"
    );
  });

  it("adds bucket-level MIME and byte limits as defense in depth", () => {
    expect(migration).toContain("file_size_limit = 26214400");
    expect(migration).toContain("file_size_limit = 2097152");
    expect(migration).toContain(
      "ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]"
    );
  });

  it("applies the same image policy to every server-side media bucket writer", () => {
    const writerFiles = [
      "lib/image-persistence.ts",
      "app/api/stock/pexels/cache/route.ts",
      "app/api/stock/pixabay/cache/route.ts",
      "app/api/kits/[kitId]/outputs/[outputId]/visual-assets/route.ts"
    ];

    for (const file of writerFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).toContain("inspectMediaUploadBytes");
      expect(source, file).not.toContain("sniffFileKind");
    }
  });

  it("does not negotiate stock-image formats that the persistence policy rejects", () => {
    const stockWriters = [
      "app/api/stock/pexels/cache/route.ts",
      "app/api/stock/pixabay/cache/route.ts"
    ];

    for (const file of stockWriters) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).toContain('Accept: "image/webp,image/png,image/jpeg"');
      expect(source, file).not.toContain("image/avif");
    }
  });

  it("keeps Agent documents in a separate private bucket", () => {
    const agentMigration = readFileSync(
      join(process.cwd(), "supabase/migrations/063_private_agent_attachments.sql"),
      "utf8"
    );
    expect(agentMigration).toContain("'agent-attachments'");
    expect(agentMigration).toContain("false,");
    expect(agentMigration).toContain("'application/pdf'");
    expect(agentMigration).not.toContain("CREATE POLICY");
  });
});
