import { extensionJson, extensionPreflight, isAllowedExtensionRequestOrigin } from "@/lib/extension/cors";
import { authenticateExtensionRequest } from "@/lib/extension/auth";
import { extensionAuthEnabled } from "@/lib/extension/usage";
import { growthLoopEnabled } from "@/lib/growth-loop/contracts";
import { listExtensionGrowthTasks } from "@/lib/extension/growth-tasks";
import { createSupabaseAdminClient } from "@/lib/supabase";

export async function OPTIONS(request: Request) {
  return extensionPreflight(request);
}

export async function GET(request: Request) {
  if (!isAllowedExtensionRequestOrigin(request.headers.get("origin"))) {
    return extensionJson(request, { error: "Forbidden origin." }, { status: 403 });
  }
  if (!extensionAuthEnabled()) {
    return extensionJson(request, { error: "Extension access is disabled.", code: "SERVICE_DISABLED" }, { status: 503 });
  }
  const session = await authenticateExtensionRequest(request);
  if (!session) {
    return extensionJson(request, { error: "Sign in to use the publish assistant.", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!growthLoopEnabled(session.userId)) {
    return extensionJson(request, { tasks: [], featureEnabled: false });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return extensionJson(request, { error: "Growth tasks require durable storage." }, { status: 503 });
  }
  try {
    const tasks = await listExtensionGrowthTasks(admin, session.userId, {
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
    });
    return extensionJson(request, { tasks, featureEnabled: true });
  } catch (error) {
    return extensionJson(
      request,
      { error: error instanceof Error ? error.message : "Unable to load growth tasks." },
      { status: 500 }
    );
  }
}
