import { afterEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hasValidIntegrationEncryptionKey,
  isEncryptedSecret
} from "@/lib/secret-encryption";

const originalKey = process.env.INTEGRATION_ENCRYPTION_KEY;

afterEach(() => {
  process.env.INTEGRATION_ENCRYPTION_KEY = originalKey;
});

describe("integration secret encryption", () => {
  it("round-trips an AES-GCM encrypted value", async () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    const encrypted = await encryptSecret("secret-token-value");
    expect(isEncryptedSecret(encrypted)).toBe(true);
    expect(encrypted).not.toContain("secret-token-value");
    await expect(decryptSecret(encrypted)).resolves.toBe("secret-token-value");
  });

  it("reads legacy plaintext values for migration compatibility", async () => {
    await expect(decryptSecret("legacy-token")).resolves.toBe("legacy-token");
  });

  it("validates the production key shape without exposing its value", () => {
    expect(hasValidIntegrationEncryptionKey("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")).toBe(true);
    expect(hasValidIntegrationEncryptionKey("dG9vLXNob3J0")).toBe(false);
    expect(hasValidIntegrationEncryptionKey("not base64%%%" )).toBe(false);
  });
});
