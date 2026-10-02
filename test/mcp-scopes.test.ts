import { describe, expect, it } from "vitest";
import {
  canAccessMcpTool,
  missingMcpToolScopes
} from "@/lib/mcp/scopes";

describe("MCP tool scopes", () => {
  it("requires both brand and rules access for combined brand context", () => {
    expect(
      canAccessMcpTool(
        ["brand:read", "rules:read"],
        "finfold_get_brand_context"
      )
    ).toBe(true);
    expect(
      missingMcpToolScopes(
        ["brand:read"],
        "finfold_get_brand_context"
      )
    ).toEqual(["rules:read"]);
  });

  it("allows rules-only tokens to read platform rules but not generate", () => {
    expect(
      canAccessMcpTool(["rules:read"], "finfold_get_platform_rules")
    ).toBe(true);
    expect(
      canAccessMcpTool(["rules:read"], "finfold_generate_content")
    ).toBe(false);
  });

  it("requires content:generate for generation", () => {
    expect(
      missingMcpToolScopes(
        ["brand:read", "rules:read"],
        "finfold_generate_content"
      )
    ).toEqual(["content:generate"]);
    expect(
      canAccessMcpTool(["content:generate"], "finfold_generate_content")
    ).toBe(true);
  });

  it("requires content:read to list or load saved content kits", () => {
    expect(
      canAccessMcpTool(["content:read"], "finfold_list_content_kits")
    ).toBe(true);
    expect(
      canAccessMcpTool(["content:read"], "finfold_get_content_kit")
    ).toBe(true);
    expect(
      missingMcpToolScopes(
        ["brand:read", "rules:read", "content:generate"],
        "finfold_list_content_kits"
      )
    ).toEqual(["content:read"]);
    expect(
      canAccessMcpTool(["brand:read", "rules:read", "content:generate"], "finfold_get_content_kit")
    ).toBe(false);
  });

  it("does not expose unknown tool names through authorization helpers", () => {
    expect(canAccessMcpTool(["content:generate"], "unknown_tool")).toBe(false);
    expect(missingMcpToolScopes(["content:generate"], "unknown_tool")).toEqual([]);
  });
});
