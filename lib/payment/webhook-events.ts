import { createSupabaseAdminClient } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type WebhookEventStatus = "processing" | "succeeded" | "failed";

export type WebhookEventRecord = {
  id: string;
  event_type: string;
  status: WebhookEventStatus;
  attempt_count: number;
  payload_hash: string | null;
  processing_started_at: string | null;
};

export type WebhookClaimDecision =
  | "duplicate"
  | "retry"
  | "busy"
  | "conflict";

export type WebhookClaimResult =
  | { outcome: "claimed"; lease: string }
  | { outcome: "duplicate" }
  | { outcome: "busy" }
  | { outcome: "conflict" };

const PROCESSING_STALE_MS = 5 * 60 * 1000;

export async function hashWebhookPayload(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function decideWebhookClaim(
  existing: WebhookEventRecord,
  incoming: { eventType: string; payloadHash: string },
  nowMs = Date.now()
): WebhookClaimDecision {
  if (
    existing.event_type !== incoming.eventType ||
    (existing.payload_hash !== null && existing.payload_hash !== incoming.payloadHash)
  ) {
    return "conflict";
  }

  if (existing.status === "succeeded") return "duplicate";
  if (existing.status === "failed") return "retry";

  const processingStartedAt = existing.processing_started_at
    ? new Date(existing.processing_started_at).getTime()
    : Number.NaN;
  if (
    !Number.isFinite(processingStartedAt) ||
    nowMs - processingStartedAt >= PROCESSING_STALE_MS
  ) {
    return "retry";
  }
  return "busy";
}

/**
 * Claims a signed webhook event for processing.
 *
 * A succeeded event is an idempotent duplicate. Failed or stale processing
 * events can be reclaimed. A fresh processing event is left alone so two
 * concurrent deliveries never execute the same business transition.
 */
export async function claimWebhookEvent(
  supabase: AdminClient,
  input: { id: string; eventType: string; payloadHash: string }
): Promise<WebhookClaimResult> {
  const now = new Date().toISOString();
  const { error: insertError } = await supabase.from("webhook_events").insert({
    id: input.id,
    event_type: input.eventType,
    status: "processing",
    attempt_count: 1,
    payload_hash: input.payloadHash,
    received_at: now,
    processing_started_at: now,
    processed_at: null,
    last_error: null
  });

  if (!insertError) return { outcome: "claimed", lease: now };
  if (insertError.code !== "23505") throw insertError;

  const { data, error: readError } = await supabase
    .from("webhook_events")
    .select(
      "id, event_type, status, attempt_count, payload_hash, processing_started_at"
    )
    .eq("id", input.id)
    .maybeSingle();
  if (readError) throw readError;
  if (!data) throw new Error("Webhook event disappeared while claiming it.");

  const existing = data as WebhookEventRecord;
  const decision = decideWebhookClaim(existing, input);
  if (decision !== "retry") return { outcome: decision };

  let reclaim = supabase
    .from("webhook_events")
    .update({
      status: "processing",
      attempt_count: Math.max(1, Number(existing.attempt_count) + 1),
      payload_hash: existing.payload_hash ?? input.payloadHash,
      processing_started_at: now,
      processed_at: null,
      last_error: null
    })
    .eq("id", input.id)
    .eq("status", existing.status);

  if (existing.status === "processing" && existing.processing_started_at) {
    reclaim = reclaim.eq("processing_started_at", existing.processing_started_at);
  } else if (existing.status === "processing") {
    reclaim = reclaim.is("processing_started_at", null);
  }

  const { data: claimed, error: reclaimError } = await reclaim
    .select("id")
    .maybeSingle();
  if (reclaimError) throw reclaimError;
  return claimed
    ? { outcome: "claimed", lease: now }
    : { outcome: "busy" };
}

export async function markWebhookEventSucceeded(
  supabase: AdminClient,
  eventId: string,
  lease: string
): Promise<void> {
  const { data, error } = await supabase
    .from("webhook_events")
    .update({
      status: "succeeded",
      processed_at: new Date().toISOString(),
      last_error: null
    })
    .eq("id", eventId)
    .eq("status", "processing")
    .eq("processing_started_at", lease)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("Webhook event completion state was not persisted.");
  }
}

export async function markWebhookEventFailed(
  supabase: AdminClient,
  eventId: string,
  lease: string,
  error: unknown
): Promise<void> {
  const message = (
    error instanceof Error ? error.message : "Unknown webhook processing error."
  ).slice(0, 2000);
  const { error: updateError } = await supabase
    .from("webhook_events")
    .update({
      status: "failed",
      last_error: message,
      processed_at: null
    })
    .eq("id", eventId)
    .eq("status", "processing")
    .eq("processing_started_at", lease);
  if (updateError) {
    console.error(
      "[creem-webhook] failed to persist failure state:",
      JSON.stringify(updateError)
    );
  }
}
