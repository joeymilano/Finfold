import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  loadBusinessAccountabilityReview: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));

vi.mock("@/lib/operations/business-review", () => ({
  loadBusinessAccountabilityReview: mocks.loadBusinessAccountabilityReview
}));

import { GET } from "@/app/api/operations/business-review/route";

describe("GET /api/operations/business-review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    mocks.loadBusinessAccountabilityReview.mockResolvedValue({ period: { key: "2026-08" } });
  });

  it("loads only the authenticated tenant review", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.loadBusinessAccountabilityReview).toHaveBeenCalledWith(
      mocks.createSupabaseAdminClient.mock.results[0].value,
      "user-1"
    );
    await expect(response.json()).resolves.toMatchObject({
      review: { period: { key: "2026-08" } },
      persisted: true
    });
  });

  it("keeps the route protected", async () => {
    mocks.getCurrentUserId.mockRejectedValue(new Error("Unauthorized"));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.loadBusinessAccountabilityReview).not.toHaveBeenCalled();
  });

  it("does not expose storage errors to the client", async () => {
    mocks.loadBusinessAccountabilityReview.mockRejectedValue(new Error("column secret_internal does not exist"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to build the business accountability review."
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
