import { describe, expect, it } from "vitest";
import { privacyPolicy } from "@/lib/legal";
import { brand } from "@/lib/brand";

describe("Chrome store privacy disclosure", () => {
  it("discloses the actual direct processors in both languages", () => {
    const section = privacyPolicy.sections.find(s => s.heading.en === "Finfold for Chrome")!;
    const en = section.paragraphs.map(p => p.en).join(" ");
    const zh = section.paragraphs.map(p => p.zh).join(" ");
    for (const provider of ["Zhipu AI/GLM", "DashScope/Qwen", "DeepSeek"]) expect(en).toContain(provider);
    for (const provider of ["智谱 AI/GLM", "DashScope/Qwen", "DeepSeek"]) expect(zh).toContain(provider);
    expect(en).toContain("anonymous generation is disabled");
    expect(en).toContain("reply drafts are not included");
    expect(en).toContain("Signed-in generated posts are saved");
    expect(brand.legal.effectiveDate).toBe("2026-09-09");
  });
});
