// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askJev, jevEnabled, JevUnavailableError } from "@/lib/jev";

beforeEach(() => {
  vi.stubEnv("JEV_ENABLED", "true");
  vi.stubEnv("JEV_API_KEY", "synthetic-jev-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jevResponse(answers: Record<string, unknown>, model = "jev-1.13.0") {
  return { answers, model, usage: { input_tokens: 312, output_tokens: 0 } };
}

describe("Jev decision client", () => {
  it("gates on both JEV_ENABLED and JEV_API_KEY", () => {
    expect(jevEnabled()).toBe(true);
    vi.stubEnv("JEV_ENABLED", "false");
    expect(jevEnabled()).toBe(false);
    vi.stubEnv("JEV_ENABLED", "true");
    vi.stubEnv("JEV_API_KEY", "  ");
    expect(jevEnabled()).toBe(false);
  });

  it("fans out one call and parses noul/choice/score answers", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => new Response(
      JSON.stringify(jevResponse({
        fabricated: { type: "noul", noul: 0.07 },
        audience: { type: "choice", choice: "peer_builder", probabilities: { peer_builder: 0.81, potential_customer: 0.12, other: 0.07 }, confidence: 0.81 },
        quality: { type: "score", score: 4.2, probabilities: [0.02, 0.06, 0.18, 0.4, 0.34], confidence: 0.77 }
      })),
      { status: 200 }
    ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await askJev(
      { tweets: ["hello"], brand: "indie tool" },
      {
        fabricated: { type: "noul", instructions: "Any invented statistic?" },
        audience: { type: "choice", instructions: "Who is the author?", criteria: { peer_builder: "a fellow builder", other: "anything else" } },
        quality: { type: "score", instructions: "How substantive?", criteria: ["spammy", "thin", "ok", "good", "exceptional"] }
      },
      { operation: "unit_test" }
    );

    expect(result.model).toBe("jev-1.13.0");
    expect(result.answers.fabricated).toEqual({ type: "noul", probability: 0.07 });
    expect(result.answers.audience).toMatchObject({ type: "choice", choice: "peer_builder" });
    expect(result.answers.quality).toMatchObject({ type: "score", score: 4.2 });
    expect(result.usage).toEqual({ inputTokens: 312, outputTokens: 0 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("jev-latest");
    expect(Object.keys(body.questions)).toEqual(["fabricated", "audience", "quality"]);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer synthetic-jev-key");
  });

  it("fails closed without touching the network when disabled", async () => {
    vi.stubEnv("JEV_ENABLED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      askJev("state", { q: { type: "noul", instructions: "?" } }, { operation: "unit_test" })
    ).rejects.toBeInstanceOf(JevUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([[429], [529]])("retries overloaded status %i once before giving up", async (status) => {
    const fetchMock = vi.fn(async () => new Response("{}", { status }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      askJev("state", { q: { type: "noul", instructions: "?" } }, { operation: "unit_test" })
    ).rejects.toBeInstanceOf(JevUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recovers when the second attempt succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(jevResponse({ q: { type: "noul", noul: 0.5 } })), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await askJev("state", { q: { type: "noul", instructions: "?" } }, { operation: "unit_test" });
    expect(result.answers.q).toEqual({ type: "noul", probability: 0.5 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([[401], [422]])("does not retry configuration errors (%i)", async (status) => {
    const fetchMock = vi.fn(async () => new Response("{}", { status }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      askJev("state", { q: { type: "noul", instructions: "?" } }, { operation: "unit_test" })
    ).rejects.toThrow(`jev_rejected_${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats malformed answers as unavailability", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify(jevResponse({ q: { type: "noul", noul: "probably" } })),
      { status: 200 }
    )));
    await expect(
      askJev("state", { q: { type: "noul", instructions: "?" } }, { operation: "unit_test" })
    ).rejects.toThrow(/no usable noul probability/);
  });
});
