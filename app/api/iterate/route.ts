export const runtime = "edge";

import { NextResponse } from "next/server";
import { iterateRequestSchema, type IterationReport } from "@/lib/content-schema";
import { saveMockIterationReport } from "@/lib/mock-store";
import { getPlatform } from "@/lib/platforms";

export async function POST(request: Request) {
  try {
    const input = iterateRequestSchema.parse(await request.json());
    const sorted = [...input.metrics].sort((a, b) => score(b) - score(a));
    const best = sorted[0];
    const weakest = sorted[sorted.length - 1];
    const isZh = input.language === "zh";

    const report: IterationReport = {
      id: crypto.randomUUID(),
      kitId: input.kitId,
      summary: isZh
        ? `已分析 ${input.metrics.length} 个平台的数据。下一轮应放大高互动平台的叙事结构，并修正低点击平台的 hook 与 CTA。`
        : `Analyzed ${input.metrics.length} platform records. Next round should amplify the best-performing narrative and fix low-click hooks and CTAs.`,
      wins: best ? [
        isZh ? `${getPlatform(best.platform).label} 当前综合表现最好，互动/线索信号最强。` : `${getPlatform(best.platform).label} is currently the strongest channel by engagement and lead signal.`
      ] : [isZh ? "先录入至少一个平台的数据，系统才能判断赢家。" : "Add at least one platform metric record to identify the winner."],
      problems: weakest ? [
        isZh ? `${getPlatform(weakest.platform).label} 需要检查标题承诺、首屏 hook 和 CTA 是否过弱。` : `${getPlatform(weakest.platform).label} needs a stronger promise, opening hook, and CTA.`
      ] : [isZh ? "还没有足够数据判断问题。" : "There is not enough data to diagnose weak spots yet."],
      nextActions: [
        isZh ? "把高表现平台的 hook 改写成 3 个变体，用于下一轮测试。" : "Turn the winning hook into 3 variants for the next test.",
        isZh ? "低点击平台优先改标题和前两行，不要先改长正文。" : "For low-click channels, fix the title and first two lines before rewriting the full body.",
        isZh ? "把带来私信/注册的平台升级为下次默认首发渠道。" : "Promote channels that create messages or signups into the next default launch set."
      ],
      createdAt: new Date().toISOString()
    };

    saveMockIterationReport(report);
    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create iteration report." }, { status: 400 });
  }
}

function score(metric: { impressions: number; clicks: number; likes: number; comments: number; saves: number; shares: number; leads: number; signups: number; revenue: number }) {
  return metric.clicks * 2 + metric.likes + metric.comments * 3 + metric.saves * 2 + metric.shares * 3 + metric.leads * 8 + metric.signups * 10 + metric.revenue;
}
