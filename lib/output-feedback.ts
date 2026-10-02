import { z } from "zod";

export const feedbackReasonSchema = z.enum([
  "generic",
  "off_brand",
  "weak_hook",
  "platform_fit",
  "inaccurate",
  "weak_cta"
]);

export type FeedbackReason = z.infer<typeof feedbackReasonSchema>;

export const outputFeedbackRequestSchema = z.object({
  outputId: z.string().uuid(),
  kitId: z.string().uuid(),
  rating: z.enum(["helpful", "unhelpful"]),
  reasonCodes: z.array(feedbackReasonSchema).max(3).default([]),
  note: z.string().trim().max(300).optional()
}).superRefine((value, context) => {
  if (value.rating === "unhelpful" && value.reasonCodes.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reasonCodes"],
      message: "Choose at least one reason so Finfold can learn from the feedback."
    });
  }
});

const REASON_RULES: Record<FeedbackReason, string> = {
  generic: "Avoid generic claims and template-like phrasing; use specific details from the source signal.",
  off_brand: "Stay closer to the user's established brand voice, vocabulary, and positioning.",
  weak_hook: "Strengthen the opening hook before expanding the body; make the first lines earn attention.",
  platform_fit: "Follow the selected platform's native structure, culture, and interaction pattern more closely.",
  inaccurate: "Do not infer unsupported facts, capabilities, customer claims, or metrics from incomplete context.",
  weak_cta: "Use one concrete, low-friction CTA that matches the content goal and audience intent."
};

export function feedbackRule(platform: string, reason: FeedbackReason): string {
  return `[Explicit feedback] ${platform}: ${REASON_RULES[reason]}`;
}

export function mergeFeedbackRules(existing: string[], rules: string[], limit = 5): string[] {
  const normalized = new Map<string, string>();
  for (const rule of [...existing, ...rules]) {
    const trimmed = rule.trim();
    if (trimmed) normalized.set(trimmed.toLocaleLowerCase(), trimmed);
  }
  return [...normalized.values()].slice(-limit);
}

export function mergeApprovedExample(existing: string[], example: string, limit = 5): string[] {
  const trimmed = example.trim().slice(0, 500);
  if (!trimmed) return existing.slice(-limit);
  const withoutDuplicate = existing.filter((item) => item.trim().toLocaleLowerCase() !== trimmed.toLocaleLowerCase());
  return [...withoutDuplicate, trimmed].slice(-limit);
}
