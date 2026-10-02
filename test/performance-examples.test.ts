import { describe, expect, it } from "vitest";
import { fetchHighPerformers } from "@/lib/performance-examples";

/**
 * Minimal fake of the Supabase admin client's chainable query builder —
 * just enough surface for fetchHighPerformers' two `.from(...).select(...)`
 * calls (performance_metrics, kit_outputs), keyed by table name so each
 * call resolves independently.
 */
function fakeAdmin(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return builder;
        },
        then<TResult1, TResult2 = never>(
          onFulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
          onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
        }
      };
      return builder;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("fetchHighPerformers", () => {
  it("returns nothing for a platform with fewer than 2 measured posts", async () => {
    const admin = fakeAdmin({
      performance_metrics: [{ platform: "reddit", likes: 100, comments: 20, kit_id: "k1" }],
      kit_outputs: [{ kit_id: "k1", platform: "reddit", title: "T1", body: "B1", final_body: null }]
    });

    const result = await fetchHighPerformers(admin, "user-1", ["reddit"]);
    expect(result).toEqual({});
  });

  it("excludes a platform whose best sample is still below the absolute floor", async () => {
    const admin = fakeAdmin({
      performance_metrics: [
        { platform: "reddit", likes: 1, comments: 0, kit_id: "k1" },
        { platform: "reddit", likes: 2, comments: 0, kit_id: "k2" }
      ],
      kit_outputs: [
        { kit_id: "k1", platform: "reddit", title: "T1", body: "B1", final_body: null },
        { kit_id: "k2", platform: "reddit", title: "T2", body: "B2", final_body: null }
      ]
    });

    const result = await fetchHighPerformers(admin, "user-1", ["reddit"]);
    expect(result).toEqual({});
  });

  it("picks the top performers per platform, preferring final_body over the AI draft", async () => {
    const admin = fakeAdmin({
      performance_metrics: [
        { platform: "reddit", likes: 5, comments: 1, kit_id: "k1" },
        { platform: "reddit", likes: 50, comments: 10, kit_id: "k2" },
        { platform: "reddit", likes: 20, comments: 3, kit_id: "k3" }
      ],
      kit_outputs: [
        { kit_id: "k1", platform: "reddit", title: "Low", body: "low body", final_body: null },
        { kit_id: "k2", platform: "reddit", title: "High", body: "draft body", final_body: "edited body" },
        { kit_id: "k3", platform: "reddit", title: "Mid", body: "mid body", final_body: null }
      ]
    });

    const result = await fetchHighPerformers(admin, "user-1", ["reddit"]);
    expect(result.reddit).toBeDefined();
    expect(result.reddit[0]).toEqual({
      title: "High",
      body: "edited body",
      likes: 50,
      comments: 10,
      impressions: 0,
      views: 0,
      coverClickRate: 0,
      averageViewSeconds: 0,
      saves: 0,
      shares: 0,
      followerGrowth: 0
    });
    expect(result.reddit.length).toBeLessThanOrEqual(2);
  });

  it("keeps generation defaults but lets analysis request up to three longer reference posts", async () => {
    const longBody = "x".repeat(650);
    const admin = fakeAdmin({
      performance_metrics: [
        { platform: "reddit", likes: 50, comments: 10, kit_id: "k1" },
        { platform: "reddit", likes: 50, comments: 10, kit_id: "k2" },
        { platform: "reddit", likes: 50, comments: 10, kit_id: "k3" }
      ],
      kit_outputs: [
        { kit_id: "k1", platform: "reddit", title: "T1", body: longBody, final_body: null },
        { kit_id: "k2", platform: "reddit", title: "T2", body: longBody, final_body: null },
        { kit_id: "k3", platform: "reddit", title: "T3", body: longBody, final_body: null }
      ]
    });

    const generationExamples = await fetchHighPerformers(admin, "user-1", ["reddit"]);
    const analysisExamples = await fetchHighPerformers(admin, "user-1", ["reddit"], {
      maxExamplesPerPlatform: 3,
      maxBodyChars: 1_200
    });

    expect(generationExamples.reddit).toHaveLength(2);
    expect(generationExamples.reddit[0].body).toHaveLength(400);
    expect(analysisExamples.reddit).toHaveLength(3);
    expect(analysisExamples.reddit[0].body).toHaveLength(650);
  });

  it("uses saves, shares, and follower growth to distinguish useful outcomes from vanity likes", async () => {
    const admin = fakeAdmin({
      performance_metrics: [
        { platform: "xiaohongshu", likes: 30, comments: 2, saves: 0, shares: 0, follower_growth: 0, kit_id: "k1" },
        { platform: "xiaohongshu", likes: 18, comments: 2, saves: 12, shares: 5, follower_growth: 3, kit_id: "k2" }
      ],
      kit_outputs: [
        { kit_id: "k1", platform: "xiaohongshu", title: "Vanity", body: "body one", final_body: null },
        { kit_id: "k2", platform: "xiaohongshu", title: "Useful", body: "body two", final_body: null }
      ]
    });

    const result = await fetchHighPerformers(admin, "user-1", ["xiaohongshu"]);
    expect(result.xiaohongshu?.[0].title).toBe("Useful");
  });

  it("keeps platforms independent — one platform's data never bleeds into another", async () => {
    const admin = fakeAdmin({
      performance_metrics: [
        { platform: "reddit", likes: 50, comments: 10, kit_id: "k1" },
        { platform: "reddit", likes: 40, comments: 8, kit_id: "k2" }
      ],
      kit_outputs: [
        { kit_id: "k1", platform: "reddit", title: "T1", body: "B1", final_body: null },
        { kit_id: "k2", platform: "reddit", title: "T2", body: "B2", final_body: null }
      ]
    });

    const result = await fetchHighPerformers(admin, "user-1", ["reddit", "xiaohongshu"]);
    expect(result.xiaohongshu).toBeUndefined();
    expect(result.reddit).toBeDefined();
  });
});
