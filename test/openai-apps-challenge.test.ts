import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/.well-known/openai-apps-challenge/route";

const previousChallenge = process.env.OPENAI_APPS_CHALLENGE_TOKEN;

afterEach(() => {
  if (previousChallenge === undefined) {
    delete process.env.OPENAI_APPS_CHALLENGE_TOKEN;
  } else {
    process.env.OPENAI_APPS_CHALLENGE_TOKEN = previousChallenge;
  }
});

describe("OpenAI app domain verification", () => {
  it("fails closed before the portal challenge is configured", async () => {
    delete process.env.OPENAI_APPS_CHALLENGE_TOKEN;

    const response = await GET();

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns only the exact configured challenge token", async () => {
    process.env.OPENAI_APPS_CHALLENGE_TOKEN = "  openai-domain-proof-123  ";

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("openai-domain-proof-123");
  });
});
