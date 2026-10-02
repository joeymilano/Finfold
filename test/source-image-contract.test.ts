import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateRequestSchema } from "@/lib/content-schema";
import {
  normalizeReplacementImageSource,
  requiresImageRightsConfirmation,
  sourceImageAssetSchema
} from "@/lib/source-image";

const source = sourceImageAssetSchema.parse({
  id: "source-test",
  cachedUrl: "https://assets.finfold.app/source.jpg",
  originalUrl: "https://openai.com/source.jpg",
  pageUrl: "https://openai.com/news/launch",
  provider: "official_page",
  domain: "openai.com",
  width: 1600,
  height: 900,
  rightsStatus: "official_unverified",
  confidence: "high",
  capturedAt: "2026-09-04T00:00:00.000Z"
});

describe("source-first generation and rights contract", () => {
  it("accepts an explicit source-first source and rejects it in another mode", () => {
    const base = { ideaText: "A detailed launch brief that is long enough for generation.", goal: "lead-gen", persona: "ai-saas", platforms: ["x"] };
    expect(generateRequestSchema.parse({ ...base, visualMode: "source_first", visualSource: source }).visualSource).toEqual(source);
    expect(() => generateRequestSchema.parse({ ...base, visualMode: "none", visualSource: source })).toThrow();
  });

  it("requires confirmation for unknown official sources and clears the gate once confirmed", () => {
    expect(requiresImageRightsConfirmation(source)).toBe(true);
    expect(requiresImageRightsConfirmation({ ...source, rightsConfirmedAt: "2026-09-04T01:00:00.000Z" })).toBe(false);
    expect(requiresImageRightsConfirmation({ ...source, rightsStatus: "licensed" })).toBe(false);
  });

  it("never accepts a client-authored rights confirmation when the image changes", () => {
    const normalized = normalizeReplacementImageSource({
      ...source,
      rightsStatus: "licensed",
      rightsConfirmedAt: "2026-09-04T01:00:00.000Z",
      renderStatus: "ready"
    });
    expect(normalized.rightsStatus).toBe("official_unverified");
    expect(normalized.rightsConfirmedAt).toBeUndefined();
    expect(requiresImageRightsConfirmation(normalized)).toBe(true);
  });

  it("keeps source-first outside AI-image billing and removes the default image prompt contract", () => {
    const generateRoute = readFileSync(join(process.cwd(), "app/api/generate/route.ts"), "utf8");
    const llm = readFileSync(join(process.cwd(), "lib/llm.ts"), "utf8");
    expect(generateRoute).toContain('input.visualMode === "ai_generate" || input.withImage === true');
    expect(generateRoute).toContain("source_first never enters this branch");
    expect(llm).not.toContain('imagePrompt: { type: "string" }');
  });

  it("ships migration 099 without changing the parallel 098 migration", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/099_source_first_visuals.sql"), "utf8");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS visual_source jsonb");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS image_source jsonb");
    expect(migration).toContain("'provider', 'legacy'");
    expect(migration).toContain("'rightsStatus', 'unknown'");
  });
});
