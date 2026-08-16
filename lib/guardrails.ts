import { z } from "zod";
import { industryPackIdSchema, type IndustryPackId } from "@/lib/industry-rules/pack-id";

export const guardrailRuleSchema = z.object({
  title: z.string().min(1).max(80),
  titleEn: z.string().max(80).default(""),
  detail: z.string().min(1).max(500),
  detailEn: z.string().max(500).default(""),
  type: z.enum(["avoid", "required", "tone", "legal"])
});

export type GuardrailRule = z.infer<typeof guardrailRuleSchema>;

export const customGuardrailsSchema = z.array(guardrailRuleSchema).max(50);

export const guardrailsStateSchema = z.object({
  rules: customGuardrailsSchema.default([]),
  enabledPacks: z.array(industryPackIdSchema).default([])
});

export type GuardrailsState = z.infer<typeof guardrailsStateSchema>;

const STORAGE_KEY = "finfold-custom-guardrails";
const PACKS_STORAGE_KEY = "finfold-enabled-industry-packs";

/** localStorage fallback for unauthenticated/offline use — mirrors the
 * brand-brain pattern, with the server (see app/api/guardrails/route.ts)
 * as the source of truth once the user is signed in. */
export function getStoredCustomGuardrails(): GuardrailRule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return customGuardrailsSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function getStoredEnabledPacks(): IndustryPackId[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PACKS_STORAGE_KEY);
    if (!raw) return [];
    return z.array(industryPackIdSchema).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveStoredCustomGuardrails(rules: GuardrailRule[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function saveStoredEnabledPacks(packIds: IndustryPackId[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PACKS_STORAGE_KEY, JSON.stringify(packIds));
}

export async function loadPersistedCustomGuardrails(): Promise<{ rules: GuardrailRule[]; enabledPacks: IndustryPackId[]; persisted: boolean }> {
  const response = await fetch("/api/guardrails", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Custom guardrails are not available.");
  }
  const data = (await response.json()) as { rules?: GuardrailRule[]; enabledPacks?: IndustryPackId[]; persisted?: boolean };
  const rules = customGuardrailsSchema.parse(data.rules ?? []);
  const enabledPacks = z.array(industryPackIdSchema).parse(data.enabledPacks ?? []);
  saveStoredCustomGuardrails(rules);
  saveStoredEnabledPacks(enabledPacks);
  return { rules, enabledPacks, persisted: Boolean(data.persisted) };
}

export async function savePersistedCustomGuardrails(
  rules: GuardrailRule[],
  enabledPacks?: IndustryPackId[]
): Promise<{ rules: GuardrailRule[]; enabledPacks: IndustryPackId[]; persisted: boolean }> {
  const parsedRules = customGuardrailsSchema.parse(rules);
  const parsedPacks = enabledPacks ? z.array(industryPackIdSchema).parse(enabledPacks) : getStoredEnabledPacks();
  saveStoredCustomGuardrails(parsedRules);
  saveStoredEnabledPacks(parsedPacks);

  const response = await fetch("/api/guardrails", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: parsedRules, enabledPacks: parsedPacks })
  });
  if (!response.ok) {
    throw new Error("Custom guardrails could not be saved to your account.");
  }

  const data = (await response.json()) as { rules?: GuardrailRule[]; enabledPacks?: IndustryPackId[]; persisted?: boolean };
  const savedRules = customGuardrailsSchema.parse(data.rules ?? parsedRules);
  const savedPacks = z.array(industryPackIdSchema).parse(data.enabledPacks ?? parsedPacks);
  saveStoredCustomGuardrails(savedRules);
  saveStoredEnabledPacks(savedPacks);
  return { rules: savedRules, enabledPacks: savedPacks, persisted: Boolean(data.persisted) };
}
