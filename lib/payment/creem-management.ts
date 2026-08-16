// Creem subscription management API calls — Edge-compatible via fetch.
// Docs: https://docs.creem.io/api-reference
//
// Creem has NO public refund endpoint — refunds are issued from the
// merchant dashboard. This module covers the two calls the in-app
// self-service refund flow actually needs:
//   1. retrieveCreemSubscription — verify the 3-day window against
//      Creem's authoritative charge date and capture order/amount.
//   2. cancelCreemSubscription   — stop the next renewal so a refunding
//      user isn't charged again next month.

function getBaseUrl(): string {
  const apiKey = process.env.CREEM_API_KEY ?? "";
  // creem_test_ keys target the sandbox environment
  return apiKey.startsWith("creem_test_")
    ? "https://test-api.creem.io/v1"
    : "https://api.creem.io/v1";
}

function getApiKey(): string {
  return process.env.CREEM_API_KEY ?? "";
}

export type CreemTransaction = {
  id?: string;
  amount?: number;
  currency?: string;
  amount_paid?: number;
  refunded_amount?: number;
  order?: string;
  created_at?: number;
};

/** The subset of the Creem subscription object the refund flow reads. */
export type CreemSubscriptionFull = {
  id: string;
  status?: string;
  last_transaction_date?: string;
  current_period_start_date?: string;
  current_period_end_date?: string;
  canceled_at?: string | null;
  last_transaction?: CreemTransaction;
};

async function creemRequest(path: string, init?: RequestInit): Promise<Response> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Creem API key is not configured.");
  }
  return fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      ...(init?.body ? { "Content-Type": "application/json" } : {})
    }
  });
}

/** Extract a human-readable error from a Creem error response. */
async function readCreemError(res: Response, fallback: string): Promise<string> {
  const err = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    message?: string;
  };
  return err.error?.message ?? err.message ?? `${fallback} (${res.status}).`;
}

/** GET /v1/subscriptions/{id} — fetch the authoritative subscription state. */
export async function retrieveCreemSubscription(
  subscriptionId: string
): Promise<CreemSubscriptionFull> {
  const res = await creemRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
  if (!res.ok) {
    throw new Error(await readCreemError(res, "Failed to retrieve Creem subscription"));
  }
  return (await res.json()) as CreemSubscriptionFull;
}

/** POST /v1/subscriptions/{id}/cancel — stop renewal immediately or at period end. */
export async function cancelCreemSubscription(
  subscriptionId: string,
  mode: "immediate" | "scheduled" = "immediate"
): Promise<CreemSubscriptionFull> {
  const res = await creemRequest(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    { method: "POST", body: JSON.stringify({ mode }) }
  );
  if (!res.ok) {
    throw new Error(await readCreemError(res, "Failed to cancel Creem subscription"));
  }
  return (await res.json()) as CreemSubscriptionFull;
}

/** 3-day no-questions-asked refund window, in milliseconds. */
export const REFUND_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * True if `chargeDate` (an ISO 8601 string from Creem) falls within the
 * 3-day refund window relative to `now`. Returns false when the date is
 * missing or unparseable so callers fail closed (no refund) rather than
 * silently letting an out-of-window charge through.
 */
export function isWithinRefundWindow(
  chargeDate: string | undefined | null,
  now: number = Date.now()
): boolean {
  if (!chargeDate) return false;
  const chargedAt = new Date(chargeDate).getTime();
  if (Number.isNaN(chargedAt)) return false;
  return now - chargedAt <= REFUND_WINDOW_MS && now - chargedAt >= 0;
}
