/**
 * Mock persistence exists only for deliberate local demos. Production and
 * preview deployments must never silently replace durable user data with an
 * isolate-local in-memory store.
 */
export function isLocalMockMode(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_MOCK === "true";
}

export function persistenceUnavailableMessage(feature: string): string {
  return `${feature} is temporarily unavailable because durable storage is not configured.`;
}

