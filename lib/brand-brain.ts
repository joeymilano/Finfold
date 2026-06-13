import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Brand Brain schema                                                */
/* ------------------------------------------------------------------ */

export const brandBrainSchema = z.object({
  brandName: z.string().max(60).default(""),
  productDescription: z.string().max(500).default(""),
  targetAudience: z.string().max(300).default(""),
  toneKeywords: z.array(z.string().max(20)).max(10).default([]),
  bannedPhrases: z.array(z.string().max(40)).max(20).default([]),
  approvedExamples: z.array(z.string().max(500)).max(5).default([]),
  competitors: z.array(z.string().max(40)).max(10).default([]),
  positioningStatement: z.string().max(300).default(""),
});

export type BrandBrain = z.infer<typeof brandBrainSchema>;

const STORAGE_KEY = "finfold-brand-brain";

/* ------------------------------------------------------------------ */
/*  localStorage CRUD                                                 */
/* ------------------------------------------------------------------ */

export function getBrandBrain(): BrandBrain {
  if (typeof window === "undefined") return brandBrainSchema.parse({});
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return brandBrainSchema.parse(JSON.parse(raw));
  } catch {
    /* corrupted storage — fall through */
  }
  return brandBrainSchema.parse({});
}

export function saveBrandBrain(brain: BrandBrain): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(brain));
}

export async function loadPersistedBrandBrain(): Promise<{ brain: BrandBrain; persisted: boolean }> {
  const response = await fetch("/api/brand-brain", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Brand Brain is not available.");
  }
  const data = (await response.json()) as { brain?: BrandBrain; persisted?: boolean };
  const brain = brandBrainSchema.parse(data.brain ?? {});
  saveBrandBrain(brain);
  return { brain, persisted: Boolean(data.persisted) };
}

export async function savePersistedBrandBrain(brain: BrandBrain): Promise<{ brain: BrandBrain; persisted: boolean }> {
  const parsed = brandBrainSchema.parse(brain);
  saveBrandBrain(parsed);

  const response = await fetch("/api/brand-brain", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed)
  });
  if (!response.ok) {
    throw new Error("Brand Brain could not be saved to your account.");
  }

  const data = (await response.json()) as { brain?: BrandBrain; persisted?: boolean };
  const saved = brandBrainSchema.parse(data.brain ?? parsed);
  saveBrandBrain(saved);
  return { brain: saved, persisted: Boolean(data.persisted) };
}

/* ------------------------------------------------------------------ */
/*  Completeness score                                                */
/* ------------------------------------------------------------------ */

export function getBrainCompleteness(brain: BrandBrain): number {
  const fields = [
    brain.brandName,
    brain.productDescription,
    brain.targetAudience,
    brain.positioningStatement,
    brain.toneKeywords.length > 0 ? "filled" : "",
    brain.bannedPhrases.length > 0 ? "filled" : "",
  ];
  const filled = fields.filter((f) => f.trim().length > 0).length;
  return Math.round((filled / fields.length) * 100);
}

/* ------------------------------------------------------------------ */
/*  Prompt injection helper                                           */
/* ------------------------------------------------------------------ */

export function buildBrainPromptSection(brain: BrandBrain): string {
  if (!brain.brandName && !brain.productDescription) return "";

  const sections: string[] = [];

  if (brain.brandName) sections.push(`Brand: ${brain.brandName}`);
  if (brain.productDescription) sections.push(`Product: ${brain.productDescription}`);
  if (brain.targetAudience) sections.push(`Target Audience: ${brain.targetAudience}`);
  if (brain.positioningStatement) sections.push(`Positioning: ${brain.positioningStatement}`);
  if (brain.toneKeywords.length) sections.push(`Tone Keywords: ${brain.toneKeywords.join(", ")}`);
  if (brain.bannedPhrases.length) sections.push(`User Banned Phrases: ${brain.bannedPhrases.join(", ")}`);
  if (brain.competitors.length) sections.push(`Competitors (differentiate from): ${brain.competitors.join(", ")}`);

  if (brain.approvedExamples.length > 0) {
    sections.push(
      `Approved Style Examples:\n${brain.approvedExamples.map((e, i) => `[${i + 1}]: ${e.slice(0, 300)}`).join("\n")}`,
    );
  }

  return `
=== BRAND BRAIN (product identity — apply consistently in every output) ===
${sections.join("\n")}
`;
}
