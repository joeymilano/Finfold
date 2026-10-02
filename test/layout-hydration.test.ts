import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("root hydration boundary", () => {
  it("suppresses extension-injected attribute mismatches on both document roots", () => {
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

    expect(layout).toMatch(/<html[\s\S]*?suppressHydrationWarning/);
    expect(layout).toMatch(/<body\s+suppressHydrationWarning>/);
  });
});