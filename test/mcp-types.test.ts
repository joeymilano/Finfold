import { describe, expect, it } from "vitest";
import { mcpGenerateInputSchema, mcpPlatformRulesInputSchema } from "@/lib/mcp/types";

describe("Finfold MCP tool schemas", () => {
  it("applies safe generation defaults", () => {
    const input = mcpGenerateInputSchema.parse({ brief: "We shipped a new collaborative analytics dashboard for founders today." });
    expect(input.goal).toBe("product-launch");
    expect(input.persona).toBe("indie-builder");
    expect(input.platforms).toEqual(["x", "linkedin"]);
  });

  it("rejects invalid MCP platform arguments", () => {
    expect(() => mcpPlatformRulesInputSchema.parse({ platforms: ["myspace"] })).toThrow();
    expect(() => mcpGenerateInputSchema.parse({ brief: "too short" })).toThrow();
  });

  it("accepts an attachment-only generation request", () => {
    const input = mcpGenerateInputSchema.parse({
      attachments: [{
        name: "products.json",
        mimeType: "application/json",
        dataBase64: "e30="
      }]
    });
    expect(input.brief).toBe("");
    expect(input.attachments).toHaveLength(1);
  });

  it("requires exactly one MCP attachment transport", () => {
    expect(() => mcpGenerateInputSchema.parse({
      attachments: [{ name: "products.json", mimeType: "application/json" }]
    })).toThrow();
    expect(() => mcpGenerateInputSchema.parse({
      attachments: [{
        name: "products.json",
        mimeType: "application/json",
        url: "https://cdn.example/products.json",
        dataBase64: "e30="
      }]
    })).toThrow();
  });
});
