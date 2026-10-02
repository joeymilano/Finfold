import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: () => ({ from: mocks.from })
}));

import { listMcpContentKits } from "@/lib/mcp/service";

describe("listMcpContentKits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.order.mockReturnValue({ limit: mocks.limit });
  });

  it("keeps the query inside the connected user and returns only the requested summaries", async () => {
    mocks.limit.mockResolvedValue({
      data: [
        {
          id: "6fdf1d8a-aa38-4f3c-a6cf-ef94f91872ea",
          idea_text: "A grounded launch brief",
          platforms: ["linkedin"],
          status: "saved",
          created_at: "2026-09-04T08:00:00.000Z",
          kit_outputs: [{ title: "A calmer content workflow" }]
        },
        {
          id: "e5e91591-9a61-4e37-9003-df161e0e7740",
          idea_text: "Another brief",
          platforms: ["x"],
          status: "saved",
          created_at: "2026-09-03T08:00:00.000Z",
          kit_outputs: []
        }
      ],
      error: null
    });

    const result = await listMcpContentKits("user-123", 1);

    expect(mocks.from).toHaveBeenCalledWith("content_kits");
    expect(mocks.select).toHaveBeenCalledWith(
      "id, idea_text, platforms, status, created_at, kit_outputs(title)"
    );
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "user-123");
    expect(mocks.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(mocks.limit).toHaveBeenCalledWith(2);
    expect(result).toEqual({
      hasMore: true,
      kits: [{
        kitId: "6fdf1d8a-aa38-4f3c-a6cf-ef94f91872ea",
        title: "A calmer content workflow",
        briefExcerpt: "A grounded launch brief",
        platforms: ["linkedin"],
        status: "saved",
        createdAt: "2026-09-04T08:00:00.000Z"
      }]
    });
  });
});
