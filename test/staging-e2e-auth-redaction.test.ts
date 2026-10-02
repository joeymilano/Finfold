import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stagingSpecs = [
  "e2e/staging/critical-flow.spec.ts",
  "e2e/staging/credit-adjustment.spec.ts",
  "e2e/staging/low-credit.spec.ts",
  "e2e/staging/security-boundaries.spec.ts"
];

describe("staging E2E authenticated request redaction", () => {
  it.each(stagingSpecs)("keeps session cookies out of Node request diagnostics: %s", (file) => {
    const source = readFileSync(resolve(file), "utf8");
    expect(source).not.toMatch(/\b(?:page|secondary|context)\.request\b/);
  });

  it("returns only response status and body from the browser helper", () => {
    const source = readFileSync(resolve("e2e/helpers/browser-fetch.ts"), "utf8");
    expect(source).toContain("return { status: response.status, body: responseBody }");
    expect(source).not.toContain("response.headers");
  });

  it("does not retain authentication media or filled inputs on failure", () => {
    const config = readFileSync(resolve("playwright.config.ts"), "utf8");
    const authHelper = readFileSync(resolve("e2e/helpers/auth.ts"), "utf8");

    expect(config).toMatch(/name: "staging-auth"[\s\S]*?trace: "off"[\s\S]*?screenshot: "off"[\s\S]*?video: "off"/);
    expect(authHelper).toContain('await passwordInput.fill("").catch(() => undefined)');
    expect(authHelper).toContain('await emailInput.fill("").catch(() => undefined)');
  });
});
