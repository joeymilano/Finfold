/**
 * Keep auth callbacks on the deployment the user is actually visiting.
 *
 * OpenNext can expose its internal loopback origin (localhost) through
 * request.url even when the public request reached a Worker hostname. In a
 * production build, use the fail-closed deployment URL for that specific
 * adapter shape; otherwise the request origin remains authoritative.
 */
export function getAuthCallbackUrl(
  request: Request,
  environment: { appUrl?: string; deploymentEnv?: string } = {
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    deploymentEnv: process.env.FINFOLD_DEPLOYMENT_ENV
  },
  returnTo?: string | null
): string {
  const requestOrigin = new URL(request.url).origin;
  const requestHost = new URL(requestOrigin).hostname;
  const isLoopback = requestHost === "localhost" || requestHost === "127.0.0.1" || requestHost === "::1" || requestHost === "[::1]";
  const isDeployed = environment.deploymentEnv === "staging" || environment.deploymentEnv === "production";

  if (isLoopback && isDeployed) {
    const configuredOrigin = parseHttpsOrigin(environment.appUrl);
    if (configuredOrigin) return callbackWithReturnTo(configuredOrigin, returnTo);
  }

  return callbackWithReturnTo(requestOrigin, returnTo);
}

function callbackWithReturnTo(origin: string, returnTo?: string | null): string {
  const callback = new URL("/auth/callback", origin);
  if (returnTo) {
    callback.searchParams.set("next", sanitizeInternalReturnTo(returnTo));
  }
  return callback.toString();
}

function parseHttpsOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}
import { sanitizeInternalReturnTo } from "@/lib/auth-return";
