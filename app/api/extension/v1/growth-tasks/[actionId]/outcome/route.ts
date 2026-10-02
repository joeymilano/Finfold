import { extensionJson, extensionPreflight, isAllowedExtensionRequestOrigin } from "@/lib/extension/cors";
import { authenticateExtensionRequest } from "@/lib/extension/auth";
import { extensionAuthEnabled } from "@/lib/extension/usage";
import { growthLoopEnabled } from "@/lib/growth-loop/contracts";
import {
  extensionGrowthTaskOutcomeSchema,
  reportExtensionGrowthTaskOutcome
} from "@/lib/extension/growth-tasks";
import { createSupabaseAdminClient } from "@/lib/supabase";

export async function OPTIONS(request: Request) {
  return extensionPreflight(request);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ actionId: string }> }
) {
  if (!isAllowedExtensionRequestOrigin(request.headers.get("origin"))) {
    return extensionJson(request, { error: "Forbidden origin." }, { status: 403 });
  }
  if (!extensionAuthEnabled()) {
    return extensionJson(request, { error: "Extension access is disabled.", code: "SERVICE_DISABLED" }, { status: 503 });
  }
  const session = await authenticateExtensionRequest(request);
  if (!session) {
    return extensionJson(request, { error: "Sign in to report the task outcome.", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!growthLoopEnabled(session.userId)) {
    return extensionJson(request, { error: "Growth loop is not enabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return extensionJson(request, { error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = extensionGrowthTaskOutcomeSchema.safeParse(input);
  if (!parsed.success) {
    return extensionJson(request, { error: "Invalid task outcome report." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return extensionJson(request, { error: "Growth tasks require durable storage." }, { status: 503 });
  }
  try {
    const { actionId } = await params;
    const result = await reportExtensionGrowthTaskOutcome(admin, session.userId, actionId, parsed.data);
    if (result.outcome === "not_found") {
      return extensionJson(request, { error: "Task not found." }, { status: 404 });
    }
    if (result.outcome === "rejected") {
      return extensionJson(request, { error: result.reason, code: "TASK_REJECTED" }, { status: 409 });
    }
    return extensionJson(request, { result: result.outcome, replayed: result.outcome === "confirmed" ? result.replayed : false });
  } catch (error) {
    return extensionJson(
      request,
      { error: error instanceof Error ? error.message : "Unable to report the task outcome." },
      { status: 500 }
    );
  }
}
