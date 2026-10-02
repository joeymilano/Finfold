import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  cacheMissionGetCompletion,
  createMissionGetCompletion,
  formatMissionGetOutputs,
  getCachedMissionGetCompletion,
  MissionGetRequestError,
  missionGetOperationKey,
  missionGetRequestToGenerateInput,
  parseMissionGetRequest,
  readBoundedBody,
  verifyMissionGetSignature
} from "@/lib/integrations/missionget";
import { generateKitOutputs } from "@/lib/llm";
import { moderateInput } from "@/lib/moderation";
import { resolveRequestId, logError, logInfo, logWarn } from "@/lib/observability";
import { computeKitCost, type ModelTier } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";

export const maxDuration = 60;

const partnerUserIdSchema = z.string().uuid();
const modelTierSchema = z.enum(["haiku", "sonnet", "opus"]);

export async function POST(request: Request) {
  const requestId = resolveRequestId(
    request.headers.get("x-missionget-request-id") ?? request.headers.get("x-request-id")
  );
  const telemetry = { requestId, traceId: requestId };
  const rateLimited = enforceApiRateLimit(request, {
    scope: "missionget:webhook",
    limit: 60,
    windowMs: 60_000
  });
  if (rateLimited) {
    return openAiError(
      429,
      "Too many MissionGet requests. Please wait and try again.",
      "rate_limit_exceeded",
      { "Retry-After": rateLimited.headers.get("retry-after") ?? "60" }
    );
  }

  const secret = process.env.MISSIONGET_WEBHOOK_SECRET?.trim();
  const partnerUser = partnerUserIdSchema.safeParse(process.env.MISSIONGET_PARTNER_USER_ID?.trim());
  if (!secret || secret.length < 32 || !partnerUser.success) {
    logError("missionget_webhook_misconfigured", telemetry, {
      has_valid_secret: Boolean(secret && secret.length >= 32),
      has_valid_partner_user: partnerUser.success
    });
    return openAiError(503, "Finfold's MissionGet integration is not configured.", "integration_unavailable");
  }

  let rawBody: Uint8Array;
  try {
    rawBody = await readBoundedBody(request);
  } catch (error) {
    return requestErrorResponse(error);
  }

  const signatureValid = await verifyMissionGetSignature(
    rawBody,
    request.headers.get("x-missionget-signature"),
    secret
  );
  if (!signatureValid) {
    logWarn("missionget_webhook_signature_rejected", telemetry);
    return openAiError(401, "Invalid MissionGet webhook signature.", "invalid_signature");
  }

  try {
    const payload = parseMissionGetRequest(rawBody);
    const input = missionGetRequestToGenerateInput(payload);
    const moderation = moderateInput(input.ideaText);
    if (moderation.flagged) {
      return openAiError(400, moderation.reason, "moderation_rejected");
    }

    const { operationKey, inputFingerprint, partnerRequestId } = await missionGetOperationKey(
      request,
      payload,
      rawBody
    );
    const completionCacheKey = `${operationKey}:${inputFingerprint}`;
    const cached = getCachedMissionGetCompletion(completionCacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: responseHeaders(requestId, true) });
    }

    const cost = computeKitCost(input.platforms.length);
    const billing = createAiUsageBilling({
      operationKey,
      userId: partnerUser.data,
      action: "contentKitBase",
      cost,
      source: "missionget",
      detail: {
        requestId,
        partnerRequestId,
        inputFingerprint,
        platformCount: input.platforms.length,
        language: input.language
      }
    });
    const reservation = await billing.reserveAndStart();
    if (reservation.outcome === "insufficient_credits") {
      return openAiError(402, "The MissionGet partner balance has insufficient Finfold Credits.", "insufficient_credits");
    }
    if (reservation.outcome === "existing") {
      return openAiError(
        409,
        "This request ID was already processed. Retry with the same ID shortly, or use a new ID for a new request.",
        "duplicate_request"
      );
    }

    let completion;
    try {
      const outputs = await generateKitOutputs(input, {
        modelTier: missionGetModelTier(),
        allowPersistentAgentFallback: false,
        telemetry: { ...telemetry, userId: partnerUser.data }
      });
      completion = createMissionGetCompletion(formatMissionGetOutputs(outputs, input.language));
    } catch (error) {
      await billing.refund("missionget_generation_failed").catch(() => undefined);
      throw error;
    }

    try {
      await billing.settle();
    } catch (error) {
      // The caller already has a complete provider result. Preserve it and
      // leave the started operation for the existing reconciliation process.
      logError("missionget_billing_settlement_failed", { ...telemetry, userId: partnerUser.data }, {
        error_type: error instanceof Error ? error.name : "unknown"
      });
    }

    cacheMissionGetCompletion(completionCacheKey, completion);
    logInfo("missionget_webhook_completed", { ...telemetry, userId: partnerUser.data }, {
      platform_count: input.platforms.length,
      language: input.language,
      credit_cost: cost
    });
    return NextResponse.json(completion, { headers: responseHeaders(requestId, false) });
  } catch (error) {
    if (error instanceof MissionGetRequestError) return requestErrorResponse(error);
    logError("missionget_webhook_failed", telemetry, {
      error_type: error instanceof Error ? error.name : "unknown"
    });
    return openAiError(502, "Finfold could not generate this content request.", "generation_failed");
  }
}

function missionGetModelTier(): ModelTier {
  return modelTierSchema.safeParse(process.env.MISSIONGET_MODEL_TIER).data ?? "haiku";
}

function requestErrorResponse(error: unknown): NextResponse {
  if (error instanceof MissionGetRequestError) {
    return openAiError(error.status, error.message, error.code);
  }
  return openAiError(400, "Invalid request.", "invalid_request");
}

function openAiError(
  status: number,
  message: string,
  code: string,
  headers?: HeadersInit
): NextResponse {
  return NextResponse.json(
    { error: { message, type: "invalid_request_error", code } },
    { status, headers }
  );
}

function responseHeaders(requestId: string, replayed: boolean): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
    "X-Finfold-Idempotent-Replay": replayed ? "true" : "false"
  };
}
