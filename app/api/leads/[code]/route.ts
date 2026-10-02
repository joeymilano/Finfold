import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  ingestNativeLeadCandidate,
  NativeLeadRequestError,
  readNativeLeadSubmission
} from "@/lib/native-leads";
import { logError, logInfo, logWarn, resolveRequestId } from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { verifyTurnstileRequest } from "@/lib/turnstile";

const trackingCodeSchema = z.string().regex(/^[A-Za-z0-9]{8,40}$/);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const broadRateLimit = enforceApiRateLimit(request, {
    scope: "native-lead-capture",
    limit: 12,
    windowMs: 60_000
  });
  if (broadRateLimit) return broadRateLimit;

  const parsedCode = trackingCodeSchema.safeParse((await params).code);
  if (!parsedCode.success) return leadError(404, "Lead form not found.", "form_not_found", requestId);

  let submission;
  try {
    submission = await readNativeLeadSubmission(request);
  } catch (error) {
    if (error instanceof NativeLeadRequestError) {
      return leadError(error.status, error.message, error.code, requestId);
    }
    return leadError(400, "Lead submission is invalid.", "invalid_submission", requestId);
  }

  const verification = await verifyTurnstileRequest(request, {
    token: submission.turnstileToken,
    action: "native_lead",
    idempotencyKey: submission.submissionId
  });
  if (!verification.valid) {
    logWarn("native_lead_turnstile_rejected", { requestId, traceId: requestId }, {
      reason: verification.reason
    });
    return verification.reason === "rejected"
      ? leadError(403, "Verification expired or failed. Please try again.", "verification_failed", requestId)
      : leadError(503, "Verification is temporarily unavailable. Please try again.", "verification_unavailable", requestId);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return leadError(503, "Lead capture is temporarily unavailable.", "service_unavailable", requestId);
  }

  try {
    const result = await ingestNativeLeadCandidate(admin, {
      trackingCode: parsedCode.data,
      submission
    });
    logInfo("native_lead_candidate_received", { requestId, traceId: requestId }, {
      replayed: result.replayed,
      source: "finfold-native-lead-form"
    });
    return NextResponse.json(
      { accepted: true, replayed: result.replayed },
      {
        status: result.replayed ? 200 : 201,
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId
        }
      }
    );
  } catch (error) {
    const databaseCode = databaseErrorCode(error);
    if (databaseCode === "P0002") {
      return leadError(404, "Lead form not found.", "form_not_found", requestId);
    }
    if (databaseCode === "P0001") {
      return leadError(409, "This lead form is not accepting submissions.", "form_closed", requestId);
    }
    if (databaseCode === "22023") {
      return leadError(409, "This submission could not be accepted. Refresh the page and try again.", "submission_conflict", requestId);
    }
    logError("native_lead_candidate_failed", { requestId, traceId: requestId }, {
      error_type: error instanceof Error ? error.name : "unknown"
    });
    return leadError(503, "Lead capture is temporarily unavailable.", "service_unavailable", requestId);
  }
}

function leadError(status: number, error: string, code: string, requestId: string) {
  return NextResponse.json(
    { error, code },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": requestId
      }
    }
  );
}

function databaseErrorCode(error: unknown): string | null {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "") || null
    : null;
}
