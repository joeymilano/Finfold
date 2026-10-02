import { z } from "zod";

export const FIRST_TASK_ENTRY = "/workbench?start=1";
export const FIRST_TASK_STORAGE_KEY = "finfold-first-task-v1";
export const FIRST_TASK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const firstTaskPlatforms = ["xiaohongshu", "wechat", "x", "linkedin"] as const;
const draftSchema = z.object({
  id: z.string().uuid(),
  kitId: z.string().uuid().optional(),
  text: z.string().max(12_000),
  platforms: z.array(z.enum(firstTaskPlatforms)).length(2).refine((v) => new Set(v).size === 2),
  locale: z.enum(["zh", "en"]),
  savedAt: z.number().finite()
});
export type FirstTaskDraft = z.infer<typeof draftSchema>;

export function firstTaskHref(id: string): string {
  return `${FIRST_TASK_ENTRY}&draft=${encodeURIComponent(id)}`;
}

export function readFirstTaskDraft(expectedId?: string | null, now = Date.now()): FirstTaskDraft | null {
  try {
    const result = draftSchema.safeParse(JSON.parse(window.localStorage.getItem(FIRST_TASK_STORAGE_KEY) ?? "null"));
    if (!result.success || now < result.data.savedAt || now - result.data.savedAt > FIRST_TASK_MAX_AGE_MS) return null;
    return expectedId && result.data.id !== expectedId ? null : result.data;
  } catch { return null; }
}

export function saveFirstTaskDraft(draft: FirstTaskDraft): boolean {
  try {
    window.localStorage.setItem(FIRST_TASK_STORAGE_KEY, JSON.stringify(draftSchema.parse(draft)));
    return true;
  } catch { return false; }
}

/** Only an opaque task id crosses into analytics; source text stays in the draft. */
export function currentFirstTaskId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  if (params.get("start") !== "1") return undefined;
  return readFirstTaskDraft(params.get("draft"))?.id;
}
