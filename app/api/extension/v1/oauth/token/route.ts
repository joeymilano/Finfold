import { extensionJson, extensionPreflight, isAllowedExtensionRequestOrigin } from "@/lib/extension/cors";
import { exchangeAuthorizationCode, oauthTokenSchema, refreshExtensionSession } from "@/lib/extension/oauth";
import { extensionAuthEnabled } from "@/lib/extension/usage";

export function OPTIONS(request: Request) { return extensionPreflight(request); }

export async function POST(request: Request) {
  if (!isAllowedExtensionRequestOrigin(request.headers.get("origin"))) {
    return extensionJson(request, { error: { code: "ORIGIN_NOT_ALLOWED" } }, { status: 403 });
  }
  if (!extensionAuthEnabled()) {
    return extensionJson(request, { error: { code: "FEATURE_DISABLED" } }, { status: 503 });
  }
  const parsed = oauthTokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return extensionJson(request, { error: { code: "BAD_REQUEST" } }, { status: 400 });

  const tokens = parsed.data.grantType === "authorization_code"
    ? await exchangeAuthorizationCode(parsed.data)
    : await refreshExtensionSession(parsed.data.refreshToken);
  if (!tokens) return extensionJson(request, { error: { code: "UNAUTHORIZED" } }, { status: 401 });
  return extensionJson(request, tokens);
}
