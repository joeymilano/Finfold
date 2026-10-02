import { z } from "zod";
import { signHmacSHA256 } from "@/lib/payment/hmac";
import type { createSupabaseAdminClient } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const SECRET_PREFIX = "ff_out_";
const MAX_BODY_BYTES = 32 * 1024;
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const DELIVERY_STALE_MS = 5 * 60 * 1000;

export const outcomeWebhookEventSchema = z.object({
  eventId: z.string().trim().min(8).max(160),
  type: z.enum(["lead", "signup", "revenue"]),
  missionId: z.string().uuid().optional(),
  trackingCode: z.string().trim().regex(/^[A-Za-z0-9]{8,40}$/).optional(),
  source: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/).default("webhook"),
  count: z.number().int().min(1).max(10_000).default(1),
  value: z.number().finite().nonnegative().max(100_000_000).default(0),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("CNY"),
  occurredAt: z.string().datetime().optional(),
  externalRef: z.string().trim().min(1).max(160).optional()
}).superRefine((input, context) => {
  if (!input.missionId && !input.trackingCode) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["missionId"],
      message: "Provide missionId or trackingCode."
    });
  }
  if (input.type === "revenue" && input.value <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message: "Revenue must be greater than zero."
    });
  }
  if (input.type !== "revenue" && input.value !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message: "Only revenue events may include a value."
    });
  }
});

export type OutcomeWebhookEvent = z.infer<typeof outcomeWebhookEventSchema>;

export type OutcomeWebhookEndpointSummary = {
  id: string;
  status: "active" | "disabled";
  secretPrefix: string | null;
  createdAt: string;
  rotatedAt: string | null;
  lastReceivedAt: string | null;
};

export type OutcomeWebhookDeliverySummary = {
  id: string;
  status: "processing" | "succeeded" | "failed";
  eventType: "lead" | "signup" | "revenue";
  source: string;
  missionId: string | null;
  attemptCount: number;
  errorCode: string | null;
  receivedAt: string;
  processedAt: string | null;
};

type DeliveryRow = {
  id: string;
  endpoint_id: string;
  user_id: string;
  event_id_hash: string;
  event_type: "lead" | "signup" | "revenue";
  source: string;
  payload_hash: string;
  status: "processing" | "succeeded" | "failed";
  attempt_count: number;
  processing_started_at: string | null;
  response: unknown;
};

export type OutcomeWebhookClaimResult =
  | { outcome: "claimed"; deliveryId: string; lease: string }
  | { outcome: "duplicate"; response: Record<string, unknown> | null }
  | { outcome: "busy" }
  | { outcome: "conflict" };

export function createOutcomeWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${SECRET_PREFIX}${value}`;
}

export function outcomeWebhookSecretPrefix(secret: string): string {
  return secret.slice(0, SECRET_PREFIX.length + 8);
}

export async function hashOutcomeWebhookValue(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function readOutcomeWebhookBody(request: Request): Promise<Uint8Array> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new OutcomeWebhookRequestError(413, "Request body exceeds 32 KB.", "request_too_large");
  }

  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new OutcomeWebhookRequestError(413, "Request body exceeds 32 KB.", "request_too_large");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function parseOutcomeWebhookEvent(rawBody: Uint8Array): OutcomeWebhookEvent {
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    throw new OutcomeWebhookRequestError(400, "Request body must be valid JSON.", "invalid_json");
  }

  const parsed = outcomeWebhookEventSchema.safeParse(input);
  if (!parsed.success) {
    throw new OutcomeWebhookRequestError(
      400,
      parsed.error.issues[0]?.message ?? "Invalid outcome event.",
      "invalid_event"
    );
  }
  return parsed.data;
}

export function validateOutcomeWebhookTimestamp(
  timestampHeader: string | null,
  nowMs = Date.now()
): "valid" | "missing" | "expired" {
  const candidate = timestampHeader?.trim() ?? "";
  if (!/^\d{10}$/.test(candidate)) return "missing";
  const timestampSeconds = Number(candidate);
  if (!Number.isSafeInteger(timestampSeconds)) return "missing";
  return Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) <= SIGNATURE_TOLERANCE_SECONDS
    ? "valid"
    : "expired";
}

export async function verifyOutcomeWebhookSignature(
  rawBody: Uint8Array,
  timestamp: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  const match = signatureHeader?.trim().match(/^v1=([a-f0-9]{64})$/i);
  if (!match) return false;
  const payload = `${timestamp}.${new TextDecoder().decode(rawBody)}`;
  const expected = await signHmacSHA256(payload, secret);
  return constantTimeEqual(expected, match[1].toLowerCase());
}

export function validateOutcomeOccurrence(occurredAt: string | undefined, nowMs = Date.now()): string {
  if (!occurredAt) return new Date(nowMs).toISOString();
  const occurredMs = Date.parse(occurredAt);
  const oldestMs = nowMs - 366 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(occurredMs) || occurredMs < oldestMs || occurredMs > nowMs + 5 * 60 * 1000) {
    throw new OutcomeWebhookRequestError(
      400,
      "occurredAt must be within the last 366 days and no more than five minutes in the future.",
      "invalid_occurred_at"
    );
  }
  return new Date(occurredMs).toISOString();
}

export async function claimOutcomeWebhookDelivery(
  admin: AdminClient,
  input: {
    endpointId: string;
    userId: string;
    eventIdHash: string;
    eventType: "lead" | "signup" | "revenue";
    source: string;
    payloadHash: string;
  },
  now = new Date()
): Promise<OutcomeWebhookClaimResult> {
  const lease = now.toISOString();
  const { data: inserted, error: insertError } = await admin
    .from("outcome_webhook_deliveries")
    .insert({
      endpoint_id: input.endpointId,
      user_id: input.userId,
      event_id_hash: input.eventIdHash,
      event_type: input.eventType,
      source: input.source,
      payload_hash: input.payloadHash,
      status: "processing",
      attempt_count: 1,
      received_at: lease,
      processing_started_at: lease
    })
    .select("id")
    .single();

  if (!insertError && inserted) {
    return { outcome: "claimed", deliveryId: String(inserted.id), lease };
  }
  if (insertError?.code !== "23505") throw insertError ?? new Error("Outcome delivery claim failed.");

  const { data, error: readError } = await admin
    .from("outcome_webhook_deliveries")
    .select("id, endpoint_id, user_id, event_id_hash, event_type, source, payload_hash, status, attempt_count, processing_started_at, response")
    .eq("endpoint_id", input.endpointId)
    .eq("event_id_hash", input.eventIdHash)
    .maybeSingle();
  if (readError) throw readError;
  if (!data) throw new Error("Outcome delivery disappeared while claiming it.");

  const existing = data as DeliveryRow;
  if (
    existing.user_id !== input.userId
    || existing.payload_hash !== input.payloadHash
    || existing.event_type !== input.eventType
    || existing.source !== input.source
  ) {
    return { outcome: "conflict" };
  }
  if (existing.status === "succeeded") {
    return { outcome: "duplicate", response: asRecord(existing.response) };
  }

  const processingStartedMs = existing.processing_started_at
    ? Date.parse(existing.processing_started_at)
    : Number.NaN;
  if (
    existing.status === "processing"
    && Number.isFinite(processingStartedMs)
    && now.getTime() - processingStartedMs < DELIVERY_STALE_MS
  ) {
    return { outcome: "busy" };
  }

  let reclaim = admin
    .from("outcome_webhook_deliveries")
    .update({
      status: "processing",
      attempt_count: Math.max(1, Number(existing.attempt_count) + 1),
      processing_started_at: lease,
      processed_at: null,
      error_code: null
    })
    .eq("id", existing.id)
    .eq("status", existing.status);
  if (existing.processing_started_at) {
    reclaim = reclaim.eq("processing_started_at", existing.processing_started_at);
  } else {
    reclaim = reclaim.is("processing_started_at", null);
  }
  const { data: reclaimed, error: reclaimError } = await reclaim.select("id").maybeSingle();
  if (reclaimError) throw reclaimError;
  return reclaimed
    ? { outcome: "claimed", deliveryId: existing.id, lease }
    : { outcome: "busy" };
}

export async function markOutcomeWebhookDeliverySucceeded(
  admin: AdminClient,
  input: {
    deliveryId: string;
    endpointId: string;
    lease: string;
    missionId: string;
    response: Record<string, unknown>;
  }
): Promise<void> {
  const processedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("outcome_webhook_deliveries")
    .update({
      status: "succeeded",
      mission_id: input.missionId,
      response: input.response,
      processed_at: processedAt,
      error_code: null
    })
    .eq("id", input.deliveryId)
    .eq("status", "processing")
    .eq("processing_started_at", input.lease)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Outcome delivery processing lease was lost.");

  const { error: endpointError } = await admin
    .from("outcome_webhook_endpoints")
    .update({ last_received_at: processedAt, updated_at: processedAt })
    .eq("id", input.endpointId);
  if (endpointError) throw endpointError;
}

export async function markOutcomeWebhookDeliveryFailed(
  admin: AdminClient,
  input: { deliveryId: string; lease: string; errorCode: string }
): Promise<void> {
  const { error } = await admin
    .from("outcome_webhook_deliveries")
    .update({
      status: "failed",
      processed_at: new Date().toISOString(),
      error_code: input.errorCode.slice(0, 80)
    })
    .eq("id", input.deliveryId)
    .eq("status", "processing")
    .eq("processing_started_at", input.lease);
  if (error) throw error;
}

export function toOutcomeWebhookEndpointSummary(value: Record<string, unknown>): OutcomeWebhookEndpointSummary {
  return {
    id: String(value.id),
    status: value.status === "active" ? "active" : "disabled",
    secretPrefix: value.secret_prefix ? String(value.secret_prefix) : null,
    createdAt: String(value.created_at),
    rotatedAt: value.rotated_at ? String(value.rotated_at) : null,
    lastReceivedAt: value.last_received_at ? String(value.last_received_at) : null
  };
}

export function toOutcomeWebhookDeliverySummary(value: Record<string, unknown>): OutcomeWebhookDeliverySummary {
  const eventType = value.event_type;
  if (eventType !== "lead" && eventType !== "signup" && eventType !== "revenue") {
    throw new Error("Outcome delivery has an unsupported event type.");
  }
  const status = value.status;
  if (status !== "processing" && status !== "succeeded" && status !== "failed") {
    throw new Error("Outcome delivery has an unsupported status.");
  }
  return {
    id: String(value.id),
    status,
    eventType,
    source: String(value.source),
    missionId: value.mission_id ? String(value.mission_id) : null,
    attemptCount: Math.max(1, Number(value.attempt_count ?? 1)),
    errorCode: value.error_code ? String(value.error_code) : null,
    receivedAt: String(value.received_at),
    processedAt: value.processed_at ? String(value.processed_at) : null
  };
}

export class OutcomeWebhookRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "OutcomeWebhookRequestError";
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
