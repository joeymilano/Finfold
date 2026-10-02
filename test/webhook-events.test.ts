import { describe, expect, it } from "vitest";
import {
  decideWebhookClaim,
  hashWebhookPayload,
  type WebhookEventRecord
} from "@/lib/payment/webhook-events";

function event(
  patch: Partial<WebhookEventRecord> = {}
): WebhookEventRecord {
  return {
    id: "evt_123",
    event_type: "subscription.paid",
    status: "processing",
    attempt_count: 1,
    payload_hash: "hash-a",
    processing_started_at: "2026-07-29T10:00:00.000Z",
    ...patch
  };
}

describe("recoverable webhook event inbox", () => {
  it("acknowledges only events that already succeeded", () => {
    expect(
      decideWebhookClaim(
        event({ status: "succeeded" }),
        { eventType: "subscription.paid", payloadHash: "hash-a" }
      )
    ).toBe("duplicate");
  });

  it("retries events whose previous processing failed", () => {
    expect(
      decideWebhookClaim(
        event({ status: "failed" }),
        { eventType: "subscription.paid", payloadHash: "hash-a" }
      )
    ).toBe("retry");
  });

  it("does not run a fresh in-flight delivery concurrently", () => {
    expect(
      decideWebhookClaim(
        event(),
        { eventType: "subscription.paid", payloadHash: "hash-a" },
        Date.parse("2026-07-29T10:01:00.000Z")
      )
    ).toBe("busy");
  });

  it("reclaims processing events that have been stuck for five minutes", () => {
    expect(
      decideWebhookClaim(
        event(),
        { eventType: "subscription.paid", payloadHash: "hash-a" },
        Date.parse("2026-07-29T10:05:00.000Z")
      )
    ).toBe("retry");
  });

  it("rejects reuse of an event id with different signed content", () => {
    expect(
      decideWebhookClaim(
        event(),
        { eventType: "subscription.paid", payloadHash: "hash-b" }
      )
    ).toBe("conflict");
    expect(
      decideWebhookClaim(
        event(),
        { eventType: "subscription.canceled", payloadHash: "hash-a" }
      )
    ).toBe("conflict");
  });

  it("hashes payloads deterministically without storing raw payment data", async () => {
    const first = await hashWebhookPayload('{"id":"evt_123"}');
    const same = await hashWebhookPayload('{"id":"evt_123"}');
    const different = await hashWebhookPayload('{"id":"evt_456"}');

    expect(first).toHaveLength(64);
    expect(same).toBe(first);
    expect(different).not.toBe(first);
  });
});
