import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocalMockMode } from "@/lib/runtime-mode";

const originalAllowMock = process.env.ALLOW_MOCK;

afterEach(() => {
  process.env.ALLOW_MOCK = originalAllowMock;
  vi.unstubAllEnvs();
});

describe("local mock mode", () => {
  it("requires an explicit flag outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.ALLOW_MOCK = "true";
    expect(isLocalMockMode()).toBe(true);
  });

  it("is always disabled in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ALLOW_MOCK = "true";
    expect(isLocalMockMode()).toBe(false);
  });
});

