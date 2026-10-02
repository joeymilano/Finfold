import { beforeEach, describe, expect, it } from "vitest";
import { readEmailConfirmation, rememberEmailConfirmation } from "@/lib/signup-confirmation";
import { readFirstTaskDraft, saveFirstTaskDraft, firstTaskHref, FIRST_TASK_MAX_AGE_MS } from "@/lib/first-task";

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }, clear: () => values.clear()
  } });
});
describe("auth handoff persistence", () => {
  it("keeps the provider cooldown after remount and distinguishes unsent email from confirmation pending", () => {
    rememberEmailConfirmation("User@example.com", 60, false, 1000);
    expect(readEmailConfirmation("user@example.com", 16000)).toEqual({ seconds: 45, pending: false });
    expect(readEmailConfirmation("another@example.com", 16000)).toBeNull();
    rememberEmailConfirmation("user@example.com", 60, true, 1000);
    expect(readEmailConfirmation("user@example.com", 62000)).toEqual({ seconds: 0, pending: true });
  });
  it("round-trips real source and platforms without putting text into URLs", () => {
    const draft = { id: "dcd384a8-49ac-4d0e-ac59-6f71db5197ef", text: "Private customer launch details", platforms: ["x", "linkedin"] as ["x", "linkedin"], locale: "en" as const, savedAt: 1000 };
    expect(saveFirstTaskDraft(draft)).toBe(true);
    expect(readFirstTaskDraft(draft.id, 2000)).toEqual(draft);
    expect(firstTaskHref(draft.id)).not.toContain(draft.text);
    expect(readFirstTaskDraft("wrong", 2000)).toBeNull();
    expect(readFirstTaskDraft(draft.id, FIRST_TASK_MAX_AGE_MS + 1001)).toBeNull();
  });
});
