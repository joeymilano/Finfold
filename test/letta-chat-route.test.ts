import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/letta/chat/route";

describe("legacy Letta chat endpoint", () => {
  it("is retired so it cannot invoke an unbilled model call", async () => {
    const response = await POST(new Request("https://www.finfold.app/api/letta/chat", { method: "POST" }));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: "This legacy AI chat endpoint has been retired. Use /api/agent/chat."
    });
  });
});