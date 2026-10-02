import { authenticateExtensionRequest } from "@/lib/extension/auth";
import { authenticatedActionRequestSchema, type ExtensionErrorCode } from "@/lib/extension/contracts";
import { extensionJson, extensionPreflight, isAllowedExtensionRequestOrigin } from "@/lib/extension/cors";
import { runAuthenticatedExtensionAction } from "@/lib/extension/service";
import { extensionAuthEnabled, extensionPaidActionsEnabled } from "@/lib/extension/usage";

export function OPTIONS(request: Request) { return extensionPreflight(request); }

export async function POST(request: Request) {
  if (!isAllowedExtensionRequestOrigin(request.headers.get("origin"))) return fail(request, "ORIGIN_NOT_ALLOWED", 403);
  if (!extensionAuthEnabled() || !extensionPaidActionsEnabled()) return fail(request, "FEATURE_DISABLED", 503);
  const session = await authenticateExtensionRequest(request);
  if (!session || !session.scope.includes("extension:generate")) return fail(request, "UNAUTHORIZED", 401);
  const parsed = authenticatedActionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(request, "BAD_REQUEST", 400);

  try {
    const result = await runAuthenticatedExtensionAction({
      userId: session.userId,
      sessionId: session.id,
      request: parsed.data
    });
    if (result.outcome === "insufficient_credits") {
      return extensionJson(request, {
        error: { code: "INSUFFICIENT_CREDITS" },
        availableCredits: result.available,
        cost: result.cost
      }, { status: 402 });
    }
    if (result.outcome === "existing") {
      const code = result.status === "refunded" ? "REQUEST_ALREADY_FAILED" : "REQUEST_IN_PROGRESS";
      return fail(request, code, 409);
    }
    return extensionJson(request, {
      requestId: parsed.data.requestId,
      results: result.results,
      kitId: result.kitId,
      availableCredits: result.available,
      cost: result.cost
    });
  } catch (error) {
    const code = error instanceof Error && error.message === "FREE_POOL_UNAVAILABLE"
      ? "FREE_POOL_UNAVAILABLE"
      : "GENERATION_FAILED";
    return fail(request, code, code === "FREE_POOL_UNAVAILABLE" ? 503 : 502);
  }
}

function fail(request: Request, code: ExtensionErrorCode, status: number) {
  return extensionJson(request, { error: { code } }, { status });
}
