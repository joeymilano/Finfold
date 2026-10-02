import { extensionJson, extensionPreflight, isAllowedExtensionRequestOrigin } from "@/lib/extension/cors";
import { revokeExtensionSession } from "@/lib/extension/oauth";
import { extensionAuthEnabled } from "@/lib/extension/usage";

export function OPTIONS(request: Request) { return extensionPreflight(request); }

export async function POST(request: Request) {
  if (!isAllowedExtensionRequestOrigin(request.headers.get("origin"))) {
    return extensionJson(request, { error: { code: "ORIGIN_NOT_ALLOWED" } }, { status: 403 });
  }
  if (!extensionAuthEnabled()) {
    return extensionJson(request, { error: { code: "FEATURE_DISABLED" } }, { status: 503 });
  }
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!/^ff_ext_[ar]_[a-f0-9]{64}$/i.test(token)) {
    return extensionJson(request, { error: { code: "BAD_REQUEST" } }, { status: 400 });
  }
  await revokeExtensionSession(token);
  return extensionJson(request, { revoked: true });
}
