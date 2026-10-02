import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  canUseAutomaticOutcomeBackflow,
  resolveBusinessMissionPlan
} from "@/lib/business-mission-entitlements";
import { logError, logInfo, logWarn, resolveRequestId } from "@/lib/observability";
import {
  claimOutcomeWebhookDelivery,
  hashOutcomeWebhookValue,
  markOutcomeWebhookDeliveryFailed,
  markOutcomeWebhookDeliverySucceeded,
  OutcomeWebhookRequestError,
  parseOutcomeWebhookEvent,
  readOutcomeWebhookBody,
  validateOutcomeOccurrence,
  validateOutcomeWebhookTimestamp,
  verifyOutcomeWebhookSignature
} from "@/lib/outcome-webhook";
import { captureServerEvent } from "@/lib/posthog-server";
import { decryptSecret } from "@/lib/secret-encryption";
import { createSupabaseAdminClient } from "@/lib/supabase";

const endpointIdSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ endpointId: string }> }
) {
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const telemetry = { requestId, traceId: requestId };
  const broadRateLimit = enforceApiRateLimit(request, {
    scope: "outcome-webhook-global",
    limit: 600,
    windowMs: 60_000
  });
  if (broadRateLimit) {
    return outcomeError(429, "Too many outcome deliveries. Retry shortly.", "rate_limit_exceeded", requestId, {
      "Retry-After": broadRateLimit.headers.get("retry-after") ?? "60"
    });
  }

  const parsedEndpointId = endpointIdSchema.safeParse((await params).endpointId);
  if (!parsedEndpointId.success) {
    return outcomeError(404, "Outcome endpoint not found.", "endpoint_not_found", requestId);
  }
  const endpointId = parsedEndpointId.data;
  const endpointRateLimit = enforceApiRateLimit(request, {
    scope: `outcome-webhook:${endpointId}`,
    limit: 120,
    windowMs: 60_000
  });
  if (endpointRateLimit) {
    return outcomeError(429, "Too many outcome deliveries. Retry shortly.", "rate_limit_exceeded", requestId, {
      "Retry-After": endpointRateLimit.headers.get("retry-after") ?? "60"
    });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return outcomeError(503, "Outcome ingestion is temporarily unavailable.", "service_unavailable", requestId, {
      "Retry-After": "30"
    });
  }

  const { data: endpoint, error: endpointError } = await admin
    .from("outcome_webhook_endpoints")
    .select("id, user_id, status, encrypted_secret")
    .eq("id", endpointId)
    .eq("status", "active")
    .maybeSingle();
  if (endpointError) {
    logError("outcome_webhook_endpoint_lookup_failed", telemetry, { error_type: endpointError.code ?? "database" });
    return outcomeError(503, "Outcome ingestion is temporarily unavailable.", "service_unavailable", requestId, {
      "Retry-After": "30"
    });
  }
  if (!endpoint?.encrypted_secret || !endpoint.user_id) {
    return outcomeError(404, "Outcome endpoint not found.", "endpoint_not_found", requestId);
  }

  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return outcomeError(415, "Content-Type must be application/json.", "unsupported_media_type", requestId);
  }

  let rawBody: Uint8Array;
  try {
    rawBody = await readOutcomeWebhookBody(request);
  } catch (error) {
    return requestErrorResponse(error, requestId);
  }

  const timestamp = request.headers.get("x-finfold-timestamp");
  const timestampState = validateOutcomeWebhookTimestamp(timestamp);
  if (timestampState !== "valid") {
    logWarn("outcome_webhook_timestamp_rejected", telemetry, { endpoint_id: endpointId, reason: timestampState });
    return outcomeError(
      401,
      timestampState === "expired" ? "Webhook timestamp is outside the five-minute replay window." : "Missing or invalid webhook timestamp.",
      timestampState === "expired" ? "expired_timestamp" : "invalid_timestamp",
      requestId
    );
  }

  let secret: string;
  try {
    secret = await decryptSecret(String(endpoint.encrypted_secret));
  } catch (error) {
    logError("outcome_webhook_secret_unavailable", telemetry, {
      endpoint_id: endpointId,
      error_type: error instanceof Error ? error.name : "unknown"
    });
    return outcomeError(503, "Outcome ingestion is temporarily unavailable.", "service_unavailable", requestId, {
      "Retry-After": "30"
    });
  }

  const signatureValid = await verifyOutcomeWebhookSignature(
    rawBody,
    timestamp as string,
    request.headers.get("x-finfold-signature"),
    secret
  );
  if (!signatureValid) {
    logWarn("outcome_webhook_signature_rejected", telemetry, { endpoint_id: endpointId });
    return outcomeError(401, "Invalid webhook signature.", "invalid_signature", requestId);
  }

  const userId = String(endpoint.user_id);
  let plan: Awaited<ReturnType<typeof resolveBusinessMissionPlan>>;
  try {
    plan = await resolveBusinessMissionPlan(admin, userId);
  } catch (error) {
    logError("outcome_webhook_entitlement_lookup_failed", { ...telemetry, userId }, {
      endpoint_id: endpointId,
      error_type: error instanceof Error ? error.name : "unknown"
    });
    return outcomeError(503, "Outcome ingestion is temporarily unavailable.", "service_unavailable", requestId, {
      "Retry-After": "30"
    });
  }
  if (!canUseAutomaticOutcomeBackflow(plan)) {
    return outcomeError(
      403,
      "Automatic business result backflow requires an active Growth Engine or Digital Employee plan.",
      "plan_required",
      requestId
    );
  }

  let event;
  let occurredAt;
  try {
    event = parseOutcomeWebhookEvent(rawBody);
    occurredAt = validateOutcomeOccurrence(event.occurredAt);
  } catch (error) {
    return requestErrorResponse(error, requestId);
  }

  const [eventIdHash, payloadHash, externalRefHash] = await Promise.all([
    hashOutcomeWebhookValue(event.eventId),
    hashOutcomeWebhookValue(new TextDecoder().decode(rawBody)),
    event.externalRef ? hashOutcomeWebhookValue(event.externalRef) : Promise.resolve(null)
  ]);

  let claim: Awaited<ReturnType<typeof claimOutcomeWebhookDelivery>>;
  try {
    claim = await claimOutcomeWebhookDelivery(admin, {
      endpointId,
      userId,
      eventIdHash,
      eventType: event.type,
      source: event.source,
      payloadHash
    });
  } catch (error) {
    logError("outcome_webhook_delivery_claim_failed", { ...telemetry, userId }, {
      endpoint_id: endpointId,
      event_type: event.type,
      error_type: error instanceof Error ? error.name : "unknown"
    });
    return outcomeError(503, "Outcome ingestion is temporarily unavailable.", "service_unavailable", requestId, {
      "Retry-After": "30"
    });
  }
  if (claim.outcome === "duplicate") {
    return outcomeSuccess({
      ...(claim.response ?? { accepted: true }),
      replayed: true
    }, requestId, true);
  }
  if (claim.outcome === "conflict") {
    return outcomeError(
      409,
      "This eventId was already used with a different payload.",
      "idempotency_conflict",
      requestId
    );
  }
  if (claim.outcome === "busy") {
    return outcomeError(
      409,
      "This event is already being processed. Retry shortly.",
      "delivery_in_progress",
      requestId,
      { "Retry-After": "5" }
    );
  }

  try {
    const { data, error } = await admin.rpc("ingest_mission_outcome_webhook", {
      p_user_id: userId,
      p_endpoint_id: endpointId,
      p_mission_id: event.missionId ?? null,
      p_tracking_code: event.trackingCode ?? null,
      p_event_type: event.type,
      p_quantity: event.type === "revenue" ? 1 : event.count,
      p_value: event.type === "revenue" ? event.value : 0,
      p_currency: event.currency,
      p_source: event.source,
      p_external_ref_hash: externalRefHash,
      p_dedupe_key: `outcome-webhook:${endpointId}:${eventIdHash}`,
      p_occurred_at: occurredAt
    });
    if (error) throw error;
    const result = asRecord(data);
    const missionId = typeof result.missionId === "string" ? result.missionId : event.missionId;
    if (!missionId) throw new Error("Outcome ingestion returned no mission id.");

    const response = {
      accepted: true,
      replayed: Boolean(result.replayed),
      missionId,
      eventType: event.type,
      actualValue: Number(result.actualValue ?? 0),
      receivedAt: new Date().toISOString()
    };
    await markOutcomeWebhookDeliverySucceeded(admin, {
      deliveryId: claim.deliveryId,
      endpointId,
      lease: claim.lease,
      missionId,
      response
    });
    await captureServerEvent(userId, "mission_outcome_received_by_webhook", {
      mission_id: missionId,
      endpoint_id: endpointId,
      event_type: event.type,
      source: event.source,
      replayed: Boolean(result.replayed)
    });
    logInfo("outcome_webhook_completed", { ...telemetry, userId }, {
      endpoint_id: endpointId,
      mission_id: missionId,
      event_type: event.type,
      source: event.source,
      replayed: Boolean(result.replayed)
    });
    return outcomeSuccess(response, requestId, Boolean(result.replayed));
  } catch (error) {
    const mapped = mapOutcomeDatabaseError(error);
    await markOutcomeWebhookDeliveryFailed(admin, {
      deliveryId: claim.deliveryId,
      lease: claim.lease,
      errorCode: mapped.code
    }).catch(() => undefined);
    logError("outcome_webhook_failed", { ...telemetry, userId }, {
      endpoint_id: endpointId,
      event_type: event.type,
      source: event.source,
      error_code: mapped.code
    });
    return outcomeError(mapped.status, mapped.message, mapped.code, requestId, mapped.retryable ? { "Retry-After": "30" } : undefined);
  }
}

function mapOutcomeDatabaseError(error: unknown): {
  status: number;
  message: string;
  code: string;
  retryable: boolean;
} {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  if (code === "P0002") return { status: 404, message: "Mission or tracking code not found for this account.", code: "mission_not_found", retryable: false };
  if (code === "P0001") return { status: 409, message: message || "This mission cannot receive automatic outcomes in its current state.", code: "mission_state_invalid", retryable: false };
  if (code === "22023") return { status: 400, message: message || "Invalid business outcome.", code: "invalid_event", retryable: false };
  return { status: 503, message: "Outcome ingestion is temporarily unavailable.", code: "service_unavailable", retryable: true };
}

function requestErrorResponse(error: unknown, requestId: string): NextResponse {
  if (error instanceof OutcomeWebhookRequestError) {
    return outcomeError(error.status, error.message, error.code, requestId);
  }
  return outcomeError(400, "Invalid outcome request.", "invalid_request", requestId);
}

function outcomeSuccess(body: Record<string, unknown>, requestId: string, replayed: boolean): NextResponse {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
      "X-Finfold-Idempotent-Replay": replayed ? "true" : "false"
    }
  });
}

function outcomeError(
  status: number,
  message: string,
  code: string,
  requestId: string,
  headers?: HeadersInit
): NextResponse {
  return NextResponse.json(
    { error: { message, code } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
        ...headers
      }
    }
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
