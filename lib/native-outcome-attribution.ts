import type { createSupabaseAdminClient } from "@/lib/supabase";
import { hashOutcomeWebhookValue } from "@/lib/outcome-webhook";
import {
  retrieveCreemTransaction,
  type CreemTransaction
} from "@/lib/payment/creem-management";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export const NATIVE_VISITOR_COOKIE = "finfold_visitor_id";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NativeOutcomeResult = {
  attributed: boolean;
  replayed?: boolean;
  missionId?: string;
  outcomeEventId?: string;
  actualValue?: number;
  reason?: string;
};

export type PaidCreemRevenue = {
  transactionId: string;
  amount: number;
  amountPaidCents: number;
  currency: string;
};

export function readNativeVisitorId(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)finfold_visitor_id=([^;]+)/);
  if (!match) return null;
  let value: string;
  try {
    value = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

export async function recordNativeSignupOutcome(
  admin: AdminClient,
  input: {
    request: Request;
    subjectUserId: string;
    occurredAt?: string;
  }
): Promise<NativeOutcomeResult> {
  const visitorId = readNativeVisitorId(input.request);
  if (!visitorId) return { attributed: false, reason: "no_tracking_cookie" };

  const subjectHash = await hashOutcomeWebhookValue(`finfold-user:${input.subjectUserId}`);
  return ingestNativeOutcome(admin, {
    subjectUserId: input.subjectUserId,
    visitorId,
    eventType: "signup",
    providerEventHash: subjectHash,
    externalRefHash: null,
    value: 0,
    currency: "XXX",
    occurredAt: input.occurredAt ?? new Date().toISOString()
  });
}

export async function recordCreemRevenueOutcome(
  admin: AdminClient,
  input: {
    subjectUserId: string;
    providerEventId: string;
    transactionId?: string;
    subscriptionId?: string;
    occurredAt?: string;
  }
): Promise<NativeOutcomeResult> {
  const { data: attribution, error: attributionError } = await admin
    .from("native_outcome_attributions")
    .select("subject_user_id")
    .eq("subject_user_id", input.subjectUserId)
    .maybeSingle();
  if (attributionError) throw attributionError;
  if (!attribution) return { attributed: false, reason: "no_signup_attribution" };

  if (!input.transactionId) {
    throw new Error("Creem paid subscription event is missing its transaction id.");
  }

  const transaction = await retrieveCreemTransaction(input.transactionId);
  const paid = validatePaidCreemTransaction(transaction, {
    transactionId: input.transactionId,
    subscriptionId: input.subscriptionId
  });
  if (paid.amountPaidCents === 0) {
    return { attributed: false, reason: "no_positive_revenue" };
  }
  const [providerEventHash, externalRefHash] = await Promise.all([
    hashOutcomeWebhookValue(`creem-event:${input.providerEventId}`),
    hashOutcomeWebhookValue(`creem-transaction:${paid.transactionId}`)
  ]);

  return ingestNativeOutcome(admin, {
    subjectUserId: input.subjectUserId,
    visitorId: null,
    eventType: "revenue",
    providerEventHash,
    externalRefHash,
    value: paid.amount,
    currency: paid.currency,
    occurredAt: input.occurredAt ?? new Date().toISOString()
  });
}

export function validatePaidCreemTransaction(
  transaction: CreemTransaction,
  expected: { transactionId: string; subscriptionId?: string }
): PaidCreemRevenue {
  if (!transaction.id || transaction.id !== expected.transactionId) {
    throw new Error("Creem returned a different transaction than requested.");
  }
  if (transaction.status !== "paid") {
    throw new Error("Creem transaction is not in paid status.");
  }
  if (!Number.isSafeInteger(transaction.amount_paid) || Number(transaction.amount_paid) < 0) {
    throw new Error("Creem transaction does not contain a valid paid amount.");
  }
  const currency = transaction.currency?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Creem transaction does not contain a valid currency.");
  }
  const transactionSubscriptionId = typeof transaction.subscription === "string"
    ? transaction.subscription
    : transaction.subscription?.id;
  if (
    expected.subscriptionId
    && transactionSubscriptionId
    && transactionSubscriptionId !== expected.subscriptionId
  ) {
    throw new Error("Creem transaction belongs to a different subscription.");
  }

  const amountPaidCents = Number(transaction.amount_paid);
  return {
    transactionId: transaction.id,
    amount: amountPaidCents / 100,
    amountPaidCents,
    currency
  };
}

async function ingestNativeOutcome(
  admin: AdminClient,
  input: {
    subjectUserId: string;
    visitorId: string | null;
    eventType: "signup" | "revenue";
    providerEventHash: string;
    externalRefHash: string | null;
    value: number;
    currency: string;
    occurredAt: string;
  }
): Promise<NativeOutcomeResult> {
  const { data, error } = await admin.rpc("ingest_native_attributed_outcome", {
    p_subject_user_id: input.subjectUserId,
    p_visitor_id: input.visitorId,
    p_event_type: input.eventType,
    p_provider_event_hash: input.providerEventHash,
    p_external_ref_hash: input.externalRefHash,
    p_value: input.value,
    p_currency: input.currency,
    p_occurred_at: input.occurredAt
  });
  if (error) throw error;
  return normalizeNativeOutcomeResult(data);
}

function normalizeNativeOutcomeResult(value: unknown): NativeOutcomeResult {
  if (!value || typeof value !== "object") {
    return { attributed: false, reason: "invalid_database_response" };
  }
  const row = value as Record<string, unknown>;
  return {
    attributed: row.attributed === true,
    ...(typeof row.replayed === "boolean" ? { replayed: row.replayed } : {}),
    ...(typeof row.missionId === "string" ? { missionId: row.missionId } : {}),
    ...(typeof row.outcomeEventId === "string" ? { outcomeEventId: row.outcomeEventId } : {}),
    ...(typeof row.actualValue === "number" ? { actualValue: row.actualValue } : {}),
    ...(typeof row.reason === "string" ? { reason: row.reason } : {})
  };
}
