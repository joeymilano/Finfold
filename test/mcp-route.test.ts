import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  generate: vi.fn()
}));

vi.mock("@/lib/mcp/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mcp/auth")>();
  return {
    ...actual,
    authenticateMcpRequest: mocks.authenticate
  };
});

vi.mock("@/lib/mcp/service", () => ({
  generateMcpKit: mocks.generate,
  getMcpBrandContext: vi.fn(),
  getMcpPlatformRules: vi.fn()
}));

import { GET, POST } from "@/app/api/mcp/route";

describe("Finfold MCP endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue(null);
  });
  it("rejects GET because this stateless server does not offer an SSE stream", async () => {
    const response = await GET();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("returns a JSON-RPC authentication error before exposing workspace tools", async () => {
    const response = await POST(new Request("https://www.finfold.app/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    }));
    const body = await response.json();
    expect(body).toMatchObject({ jsonrpc: "2.0", id: 1, error: { code: -32001 } });
  });

  it("rejects unsupported protocol-version headers", async () => {
    const response = await POST(new Request("https://www.finfold.app/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", "mcp-protocol-version": "1900-01-01" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    }));
    expect(response.status).toBe(400);
  });

  it("blocks browser origins other than Finfold itself", async () => {
    const response = await POST(new Request("https://www.finfold.app/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    }));
    expect(response.status).toBe(403);
  });

  it("advertises real URL/Base64 attachments on the generation tool", async () => {
    mocks.authenticate.mockResolvedValue({
      id: "4d5b8bdf-3d86-4966-a951-3590b042e627",
      user_id: "f7c08e55-3e0c-44d9-a0e3-718b3a9a798a",
      scopes: ["content:generate"]
    });
    const response = await POST(new Request("https://www.finfold.app/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    }));
    const body = await response.json();
    const tool = body.result.tools.find((candidate: { name: string }) => candidate.name === "finfold_generate_content");

    expect(tool.description).toContain("actually reads supported file contents");
    expect(tool.inputSchema.required).toBeUndefined();
    expect(tool.inputSchema.properties.attachments.maxItems).toBe(6);
    expect(tool.inputSchema.properties.attachments.items.properties).toHaveProperty("url");
    expect(tool.inputSchema.properties.attachments.items.properties).toHaveProperty("dataBase64");
  });

  it("requires an idempotency key before a content generation can reach the model service", async () => {
    mocks.authenticate.mockResolvedValue({
      id: "4d5b8bdf-3d86-4966-a951-3590b042e627",
      user_id: "f7c08e55-3e0c-44d9-a0e3-718b3a9a798a",
      scopes: ["content:generate"]
    });
    const response = await POST(new Request("https://www.finfold.app/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "finfold_generate_content", arguments: { brief: "A sufficiently detailed release update for the next launch." } }
      })
    }));

    const body = await response.json();
    expect(body.result.content[0].text).toContain("Idempotency-Key");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
