import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKitOutputs, sendRawPrompt } from "@/lib/llm";
import { sendLettaStructuredRequest } from "@/lib/letta";
import type { GenerateRequest } from "@/lib/content-schema";

const request: GenerateRequest = {
  ideaText: "Launch OS helps B2B AI teams turn product updates into platform-native launch content with stronger hooks and clearer positioning.",
  goal: "lead-gen",
  persona: "ai-saas",
  platforms: ["linkedin"],
  mediaAssets: [],
  language: "en"
};

const originalEnv = {
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_API_BASE: process.env.LLM_API_BASE,
  LLM_MODEL: process.env.LLM_MODEL,
  LLM_MODEL_SONNET: process.env.LLM_MODEL_SONNET,
  LLM_PROVIDERS: process.env.LLM_PROVIDERS,
  LETTA_API_KEY: process.env.LETTA_API_KEY,
  ALLOW_MOCK: process.env.ALLOW_MOCK,
  HUMAN_WRITING_ENABLED: process.env.HUMAN_WRITING_ENABLED
};

function restore(key: keyof typeof originalEnv) {
  const value = originalEnv[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  (Object.keys(originalEnv) as Array<keyof typeof originalEnv>).forEach(restore);
});

describe("llm configuration", () => {
  it("fails loudly when neither Letta nor a direct LLM is configured", async () => {
    delete process.env.LLM_API_KEY;
    delete process.env.LETTA_API_KEY;
    process.env.ALLOW_MOCK = "true";

    await expect(generateKitOutputs(request)).rejects.toThrow(
      "AI generation is not configured"
    );
  });

  it("does NOT treat a Letta-pointed LLM_API_BASE as a usable direct LLM endpoint", async () => {
    // Regression: api.letta.com has no agent-less /chat/completions endpoint,
    // so a Letta base must never be used for the direct path even with a key.
    // With no Letta key either, generation must fail to configure rather than
    // POST to the broken endpoint.
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.letta.com/v1";
    delete process.env.LETTA_API_KEY;
    process.env.ALLOW_MOCK = "true";

    await expect(generateKitOutputs(request)).rejects.toThrow(
      "AI generation is not configured"
    );
  });

  it("does not send untrusted partner content to a persistent Letta agent", async () => {
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_PROVIDERS;
    process.env.LETTA_API_KEY = "letta-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(generateKitOutputs(request, {
      lettaAgentId: "agent-user",
      allowPersistentAgentFallback: false
    })).rejects.toThrow("Secure external-content generation requires LLM_API_KEY");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("routes the direct LLM path to the model configured for the requested tier", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    process.env.LLM_MODEL = "base-model";
    process.env.LLM_MODEL_SONNET = "sonnet-model";
    delete process.env.LETTA_API_KEY;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  outputs: [
                    {
                      platform: "linkedin",
                      title: "t",
                      body: "b",
                      cta: "c",
                      notes: "n",
                      strategy: "s"
                    }
                  ]
                })
              }
            }
          ]
        }),
        { status: 200 }
      )
    );

    await generateKitOutputs(request, { modelTier: "sonnet" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.model).toBe("sonnet-model");

    fetchSpy.mockRestore();
  });

  it("routes a raw prompt to its requested model tier", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    process.env.LLM_MODEL = "base-model";
    process.env.LLM_MODEL_SONNET = "sonnet-model";
    delete process.env.LETTA_API_KEY;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "edited copy" } }] }),
        { status: 200 }
      )
    );

    await expect(sendRawPrompt("Rewrite this", {
      modelTier: "sonnet",
      operation: "human_writing_rewrite",
      promptVersion: "human-writing-test"
    })).resolves.toBe("edited copy");

    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.model).toBe("sonnet-model");

    fetchSpy.mockRestore();
  });

  it("falls back to the shared Letta agent when the direct LLM path fails", async () => {
    // Symmetric failover: path 2 (direct LLM) must degrade to path 3 (shared
    // Letta agent) instead of becoming a total failure — the logged-in path
    // already fails over Letta → direct LLM inside generateViaLetta.
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    process.env.LLM_MODEL = "base-model";
    process.env.LETTA_API_KEY = "letta-key";

    const lettaPayload = {
      outputs: [{ platform: "linkedin", title: "t", body: "b", cta: "c", notes: "n", strategy: "s" }]
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("api.example.com")) {
        return new Response("provider down", { status: 500 });
      }
      if (url.includes("/v1/agents") && !url.includes("/messages")) {
        return new Response(
          JSON.stringify([{ id: "agent-shared", name: "finfold-shared-generator" }]),
          { status: 200 }
        );
      }
      if (url.includes("/v1/agents/agent-shared/messages")) {
        return new Response(
          JSON.stringify({
            messages: [
              {
                id: "m1",
                role: "assistant",
                date: new Date().toISOString(),
                message_type: "assistant_message",
                content: JSON.stringify(lettaPayload)
              }
            ]
          }),
          { status: 200 }
        );
      }
      return new Response("unexpected", { status: 404 });
    });

    const outputs = await generateKitOutputs(request);

    expect(outputs).toHaveLength(1);
    expect(outputs[0].platform).toBe("linkedin");
    expect(
      fetchSpy.mock.calls.some(([input]) => String(input).includes("/v1/agents/agent-shared/messages"))
    ).toBe(true);

    fetchSpy.mockRestore();
  });

  it("strips provider-controlled persistence fields before direct outputs are streamed", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    process.env.LLM_MODEL = "base-model";
    delete process.env.LLM_PROVIDERS;
    delete process.env.LETTA_API_KEY;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  outputs: [
                    {
                      platform: "linkedin",
                      title: "A safer launch workflow",
                      body: "Start with the product change and adapt it for the audience.",
                      cta: "Try it with your next release.",
                      notes: "Open with the change.",
                      strategy: "Lead with a concrete workflow.",
                      finalBody: "We cut launch work by 90% in 2 hours.",
                      userEdited: true,
                      id: "provider-controlled-id",
                      publishedAt: "2026-08-01T00:00:00.000Z"
                    }
                  ]
                })
              }
            }
          ]
        }),
        { status: 200 }
      )
    );
    const onOutput = vi.fn();

    const outputs = await generateKitOutputs(request, { onOutput });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]).not.toHaveProperty("finalBody");
    expect(outputs[0]).not.toHaveProperty("id");
    expect(outputs[0]).not.toHaveProperty("publishedAt");
    expect(outputs[0]).toMatchObject({
      userEdited: false,
      locked: false,
      publishStatus: "draft"
    });
    expect(onOutput).toHaveBeenCalledTimes(1);
    expect(onOutput.mock.calls[0][0]).not.toHaveProperty("finalBody");
  });

  it("normalizes Markdown emphasis before direct outputs are streamed or returned", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    process.env.LLM_MODEL = "base-model";
    delete process.env.LLM_PROVIDERS;
    delete process.env.LETTA_API_KEY;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  outputs: [
                    {
                      platform: "linkedin",
                      title: "**A clearer launch workflow**",
                      body: "**Start with the product change.** Then explain who it affects.",
                      cta: "**Try it with your next release.**",
                      notes: "Open with the change.",
                      strategy: "Lead with a concrete workflow."
                    }
                  ]
                })
              }
            }
          ]
        }),
        { status: 200 }
      )
    );
    const onOutput = vi.fn();

    const outputs = await generateKitOutputs(request, { onOutput });

    expect(outputs[0]).toMatchObject({
      title: "A clearer launch workflow",
      body: "Start with the product change. Then explain who it affects.",
      cta: "Try it with your next release."
    });
    expect(onOutput.mock.calls[0][0]).toMatchObject(outputs[0]);
  });

  it("rewrites only flagged copy before streaming the final output", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    process.env.LLM_MODEL = "base-model";
    delete process.env.LLM_PROVIDERS;
    delete process.env.LETTA_API_KEY;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          outputs: [{
            platform: "linkedin",
            title: "A launch update",
            body: "In today's fast-paced world, seamless collaboration unlocks better launches.",
            cta: "Read the update",
            notes: "Open with the release.",
            strategy: "Lead with the change."
          }]
        }) } }]
      }), { status: 200 })
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          title: "A launch update",
          body: "We moved review before publish, so the release owner sees the blocked field before customers do.",
          cta: "Read the update"
        }) } }]
      }), { status: 200 })
    );
    const onOutput = vi.fn();

    const outputs = await generateKitOutputs(request, { onOutput });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(outputs[0].body).toContain("We moved review before publish");
    expect(outputs[0].body).not.toContain("fast-paced world");
    expect(onOutput.mock.calls[0][0].body).toBe(outputs[0].body);
  });

  it("falls back to the normalized original when a rewrite introduces an unsupported number", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    process.env.LLM_MODEL = "base-model";
    delete process.env.LLM_PROVIDERS;
    delete process.env.LETTA_API_KEY;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          outputs: [{
            platform: "linkedin",
            title: "A launch update",
            body: "In today's fast-paced world, we ship updates with the release owner in the loop.",
            cta: "Read the update",
            notes: "Open with the release.",
            strategy: "Lead with the change."
          }]
        }) } }]
      }), { status: 200 })
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          title: "A launch update",
          body: "We improved launch speed by 90%.",
          cta: "Read the update"
        }) } }]
      }), { status: 200 })
    );

    const outputs = await generateKitOutputs(request);

    expect(outputs[0].body).toContain("In today's fast-paced world");
    expect(outputs[0].body).not.toContain("90%");
  });

  it("can disable only the automatic rewrite path during an incident", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    process.env.LLM_MODEL = "base-model";
    process.env.HUMAN_WRITING_ENABLED = "false";
    delete process.env.LLM_PROVIDERS;
    delete process.env.LETTA_API_KEY;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          outputs: [{
            platform: "linkedin",
            title: "**A launch update**",
            body: "In today's fast-paced world, we ship updates with the release owner in the loop.",
            cta: "Read the update",
            notes: "Open with the release.",
            strategy: "Lead with the change."
          }]
        }) } }]
      }), { status: 200 })
    );

    const outputs = await generateKitOutputs(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(outputs[0].title).toBe("A launch update");
    expect(outputs[0].body).toContain("In today's fast-paced world");
  });

  it("strips provider-controlled persistence fields on the per-user Letta path", async () => {
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_PROVIDERS;
    process.env.LETTA_API_KEY = "letta-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [
            {
              id: "m1",
              role: "assistant",
              date: new Date().toISOString(),
              message_type: "assistant_message",
              content: JSON.stringify({
                outputs: [
                  {
                    platform: "linkedin",
                    title: "A safer launch workflow",
                    body: "Start with the product change and adapt it for the audience.",
                    cta: "Try it with your next release.",
                    notes: "Open with the change.",
                    strategy: "Lead with a concrete workflow.",
                    finalBody: "Trusted by 1M customers after 2 weeks.",
                    userEdited: true
                  }
                ]
              })
            }
          ]
        }),
        { status: 200 }
      )
    );
    const onOutput = vi.fn();

    const outputs = await generateKitOutputs(request, {
      lettaAgentId: "agent-user",
      onOutput
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]).not.toHaveProperty("finalBody");
    expect(outputs[0].userEdited).toBe(false);
    expect(onOutput).toHaveBeenCalledTimes(1);
    expect(onOutput.mock.calls[0][0]).not.toHaveProperty("finalBody");
  });

  it("bounds and redacts Letta non-2xx response bodies", async () => {
    process.env.LETTA_API_KEY = "letta-key";
    const privateProviderBody = `private-prompt:${"x".repeat(20_000)}`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(privateProviderBody, { status: 503 })
    );

    const error = await sendLettaStructuredRequest(
      "agent-user",
      "private user prompt"
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Letta request failed: 503");
    expect((error as Error).message).not.toContain("private-prompt");
  });
});
