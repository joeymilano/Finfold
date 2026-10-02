import { describe, expect, it } from "vitest";
import { signHmacSHA256, verifyHmacSHA256 } from "@/lib/payment/hmac";

describe("payment webhook HMAC", () => {
  it("signs and verifies the exact payload without exposing the secret", async () => {
    const payload = JSON.stringify({ id: "evt_staging_fixture" });
    const signature = await signHmacSHA256(payload, "fixture-secret");

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    await expect(verifyHmacSHA256(payload, signature, "fixture-secret")).resolves.toBe(true);
    await expect(verifyHmacSHA256(`${payload} `, signature, "fixture-secret")).resolves.toBe(false);
  });
});
