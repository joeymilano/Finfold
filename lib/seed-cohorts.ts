import { z } from "zod";

export const seedCohortRequestSchema = z.object({
  batchLabel: z.string().trim().min(2).max(60),
  count: z.number().int().min(1).max(50),
  plan: z.enum(["starter", "pro", "growth", "employee"]),
  durationDays: z.number().int().min(1).max(90),
  expiresInDays: z.number().int().min(1).max(90).optional()
});

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateActivationCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const token = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  return `FF-${token.slice(0, 4)}-${token.slice(4)}`;
}

export function generateActivationCodes(count: number): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateActivationCode());
  return [...codes];
}
