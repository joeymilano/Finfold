import { describe, expect, it, vi } from "vitest";
import { loadOwnedResearchMission } from "@/lib/operations/research-store";

describe("Research mission tenant boundary", () => {
  it("always filters an admin-client lookup by both mission and user", async () => {
    const calls: Array<[string, string]> = [];
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((field: string, value: string) => {
        calls.push([field, value]);
        return chain;
      }),
      maybeSingle: vi.fn(async () => ({ data: null, error: null }))
    };
    const admin = { from: vi.fn(() => chain) };

    await expect(loadOwnedResearchMission(
      admin as never,
      "user-123",
      "1f34c0d0-3124-4ca7-b352-da298139cb74"
    )).resolves.toBeNull();
    expect(admin.from).toHaveBeenCalledWith("research_missions");
    expect(calls).toEqual([
      ["id", "1f34c0d0-3124-4ca7-b352-da298139cb74"],
      ["user_id", "user-123"]
    ]);
  });
});
