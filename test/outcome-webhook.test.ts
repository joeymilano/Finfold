import { describe, expect, it } from "vitest";
import { signHmacSHA256 } from "@/lib/payment/hmac";
import {
  createOutcomeWebhookSecret,
  hashOutcomeWebhookValue,
  outcomeWebhookEventSchema,
  outcomeWebhookSecretPrefix,
  toOutcomeWebhookDeliverySummary,
  validateOutcomeOccurrence,
  validateOutcomeWebhookTimestamp,
  verifyOutcomeWebhookSignature
} from "@/lib/outcome-webhook";

describe("outcome webhook contract", () => {
  it("accepts only bounded business outcomes linked to a mission or tracking code", () => {
    expect(outcomeWebhookEventSchema.safeParse({
      eventId: "lead_00000001",
      type: "lead",
      trackingCode: "abc123def456",
      source: "website-form",
      count: 1
    }).success).toBe(true);
    expect(outcomeWebhookEventSchema.safeParse({
      eventId: "revenue_00000001",
      type: "revenue",
      missionId: "22222222-2222-4222-8222-222222222222",
      source: "payment",
      value: 199,
      currency: "cny"
    }).success).toBe(true);
    expect(outcomeWebhookEventSchema.safeParse({
      eventId: "lead_00000001",
      type: "lead",
      source: "website-form"
    }).success).toBe(false);
    expect(outcomeWebhookEventSchema.safeParse({
      eventId: "lead_00000001",
      type: "lead",
      trackingCode: "abc123def456",
      value: 99
    }).success).toBe(false);
  });

  it("signs the timestamp and exact raw JSON and rejects changed bodies", async () => {
    const timestamp = "1787500000";
    const secret = "ff_out_fixture-secret";
    const raw = new TextEncoder().encode('{"eventId":"lead_00000001"}');
    const signature = await signHmacSHA256(`${timestamp}.${new TextDecoder().decode(raw)}`, secret);

    await expect(verifyOutcomeWebhookSignature(raw, timestamp, `v1=${signature}`, secret)).resolves.toBe(true);
    await expect(verifyOutcomeWebhookSignature(
      new TextEncoder().encode('{"eventId":"lead_00000002"}'),
      timestamp,
      `v1=${signature}`,
      secret
    )).resolves.toBe(false);
  });

  it("enforces a five-minute replay window", () => {
    const now = Date.UTC(2026, 7, 24, 12, 0, 0);
    expect(validateOutcomeWebhookTimestamp(String(Math.floor(now / 1000)), now)).toBe("valid");
    expect(validateOutcomeWebhookTimestamp(String(Math.floor(now / 1000) - 301), now)).toBe("expired");
    expect(validateOutcomeWebhookTimestamp("not-a-time", now)).toBe("missing");
  });

  it("hashes external identifiers instead of storing their original value", async () => {
    const hash = await hashOutcomeWebhookValue("customer@example.com");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("customer");
  });

  it("creates one-time tenant secrets with a safe display prefix", () => {
    const secret = createOutcomeWebhookSecret();
    expect(secret).toMatch(/^ff_out_[a-f0-9]{64}$/);
    expect(outcomeWebhookSecretPrefix(secret)).toBe(secret.slice(0, 15));
  });

  it("rejects implausible occurrence times without turning them into current data", () => {
    const now = Date.UTC(2026, 7, 24, 12, 0, 0);
    expect(validateOutcomeOccurrence("2026-08-24T11:59:00.000Z", now)).toBe("2026-08-24T11:59:00.000Z");
    expect(() => validateOutcomeOccurrence("2025-01-01T00:00:00.000Z", now)).toThrow("366 days");
    expect(() => validateOutcomeOccurrence("2026-08-24T12:06:00.000Z", now)).toThrow("five minutes");
  });

  it("fails closed instead of presenting an unknown receipt as successful revenue", () => {
    expect(() => toOutcomeWebhookDeliverySummary({
      id: "11111111-1111-4111-8111-111111111111",
      status: "unexpected",
      event_type: "other"
    })).toThrow("unsupported event type");
  });
});
