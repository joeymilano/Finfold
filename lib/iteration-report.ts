import { z } from "zod";
import type { IterateRequest } from "@/lib/content-schema";
import type { IterationReport } from "@/lib/content-schema";
import { getPlatform } from "@/lib/platforms";
import { sendRawPrompt } from "@/lib/llm";

const llmReportSchema = z.object({
  summary: z.string().min(1),
  wins: z.array(z.string().min(1)).min(1),
  problems: z.array(z.string().min(1)).min(1),
  nextActions: z.array(z.string().min(1)).min(1)
});

function buildIterationPrompt(input: IterateRequest): string {
  const isZh = input.language === "zh";
  const metricsByPlatform = new Map(input.metrics.map((m) => [m.platform, m]));

  const platformSummaries = input.outputs
    .map((output) => {
      const platform = getPlatform(output.platform);
      const metric = metricsByPlatform.get(output.platform);
      const metricLine = metric
        ? `impressions=${metric.impressions}, views=${metric.views}, coverClickRate=${metric.coverClickRate}%, averageViewSeconds=${metric.averageViewSeconds}, linkClicks=${metric.clicks}, likes=${metric.likes}, comments=${metric.comments}, saves=${metric.saves}, shares=${metric.shares}, profileVisits=${metric.profileVisits}, followerGrowth=${metric.followerGrowth}, leads=${metric.leads}, signups=${metric.signups}, revenue=${metric.revenue}`
        : "no performance data recorded yet";
      return `--- ${platform.label} (${output.platform}) ---\nTitle: ${output.title}\nBody: ${output.body.slice(0, 600)}\nCTA: ${output.cta}\nMetrics: ${metricLine}`;
    })
    .join("\n\n");

  return `You are a senior growth strategist reviewing one content kit's real performance data across platforms, to produce a genuine iteration report — not generic advice, specific to what actually happened.

Product context: ${input.ideaText}

${platformSummaries}

Write a report as STRICT JSON matching this shape, no markdown fences, no commentary:
{
  "summary": "2-3 sentences synthesizing what happened across all platforms and the single highest-leverage change for next time",
  "wins": ["1-3 specific things that worked, citing the actual platform/metric/copy choice that drove it"],
  "problems": ["1-3 specific things that underperformed, citing the actual platform/metric/copy choice that hurt it"],
  "nextActions": ["3-5 concrete actions for one controlled next-cycle experiment. Include three materially different hook/cover variants, name the one metric to watch, and state what stays constant."]
}

${isZh ? "Write the report in Chinese." : "Write the report in English."}
Ground every claim in the actual data and copy above. Diagnose the funnel in order: distribution → cover click → retention → saves/shares → profile/follower conversion. Fix the earliest evidenced bottleneck and do not recommend changing every stage at once. For Xiaohongshu, prefer a 3:4 native carousel, one takeaway per slide, and cropped/enlarged/annotated product screenshots rather than a full landscape screenshot. If a platform has no performance data, say so explicitly rather than inventing a signal.`;
}

/**
 * Real LLM-authored iteration report (Growth+ feature — see plan §4
 * "伪 AI 诚实化"). Unlike the heuristic report in app/api/iterate/route.ts
 * (a deterministic score() ranking with templated sentences), this asks an
 * LLM to actually read the kit's copy alongside its metrics and synthesize
 * specific, grounded feedback.
 *
 * Throws on failure — the caller falls back to the heuristic report, so a
 * transient LLM failure degrades gracefully instead of blocking the feature
 * entirely.
 */
export async function buildLLMIterationReport(input: IterateRequest): Promise<Omit<IterationReport, "id" | "kitId" | "createdAt">> {
  const raw = await sendRawPrompt(buildIterationPrompt(input));
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = llmReportSchema.parse(JSON.parse(cleaned));
  return parsed;
}
