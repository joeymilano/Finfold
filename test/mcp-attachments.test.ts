import { describe, expect, it } from "vitest";
import { resolveMcpAttachments } from "@/lib/mcp/attachments";

describe("MCP attachment ingestion", () => {
  it("parses inline JSON into grounded attachment context", async () => {
    const result = await resolveMcpAttachments([{
      name: "products.json",
      mimeType: "application/json",
      dataBase64: toBase64('{"product":"Finfold","market":"global teams"}')
    }]);

    expect(result.names).toEqual(["products.json"]);
    expect(result.context).toContain('"product": "Finfold"');
    expect(result.context).toContain("untrusted user-supplied source material");
    expect(result.mediaAssets).toEqual([]);
  });

  it("rejects an extension and byte-signature mismatch", async () => {
    await expect(resolveMcpAttachments([{
      name: "fake.pdf",
      mimeType: "application/pdf",
      dataBase64: toBase64("not a pdf")
    }])).rejects.toThrow("does not match its declared file type");
  });

  it("wraps validated inline video bytes in a Qwen-compatible data URL", async () => {
    const bytes = new Uint8Array(12);
    bytes.set(new TextEncoder().encode("ftyp"), 4);
    const dataBase64 = toBase64Bytes(bytes);

    const result = await resolveMcpAttachments([{
      name: "demo.mp4",
      mimeType: "video/mp4",
      dataBase64
    }]);

    expect(result.mediaAssets).toEqual([expect.objectContaining({
      name: "demo.mp4",
      type: "video",
      url: `data:video/mp4;base64,${dataBase64}`
    })]);
    expect(result.context).toContain("Attached separately as model-visible media");
  });
});

function toBase64(value: string): string {
  return btoa(value);
}

function toBase64Bytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
