import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  retrieveTransaction: vi.fn()
}));

vi.mock("@/lib/payment/creem-management", () => ({
  retrieveCreemTransaction: mocks.retrieveTransaction
}));

import {
  readNativeVisitorId,
  recordCreemRevenueOutcome,
  recordNativeSignupOutcome,
  validatePaidCreemTransaction
} from "@/lib/native-outcome-attribution";

function adminWithAttribution(attributed: boolean) {
  const maybeSingle = vi.fn(async () => ({
    data: attributed ? { subject_user_id: "0f4f4b36-1348-4e26-9d62-74d24bfa84ad" } : null,
    error: null
  }));
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle
  };
  return {
    from: vi.fn(() => query),
    rpc: vi.fn(async () => ({
      data: {
        attributed: true,
        replayed: false,
        missionId: "50b2ab5b-bc5d-42aa-8403-7e0192415cff",
        actualValue: 1
      },
      error: null
    }))
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("native business outcome attribution", () => {
  it("accepts only the first-party UUID tracking cookie", () => {
    expect(readNativeVisitorId(new Request("https://www.finfold.app", {
      headers: { cookie: "theme=dark; finfold_visitor_id=F9E2F2AE-ED69-4DA9-9DD0-89ABF89CE530" }
    }))).toBe("f9e2f2ae-ed69-4da9-9dd0-89abf89ce530");
    expect(readNativeVisitorId(new Request("https://www.finfold.app", {
      headers: { cookie: "finfold_visitor_id=not-a-uuid" }
    }))).toBeNull();
  });

  it("records a signup without sending raw account identity into the outcome metadata", async () => {
    const admin = adminWithAttribution(false);
    const request = new Request("https://www.finfold.app/api/auth/signup", {
      headers: { cookie: "finfold_visitor_id=f9e2f2ae-ed69-4da9-9dd0-89abf89ce530" }
    });

    await recordNativeSignupOutcome(admin as never, {
      request,
      subjectUserId: "0f4f4b36-1348-4e26-9d62-74d24bfa84ad",
      occurredAt: "2026-08-26T10:00:00.000Z"
    });

    expect(admin.rpc).toHaveBeenCalledWith("ingest_native_attributed_outcome", {
      p_subject_user_id: "0f4f4b36-1348-4e26-9d62-74d24bfa84ad",
      p_visitor_id: "f9e2f2ae-ed69-4da9-9dd0-89abf89ce530",
      p_event_type: "signup",
      p_provider_event_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_external_ref_hash: null,
      p_value: 0,
      p_currency: "XXX",
      p_occurred_at: "2026-08-26T10:00:00.000Z"
    });
  });

  it("does not call Creem for a user who has no attributed signup", async () => {
    const admin = adminWithAttribution(false);

    await expect(recordCreemRevenueOutcome(admin as never, {
      subjectUserId: "0f4f4b36-1348-4e26-9d62-74d24bfa84ad",
      providerEventId: "evt_paid_123",
      transactionId: "txn_123"
    })).resolves.toEqual({ attributed: false, reason: "no_signup_attribution" });

    expect(mocks.retrieveTransaction).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("uses Creem's paid amount and currency for an attributed revenue event", async () => {
    const admin = adminWithAttribution(true);
    mocks.retrieveTransaction.mockResolvedValue({
      id: "txn_123",
      status: "paid",
      amount_paid: 1299,
      currency: "usd",
      subscription: "sub_123"
    });

    await recordCreemRevenueOutcome(admin as never, {
      subjectUserId: "0f4f4b36-1348-4e26-9d62-74d24bfa84ad",
      providerEventId: "evt_paid_123",
      transactionId: "txn_123",
      subscriptionId: "sub_123",
      occurredAt: "2026-08-26T10:05:00.000Z"
    });

    expect(mocks.retrieveTransaction).toHaveBeenCalledWith("txn_123");
    expect(admin.rpc).toHaveBeenCalledWith("ingest_native_attributed_outcome", expect.objectContaining({
      p_event_type: "revenue",
      p_value: 12.99,
      p_currency: "USD",
      p_provider_event_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_external_ref_hash: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
  });

  it("rejects an unverified or mismatched provider transaction", () => {
    expect(() => validatePaidCreemTransaction({
      id: "txn_123",
      status: "pending",
      amount_paid: 1299,
      currency: "USD"
    }, { transactionId: "txn_123" })).toThrow("not in paid status");

    expect(() => validatePaidCreemTransaction({
      id: "txn_other",
      status: "paid",
      amount_paid: 1299,
      currency: "USD"
    }, { transactionId: "txn_123" })).toThrow("different transaction");
  });

  it("acknowledges a genuine zero-value payment without inventing revenue", async () => {
    const admin = adminWithAttribution(true);
    mocks.retrieveTransaction.mockResolvedValue({
      id: "txn_zero",
      status: "paid",
      amount_paid: 0,
      currency: "USD",
      subscription: "sub_123"
    });

    await expect(recordCreemRevenueOutcome(admin as never, {
      subjectUserId: "0f4f4b36-1348-4e26-9d62-74d24bfa84ad",
      providerEventId: "evt_zero",
      transactionId: "txn_zero",
      subscriptionId: "sub_123"
    })).resolves.toEqual({ attributed: false, reason: "no_positive_revenue" });
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
