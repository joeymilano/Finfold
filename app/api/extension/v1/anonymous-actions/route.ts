import { anonymousActionRequestSchema, type ExtensionErrorCode } from "@/lib/extension/contracts";
import { createClaimReceipt } from "@/lib/extension/crypto";
import { extensionJson, extensionPreflight, isAllowedExtensionRequestOrigin } from "@/lib/extension/cors";
import { generateExtensionResults } from "@/lib/extension/generation";
import {
  anonymousFeatureEnabled,
  completeAnonymousAction,
  failAnonymousAction,
  requestIp,
  reserveAnonymousAction
} from "@/lib/extension/usage";
import type { ModelAttemptAudit } from "@/lib/llm";

export function OPTIONS(request: Request) {
  return extensionPreflight(request);
}

export async function POST(request: Request) {
  if (!isAllowedExtensionRequestOrigin(request.headers.get("origin"))) {
    return error(request, "ORIGIN_NOT_ALLOWED", 403);
  }
  if (!anonymousFeatureEnabled()) {
    return error(request, "FEATURE_DISABLED", 503);
  }

  const parsed = anonymousActionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(request, "BAD_REQUEST", 400);

  let reservation;
  try {
    reservation = await reserveAnonymousAction({
      requestId: parsed.data.requestId,
      installationId: parsed.data.installationId,
      ip: requestIp(request),
      platform: parsed.data.platform
    });
  } catch {
    return error(request, "GENERATION_FAILED", 503);
  }

  const mapped = reservationError(reservation.outcome);
  if (mapped) return error(request, mapped.code, mapped.status);
  if (!reservation.actionId) return error(request, "GENERATION_FAILED", 503);

  let audit: ModelAttemptAudit | null = null;
  try {
    const [result] = await generateExtensionResults({
      page: parsed.data.page,
      platforms: [parsed.data.platform],
      language: parsed.data.language,
      providerPolicy: "free_only",
      maxTokens: 700,
      maxAttemptsPerProvider: 1,
      telemetry: { requestId: parsed.data.requestId },
      onModelAttempt: async (attempt) => { audit = attempt; }
    });
    const expiresAt = new Date(Date.now() + 30 * 60 * 1_000);
    const receipt = await createClaimReceipt({
      actionId: reservation.actionId,
      result,
      expiresAt
    });
    await completeAnonymousAction({ actionId: reservation.actionId, audit });
    return extensionJson(request, {
      requestId: parsed.data.requestId,
      result,
      claim: { receipt, expiresAt: expiresAt.toISOString() }
    });
  } catch (cause) {
    const code = cause instanceof Error && cause.message === "FREE_POOL_UNAVAILABLE"
      ? "FREE_POOL_UNAVAILABLE"
      : "GENERATION_FAILED";
    await failAnonymousAction({ actionId: reservation.actionId, failureCode: code, audit });
    return error(request, code, code === "FREE_POOL_UNAVAILABLE" ? 503 : 502);
  }
}

function reservationError(outcome: string): { code: ExtensionErrorCode; status: number } | null {
  switch (outcome) {
    case "installation_limit": return { code: "INSTALLATION_LIMIT_REACHED", status: 429 };
    case "ip_limit": return { code: "IP_RATE_LIMITED", status: 429 };
    case "global_limit": return { code: "GLOBAL_LIMIT_REACHED", status: 429 };
    case "existing_reserved": return { code: "REQUEST_IN_PROGRESS", status: 409 };
    case "existing_succeeded": return { code: "INSTALLATION_LIMIT_REACHED", status: 409 };
    case "existing_failed": return { code: "REQUEST_ALREADY_FAILED", status: 409 };
    default: return null;
  }
}

function error(request: Request, code: ExtensionErrorCode, status: number) {
  return extensionJson(request, { error: { code } }, { status });
}
