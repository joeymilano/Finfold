import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signSourceImageSelection, verifySourceImageSelection } from "@/lib/source-image-token";

const userId = "1f34c0d0-3124-4ca7-b352-da298139cb74";
const otherUserId = "9cc86165-4795-4e78-ac2e-692f51fdbba7";
let priorKey: string | undefined;

describe("source image selection tokens", () => {
  beforeEach(() => {
    priorKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });
  afterEach(() => {
    if (priorKey === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
    else process.env.INTEGRATION_ENCRYPTION_KEY = priorKey;
  });

  it("binds the selected URL to the user and expires after ten minutes", async () => {
    const token = await signSourceImageSelection({
      userId,
      imageUrl: "https://openai.com/astra.jpg",
      pageUrl: "https://openai.com/index/astra/",
      provider: "official_page",
      domain: "openai.com",
      width: 1600,
      height: 900,
      confidence: "high",
      score: 128
    }, 1_000);
    await expect(verifySourceImageSelection(token, userId, 600_999)).resolves.toMatchObject({ imageUrl: "https://openai.com/astra.jpg" });
    await expect(verifySourceImageSelection(token, otherUserId, 2_000)).rejects.toThrow("another account");
    await expect(verifySourceImageSelection(token, userId, 601_001)).rejects.toThrow("expired");
  });

  it("rejects a modified payload", async () => {
    const token = await signSourceImageSelection({
      userId,
      imageUrl: "https://openai.com/astra.jpg",
      pageUrl: "https://openai.com/index/astra/",
      provider: "official_page",
      domain: "openai.com",
      width: 1600,
      height: 900,
      confidence: "high",
      score: 128
    });
    await expect(verifySourceImageSelection(`x${token.slice(1)}`, userId)).rejects.toThrow("Invalid");
  });
});
