import { beforeEach, describe, expect, it } from "vitest";
import {
  consumePendingSignupFlow,
  readPendingSignupFlow,
  rememberPendingSignupFlow
} from "@/lib/auth-funnel";

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value)
    }
  });
  window.history.replaceState({}, "", "/");
});

describe("signup funnel handoff", () => {
  it("keeps one anonymous flow id while the visitor changes auth method", () => {
    const email = rememberPendingSignupFlow("email", "/dashboard", 1_000);
    const google = rememberPendingSignupFlow("google", "/operations/account-health", 2_000);

    expect(google.flowId).toBe(email.flowId);
    expect(google.startedAt).toBe(1_000);
    expect(google.authMethod).toBe("google");
    expect(google.returnTo).toBe("/operations/account-health");
    expect(google.trafficClass).toBe("qa");
  });

  it("keeps QA classification on the handoff that reaches the server callback", () => {
    window.history.replaceState({}, "", "/?utm_medium=qa&utm_campaign=posthog_production_validation");
    const flow = rememberPendingSignupFlow("google", "/dashboard", 1_000);

    expect(flow.trafficClass).toBe("qa");
  });

  it("consumes the pending flow once the authenticated destination is reached", () => {
    const flow = rememberPendingSignupFlow("email", "/dashboard", 1_000);
    expect(consumePendingSignupFlow(2_000)).toEqual(flow);
    expect(readPendingSignupFlow(2_000)).toBeNull();
  });

  it("drops stale flows instead of attributing an unrelated later login", () => {
    rememberPendingSignupFlow("github", "/dashboard", 1_000);
    expect(readPendingSignupFlow(8 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});
