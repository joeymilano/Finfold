import { getAcquisitionProperties } from "@/lib/acquisition";

export type SignupAuthMethod = "email" | "google" | "github" | "phone";
export type SignupTrafficClass = "production" | "qa";

export type PendingSignupFlow = {
  version: 1;
  flowId: string;
  authMethod: SignupAuthMethod;
  returnTo: string;
  startedAt: number;
  trafficClass: SignupTrafficClass;
};

const STORAGE_KEY = "finfold-signup-flow-v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isMethod(value: unknown): value is SignupAuthMethod {
  return value === "email" || value === "google" || value === "github" || value === "phone";
}

function createFlowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `signup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readPendingSignupFlow(now = Date.now()): PendingSignupFlow | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSignupFlow>;
    const valid = parsed.version === 1
      && typeof parsed.flowId === "string"
      && isMethod(parsed.authMethod)
      && typeof parsed.returnTo === "string"
      && typeof parsed.startedAt === "number"
      && (parsed.trafficClass === "production" || parsed.trafficClass === "qa")
      && now - parsed.startedAt >= 0
      && now - parsed.startedAt <= MAX_AGE_MS;
    if (valid) return parsed as PendingSignupFlow;
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Funnel instrumentation must never block authentication.
  }
  return null;
}

export function rememberPendingSignupFlow(
  authMethod: SignupAuthMethod,
  returnTo: string,
  now = Date.now()
): PendingSignupFlow {
  const existing = readPendingSignupFlow(now);
  const trafficClass = getAcquisitionProperties().traffic_class === "qa" ? "qa" : "production";
  const flow: PendingSignupFlow = existing
    ? { ...existing, authMethod, returnTo, trafficClass }
    : { version: 1, flowId: createFlowId(), authMethod, returnTo, startedAt: now, trafficClass };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(flow));
  } catch {
    // Funnel instrumentation must never block authentication.
  }
  return flow;
}

export function consumePendingSignupFlow(now = Date.now()): PendingSignupFlow | null {
  const flow = readPendingSignupFlow(now);
  if (!flow || typeof window === "undefined") return flow;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Funnel instrumentation must never block authentication.
  }
  return flow;
}
