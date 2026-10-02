import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isEnglishPathname } from "@/lib/locale-routing";

describe("localized document language", () => {
  it("recognizes only the dedicated English route tree", () => {
    expect(isEnglishPathname("/en")).toBe(true);
    expect(isEnglishPathname("/en/use-cases/ai-marketing-for-founders")).toBe(true);
    expect(isEnglishPathname("/english")).toBe(false);
    expect(isEnglishPathname("/privacy")).toBe(false);
  });

  it("rewrites the served English document root without making Next pages dynamic", () => {
    const worker = readFileSync(join(process.cwd(), "worker.ts"), "utf8");
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

    expect(worker).toContain("fetchWithLocalizedDocumentLanguage");
    expect(worker).toContain('element.setAttribute("lang", "en")');
    expect(layout).not.toContain('from "next/headers"');
  });
});
