import { afterEach, describe, expect, it } from "vitest";
import { createClaimReceipt, verifyClaimReceipt } from "@/lib/extension/crypto";
import { isAllowedExtensionOrigin } from "@/lib/extension/cors";
import { evaluateRequestSecurity } from "@/lib/security";

const originalOrigins = process.env.FINFOLD_EXTENSION_ORIGINS;
const originalSecret = process.env.EXTENSION_SIGNING_SECRET;
const allowed = `chrome-extension://${"a".repeat(32)}`;

afterEach(() => {
  process.env.FINFOLD_EXTENSION_ORIGINS = originalOrigins;
  process.env.EXTENSION_SIGNING_SECRET = originalSecret;
});

describe("extension origin and claim boundaries", () => {
  it("allows only an exact configured Chrome extension origin", () => {
    process.env.FINFOLD_EXTENSION_ORIGINS = allowed;
    expect(isAllowedExtensionOrigin(allowed)).toBe(true);
    expect(isAllowedExtensionOrigin(`chrome-extension://${"b".repeat(32)}`)).toBe(false);
    expect(isAllowedExtensionOrigin("https://www.finfold.app")).toBe(false);

    expect(evaluateRequestSecurity(new Request("https://www.finfold.app/api/extension/v1/actions", {
      method: "POST",
      headers: { origin: allowed }
    }))).toEqual({ allowed: true });
    expect(evaluateRequestSecurity(new Request("https://www.finfold.app/api/extension/v1/actions", {
      method: "POST",
      headers: { origin: `chrome-extension://${"b".repeat(32)}` }
    }))).toMatchObject({ allowed: false, status: 403 });
  });

  it("binds a short-lived claim receipt to the exact generated result", async () => {
    process.env.EXTENSION_SIGNING_SECRET = "test-extension-secret-that-is-long-enough-12345";
    const result = {
      platform: "x" as const,
      title: "A specific title",
      body: "A complete body that remains available to the user.",
      cta: "What would you change?",
      notes: "Grounded in the source.",
      strategy: "Lead with the strongest insight."
    };
    const receipt = await createClaimReceipt({
      actionId: "11111111-1111-4111-8111-111111111111",
      result,
      expiresAt: new Date(Date.now() + 30_000)
    });
    expect((await verifyClaimReceipt(receipt))?.platform).toBe("x");
    expect(await verifyClaimReceipt(`${receipt.slice(0, -1)}x`)).toBeNull();
  });
});
