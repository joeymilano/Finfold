import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLastAgentSession,
  LAST_AGENT_SESSION_KEY,
  readLastAgentSessionId,
  rememberLastAgentSession
} from "@/lib/agent/session-restore";

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
});

describe("Agent session restore pointer", () => {
  it("keeps the existing storage key so current users keep their conversation", () => {
    expect(LAST_AGENT_SESSION_KEY).toBe("finfold-global-agent-session-v1");
  });

  it("remembers and clears the latest conversation id", () => {
    expect(readLastAgentSessionId()).toBeNull();

    rememberLastAgentSession("9ac4df8b-4aab-489f-998d-6fb3156fa20d");
    expect(readLastAgentSessionId()).toBe("9ac4df8b-4aab-489f-998d-6fb3156fa20d");

    clearLastAgentSession();
    expect(readLastAgentSessionId()).toBeNull();
  });
});
