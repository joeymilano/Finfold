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
  returnTo?: string | null,
  auth?: {
    mode?: "login" | "signup";
    method?: string;
    signupFlowId?: string;
    trafficClass?: string;
  }
): string {
  const requestOrigin = new URL(request.url).origin;
  const requestHost = new URL(requestOrigin).hostname;
  const isLoopback = requestHost === "localhost" || requestHost === "127.0.0.1" || requestHost === "::1" || requestHost === "[::1]";
  const isDeployed = environment.deploymentEnv === "staging" || environment.deploymentEnv === "production";

  if (isLoopback && isDeployed) {
    const configuredOrigin = parseHttpsOrigin(environment.appUrl);
    if (configuredOrigin) return callbackWithReturnTo(configuredOrigin, returnTo, auth);
  }

  return callbackWithReturnTo(requestOrigin, returnTo, auth);
}

function callbackWithReturnTo(
  origin: string,
  returnTo?: string | null,
  auth?: {
    mode?: "login" | "signup";
    method?: string;
    signupFlowId?: string;
    trafficClass?: string;
  }
): string {
  const callback = new URL("/auth/callback", origin);
  if (returnTo) {
    callback.searchParams.set("next", sanitizeInternalReturnTo(returnTo));
  }
  if (auth?.mode) callback.searchParams.set("auth_mode", auth.mode);
  if (auth?.method && /^[a-z0-9_-]{1,32}$/i.test(auth.method)) {
    callback.searchParams.set("auth_method", auth.method.toLowerCase());
  }
  const signupFlowId = normalizeSignupFlowId(auth?.signupFlowId);
  const trafficClass = normalizeTrafficClass(auth?.trafficClass);
  if (signupFlowId) callback.searchParams.set("signup_flow_id", signupFlowId);
  if (trafficClass) callback.searchParams.set("traffic_class", trafficClass);
  return callback.toString();
}

export function normalizeSignupFlowId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && /^[a-z0-9-]{8,80}$/i.test(normalized) ? normalized : null;
}

export function normalizeTrafficClass(value: string | null | undefined): "production" | "qa" | null {
  return value === "production" || value === "qa" ? value : null;
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
