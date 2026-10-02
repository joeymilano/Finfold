import { describe, expect, it, vi } from "vitest";

describe("store build flag", () => {
  it("defaults to the pilot build", async () => {
    const { STORE_BUILD } = await import("./flags");
    expect(STORE_BUILD).toBe(false);
  });
  it("flips when VITE_STORE_BUILD is set at build time", async () => {
    vi.stubEnv("VITE_STORE_BUILD", "1");
    try {
      vi.resetModules();
      const { STORE_BUILD } = await import("./flags");
      expect(STORE_BUILD).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
