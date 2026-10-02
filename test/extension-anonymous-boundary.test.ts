import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  reserve: vi.fn()
}));

vi.mock("@/lib/extension/generation", () => ({ generateExtensionResults: mocks.generate }));
vi.mock("@/lib/extension/usage", () => ({
  anonymousFeatureEnabled: () => true,
  reserveAnonymousAction: mocks.reserve,
  requestIp: () => "203.0.113.4",
  completeAnonymousAction: vi.fn(),
  failAnonymousAction: vi.fn()
}));

import { POST } from "@/app/api/extension/v1/anonymous-actions/route";

const origin = `chrome-extension://${"a".repeat(32)}`;
const body = {
  requestId: "11111111-1111-4111-8111-111111111111",
  installationId: "22222222-2222-4222-8222-222222222222",
  action: "repurpose",
  platform: "x",
  language: "auto",
  page: {
    url: "https://example.com/article",
    title: "Example article",
    siteName: "Example",
    description: "",
    language: "en",
    text: "Enough trustworthy source text to create a useful result.",
    selectionUsed: false
  }
};

beforeEach(() => {
  process.env.FINFOLD_EXTENSION_ORIGINS = origin;
  mocks.generate.mockReset();
  mocks.reserve.mockReset();
});

describe("anonymous generation boundary", () => {
  it("rejects a second installation request before the model is called", async () => {
    mocks.reserve.mockResolvedValue({ outcome: "installation_limit" });
    const response = await POST(new Request("https://www.finfold.app/api/extension/v1/anonymous-actions", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body)
    }));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: { code: "INSTALLATION_LIMIT_REACHED" } });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("rejects an unapproved extension origin before reserving usage", async () => {
    const response = await POST(new Request("https://www.finfold.app/api/extension/v1/anonymous-actions", {
      method: "POST",
      headers: { origin: `chrome-extension://${"b".repeat(32)}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    }));
    expect(response.status).toBe(403);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
