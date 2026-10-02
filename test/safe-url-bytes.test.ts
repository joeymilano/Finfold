import { describe, expect, it } from "vitest";
import { readBytesWithLimit } from "@/lib/safe-url";

describe("readBytesWithLimit", () => {
  it("reads a bounded binary response", async () => {
    const result = await readBytesWithLimit(new Response(new Uint8Array([1, 2, 3])), 10);
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });

  it("rejects an oversized declared response before reading it", async () => {
    const response = new Response(new Uint8Array([1]), { headers: { "content-length": "20" } });
    await expect(readBytesWithLimit(response, 10)).rejects.toThrow("too large");
  });

  it("rejects a streamed response that crosses the limit", async () => {
    const response = new Response(new Uint8Array([1, 2, 3, 4]));
    await expect(readBytesWithLimit(response, 3)).rejects.toThrow("too large");
  });
});
