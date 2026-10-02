import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: () => ({ from: mocks.from })
}));

import { getBrainCompleteness } from "@/lib/brand-brain";
import { mapBrandBrainFromRow } from "@/lib/brand-brain-persistence";
import { updateMcpBrandMemory } from "@/lib/mcp/service";

const baseRow = {
  identity_type: "brand",
  brand_name: "Acme",
  product_description: "Existing description",
  target_audience: "Existing audience",
  positioning_statement: "Existing positioning",
  tone_keywords: ["warm", "precise"],
  banned_phrases: ["synergy"],
  competitors: ["Rival Co"],
  approved_examples: [],
  learned_style: ["Prefers short hooks"],
  learned_negative: ["Avoid hashtag walls"],
  performance_rules: ["Lead with the metric"]
};

function mockExistingRow(row: Record<string, unknown> | null) {
  mocks.from.mockImplementation((table: string) => {
    expect(table).toBe("brand_brains");
    return {
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
      upsert: mocks.upsert
    };
  });
  mocks.maybeSingle.mockResolvedValue({ data: row, error: null });
}

describe("updateMcpBrandMemory merge semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it("replaces scalars, appends de-duplicated list items, and preserves system-managed fields", async () => {
    mockExistingRow(baseRow);

    const result = await updateMcpBrandMemory("user-123", {
      identity_type: "personal",
      brand_name: "New Name",
      tone_keywords: ["precise", "bold  "]
    });

    expect(result.updated).toBe(true);
    expect(result.brand_name).toBe("New Name");
    expect(result.changed_fields).toEqual(
      expect.arrayContaining(["identity_type", "brand_name", "tone_keywords"])
    );
    expect(result.completeness).toBeGreaterThan(0);

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const [payload, options] = mocks.upsert.mock.calls[0];
    expect(payload.user_id).toBe("user-123");
    expect(payload.brand_name).toBe("New Name");
    expect(payload.product_description).toBe("Existing description");
    // Appended after existing items, de-duplicated, trimmed, blanks dropped.
    expect(payload.tone_keywords).toEqual(["warm", "precise", "bold"]);
    expect(options).toEqual({ onConflict: "user_id" });
    // System-managed learning must survive an external merge.
    expect(payload.learned_style).toEqual(["Prefers short hooks"]);
    expect(payload.learned_negative).toEqual(["Avoid hashtag walls"]);
    expect(payload.performance_rules).toEqual(["Lead with the metric"]);
  });

  it("caps appended lists at the schema limit instead of throwing", async () => {
    mockExistingRow({
      ...baseRow,
      banned_phrases: Array.from({ length: 19 }, (_, index) => `phrase-${index}`)
    });

    const result = await updateMcpBrandMemory("user-123", {
      banned_phrases: ["new-phrase-1", "new-phrase-2"]
    });

    expect(result.changed_fields).toContain("banned_phrases");
    const [payload] = mocks.upsert.mock.calls[0];
    // Same cap direction as the in-app Agent: keep the oldest N, drop the tail.
    expect(payload.banned_phrases).toHaveLength(20);
    expect(payload.banned_phrases).toContain("new-phrase-1");
    expect(payload.banned_phrases).not.toContain("new-phrase-2");
  });

  it("skips the write entirely when nothing changes", async () => {
    mockExistingRow(baseRow);

    const result = await updateMcpBrandMemory("user-123", {
      brand_name: "Acme",
      tone_keywords: ["warm"]
    });

    expect(result.updated).toBe(true);
    expect(result.changed_fields).toEqual([]);
    expect(result.brand_name).toBe("Acme");
    expect(result.completeness).toBe(getBrainCompleteness(mapBrandBrainFromRow(baseRow)));
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("seeds an empty memory on first write without touching learned fields", async () => {
    mockExistingRow(null);

    const result = await updateMcpBrandMemory("user-123", {
      brand_name: "Fresh Brand",
      tone_keywords: ["calm"]
    });

    expect(result.brand_name).toBe("Fresh Brand");
    const [payload] = mocks.upsert.mock.calls[0];
    expect(payload.user_id).toBe("user-123");
    expect(payload.identity_type).toBe("personal");
    expect(payload.tone_keywords).toEqual(["calm"]);
    expect(payload.learned_style).toEqual([]);
    expect(payload.learned_negative).toEqual([]);
  });
});
