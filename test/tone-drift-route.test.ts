import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceApiRateLimit: vi.fn(),
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  fetchHighPerformers: vi.fn(),
  mapBrandBrainFromRow: vi.fn()
}));

vi.mock("@/lib/api-rate-limit", () => ({ enforceApiRateLimit: mocks.enforceApiRateLimit }));
vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));
vi.mock("@/lib/performance-examples", () => ({ fetchHighPerformers: mocks.fetchHighPerformers }));
vi.mock("@/lib/brand-brain-persistence", () => ({
  BRAND_BRAIN_COLUMNS: "*",
  mapBrandBrainFromRow: mocks.mapBrandBrainFromRow
}));

import { POST } from "@/app/api/tone-drift/check/route";

const kitId = "d1c85540-4316-4b0f-acf0-714a8dfc89ce";
const outputId = "b2c85540-4316-4b0f-acf0-714a8dfc89ce";
const userId = "a1c85540-4316-4b0f-acf0-714a8dfc89ce";

function request(body: unknown) {
  return new Request("https://finfold.example/api/tone-drift/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function input() {
  return {
    kitId,
    outputs: [{
      id: outputId,
      platform: "linkedin",
      title: "A useful release lesson",
      body: "We moved one review earlier. The release owner no longer chased the same answer twice.",
      cta: "Reply with the one handoff you would remove."
    }]
  };
}

function adminWithOutputs(outputs: unknown[]) {
  return {
    from(table: string) {
      if (table === "kit_outputs") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          in: () => Promise.resolve({ data: outputs, error: null })
        };
        return builder;
      }
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data: { user_id: userId }, error: null })
      };
      return builder;
    }
  };
}

describe("tone-drift check route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceApiRateLimit.mockReturnValue(null);
    mocks.getCurrentUserId.mockResolvedValue(userId);
    mocks.createSupabaseAdminClient.mockReturnValue(adminWithOutputs([{ id: outputId, platform: "linkedin" }]));
    mocks.mapBrandBrainFromRow.mockReturnValue({ approvedExamples: [], toneKeywords: [], learnedStyle: [], learnedNegative: [] });
    mocks.fetchHighPerformers.mockResolvedValue({
      linkedin: [
        { title: "A release lesson", body: "We moved the review earlier. What would you remove first?" },
        { title: "One useful constraint", body: "We kept the scope narrow. Which review step slows you down?" }
      ]
    });
  });

  it("checks only authenticated, user-owned kit outputs and uses their persisted platform", async () => {
    const response = await POST(request(input()));

    expect(response.status).toBe(200);
    const data = await response.json() as { assessments: Record<string, { score: number; baseline: { performanceSampleCount: number } }> };
    expect(data.assessments[outputId].score).toBeTypeOf("number");
    expect(data.assessments[outputId].baseline.performanceSampleCount).toBe(2);
    expect(mocks.fetchHighPerformers).toHaveBeenCalledWith(
      expect.anything(),
      userId,
      ["linkedin"],
      { maxExamplesPerPlatform: 3, maxBodyChars: 1_200 }
    );
  });

  it("rejects a kit or output that is not owned by the requester", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(adminWithOutputs([]));

    const response = await POST(request(input()));

    expect(response.status).toBe(404);
    expect(mocks.fetchHighPerformers).not.toHaveBeenCalled();
  });

  it("returns a validation error before reading user content for an invalid request", async () => {
    const response = await POST(request({ kitId, outputs: [] }));

    expect(response.status).toBe(400);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});