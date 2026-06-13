import { describe, expect, it } from "vitest";
import { kitOutputSchema } from "@/lib/content-schema";

describe("content kit output schema", () => {
  it("accepts complete platform output", () => {
    const output = kitOutputSchema.parse({
      platform: "x",
      title: "One idea should not become one post.",
      body: "Turn it into a platform-native content kit.",
      cta: "Book a strategy call.",
      notes: "Keep it concise.",
      strategy: "Sharp hook for public iteration."
    });

    expect(output.platform).toBe("x");
    expect(output.locked).toBe(false);
    expect(output.publishStatus).toBe("draft");
  });

  it("rejects outputs without CTA", () => {
    expect(() =>
      kitOutputSchema.parse({
        platform: "linkedin",
        title: "Founder post",
        body: "Body",
        notes: "Note",
        strategy: "Strategy"
      })
    ).toThrow();
  });
});
