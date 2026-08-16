import type { GrowthMission } from "@/lib/agent/growth-missions";
import type { KitOutput } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import { buildContentSkillPlan, type ContentSkillPlan } from "@/lib/content-skills";
import { cleanContentTitle, isUsableContentTitle } from "@/lib/content-title";

export type ContentReadinessDimension = {
  key: "hook" | "payoff" | "value" | "evidence" | "conversion" | "readability";
  label: string;
  score: number;
  reason: string;
  action: string;
};

export type ContentReadinessReport = {
  score: number;
  status: "ready" | "needs-work" | "blocked";
  headline: string;
  primaryBlocker: ContentReadinessDimension;
  dimensions: ContentReadinessDimension[];
  skillPlan: ContentSkillPlan;
};

type MissionInput = Pick<GrowthMission, "primaryMetricKey" | "primaryMetric" | "hypothesis">;

export function assessContentReadiness(
  output: Pick<KitOutput, "platform" | "title" | "body" | "finalBody" | "cta">,
  locale: Locale,
  mission?: MissionInput | null
): ContentReadinessReport {
  const isZh = locale === "zh";
  const body = (output.finalBody || output.body).trim();
  const title = isUsableContentTitle(output.title) ? cleanContentTitle(output.title) : "";
  const cta = output.cta.trim();
  const skillPlan = buildContentSkillPlan(output, locale, mission);
  const dimensions = output.platform === "xiaohongshu"
    ? assessXhs(title, body, cta, locale)
    : output.platform === "wechat" || output.platform === "zhihu" || output.platform === "medium-substack"
      ? assessArticle(title, body, cta, locale)
      : assessGeneric(title, body, cta, locale);

  const missionWeight = missionDimensionKey(mission?.primaryMetricKey);
  const score = Math.round(dimensions.reduce((sum, dimension) => {
    const weight = dimension.key === missionWeight ? 2 : 1;
    return sum + dimension.score * weight;
  }, 0) / dimensions.reduce((sum, dimension) => sum + (dimension.key === missionWeight ? 2 : 1), 0));
  const primaryBlocker = [...dimensions].sort((a, b) => {
    if (a.key === missionWeight && b.key !== missionWeight) return -1;
    if (b.key === missionWeight && a.key !== missionWeight) return 1;
    return a.score - b.score;
  })[0];
  const status = score >= 80 && dimensions.every((dimension) => dimension.score >= 55)
    ? "ready"
    : score < 55 || dimensions.some((dimension) => dimension.score < 35)
      ? "blocked"
      : "needs-work";

  return {
    score,
    status,
    headline: status === "ready"
      ? (isZh ? "达到发布前质量线" : "Ready for the pre-publish gate")
      : status === "blocked"
        ? (isZh ? `先修「${primaryBlocker.label}」再发布` : `Fix “${primaryBlocker.label}” before publishing`)
        : (isZh ? `再补强「${primaryBlocker.label}」` : `Strengthen “${primaryBlocker.label}”`),
    primaryBlocker,
    dimensions,
    skillPlan
  };
}

function assessXhs(title: string, body: string, cta: string, locale: Locale): ContentReadinessDimension[] {
  const isZh = locale === "zh";
  const firstScreen = Array.from(body.replace(/\s+/g, "")).slice(0, 120).join("");
  const titleLength = Array.from(title).length;
  const hasConcreteHook = /\d|设计师|产品经理|创始人|团队|用户|客户|截图|页面|功能|流程|场景|天|周|月|小时|分钟|%|vs|before|after/iu.test(title);
  const hookScore = clamp((titleLength <= 22 ? 35 : 12) + (titleLength >= 7 ? 20 : 8) + (hasConcreteHook ? 35 : 10) + (/[?？!！]|真相|反而|别再|为什么|只会|不会|失败|焦虑/u.test(title) ? 10 : 0));
  const payoffScore = clamp(
    (firstScreen.length >= 35 ? 30 : 12)
    + (/(因为|答案|先说结论|我发现|真正|问题是|结果|第一步|先做|核心)/u.test(firstScreen) ? 35 : 12)
    + (paragraphCount(body) >= 3 ? 25 : 10)
    + (averageParagraphLength(body) <= 90 ? 10 : 0)
  );
  const valueScore = clamp(
    (/(清单|模板|步骤|方法|对比|前后|避坑|检查|公式|框架|拿走|保存|复用)/u.test(body) ? 45 : 15)
    + (listItemCount(body) >= 3 ? 35 : listItemCount(body) > 0 ? 22 : 8)
    + (body.length >= 180 ? 20 : 8)
  );
  const evidenceScore = clamp(
    (/\d/.test(body) ? 28 : 10)
    + (/(截图|数据|案例|实测|结果|前后|用户|客户|版本|页面|功能|流程)/u.test(body) ? 42 : 14)
    + (/(我|我们|这次|最近|昨天|今天|上周)/u.test(body) ? 20 : 8)
    + (!/(99%|100%|暴涨|翻倍|月入|躺赚)/u.test(`${title} ${body}`) ? 10 : 0)
  );
  const conversionScore = clamp(
    (cta.length >= 12 ? 25 : 10)
    + (/(下一篇|接下来|持续|每周|系列|公开记录|关注后|会继续|更新|长期)/u.test(cta) ? 45 : 12)
    + (!/^(记得)?(点赞|收藏|关注|评论|转发)[吧哦！!]*$/u.test(cta) ? 20 : 3)
    + (/[?？]/u.test(cta) || /(试试|拿走|照着|用这个)/u.test(cta) ? 10 : 5)
  );
  const readabilityScore = clamp(
    (paragraphCount(body) >= 4 ? 35 : paragraphCount(body) >= 2 ? 22 : 8)
    + (averageParagraphLength(body) <= 90 ? 35 : averageParagraphLength(body) <= 150 ? 20 : 5)
    + (body.length <= 1400 ? 20 : 8)
    + ((body.match(/[✅❌🔥💡📌]/gu) ?? []).length <= 10 ? 10 : 3)
  );

  return [
    dimension("hook", isZh ? "封面钩子" : "Cover hook", hookScore, isZh, hookScore >= 70 ? "标题具体且适合移动端" : "标题还缺具体人群、场景或可验证承诺", "把标题改成具体读者 + 真实场景/结果"),
    dimension("payoff", isZh ? "首屏兑现" : "First-screen payoff", payoffScore, isZh, payoffScore >= 70 ? "开头能快速兑现封面承诺" : "点开后没有足够快给出答案或证据", "第二页先给结论与证据，再补背景"),
    dimension("value", isZh ? "收藏价值" : "Save value", valueScore, isZh, valueScore >= 70 ? "已有可复用信息结构" : "内容仍像观点表达，缺少可保存交付", "加入清单、模板、步骤或前后对比"),
    dimension("evidence", isZh ? "具体证据" : "Concrete evidence", evidenceScore, isZh, evidenceScore >= 70 ? "内容包含具体经验或证据" : "表达偏抽象，读者难以判断可信度", "补一个真实截图、数据、案例或过程细节"),
    dimension("conversion", isZh ? "关注理由" : "Reason to follow", conversionScore, isZh, conversionScore >= 70 ? "结尾给出了持续关注价值" : "CTA 更像一次性互动请求", "说明关注后会持续获得什么，并预告下一篇"),
    dimension("readability", isZh ? "滑读节奏" : "Swipe rhythm", readabilityScore, isZh, readabilityScore >= 70 ? "段落密度适合移动端" : "正文密度会增加滑走风险", "每 1–3 行换段，每段只做一个信息任务")
  ];
}

function assessArticle(title: string, body: string, cta: string, locale: Locale): ContentReadinessDimension[] {
  const isZh = locale === "zh";
  const opening = Array.from(body.replace(/\s+/g, "")).slice(0, 160).join("");
  const sections = (body.match(/^#{1,4}\s+.+$/gm) ?? []).length;
  const paragraphs = paragraphCount(body);
  const hook = clamp((Array.from(title).length <= 30 ? 35 : 15) + (/\d|为什么|如何|真相|方法|复盘|指南|why|how|guide|lessons/iu.test(title) ? 45 : 20) + (title.length >= 8 ? 20 : 8));
  const payoff = clamp((opening.length >= 80 ? 30 : 12) + (/(结论|核心|真正|问题|我发现|答案|thesis|here is|the problem)/iu.test(opening) ? 40 : 15) + (opening.length <= 220 ? 20 : 8) + (paragraphs >= 4 ? 10 : 4));
  const value = clamp((body.length >= 700 ? 35 : body.length >= 350 ? 25 : 10) + (sections >= 2 ? 30 : 12) + (listItemCount(body) >= 3 ? 25 : 12) + (/(方法|步骤|框架|清单|template|framework|steps)/iu.test(body) ? 10 : 4));
  const evidence = clamp((/\d/.test(body) ? 30 : 12) + (/(数据|案例|截图|引用|来源|实测|benchmark|case|source|evidence)/iu.test(body) ? 45 : 15) + (body.length >= 600 ? 15 : 7) + (!/(99%|100%|暴涨|翻倍|revolutionary|game-changing)/iu.test(body) ? 10 : 2));
  const conversion = clamp((cta.length >= 12 ? 35 : 15) + (/(订阅|回复|分享|转发|下一篇|继续|subscribe|reply|share|next)/iu.test(cta) ? 45 : 20) + (cta.length <= 120 ? 20 : 8));
  const readability = clamp((paragraphs >= 5 ? 35 : 18) + (averageParagraphLength(body) <= 180 ? 35 : 15) + (sections >= 2 || body.length < 900 ? 20 : 8) + (body.length <= 8000 ? 10 : 3));

  return [
    dimension("hook", isZh ? "标题承诺" : "Title promise", hook, isZh, hook >= 70 ? "标题清楚表达阅读收益" : "标题还不够具体", "在标题前半段写清主题与收益"),
    dimension("payoff", isZh ? "开头兑现" : "Opening payoff", payoff, isZh, payoff >= 70 ? "开头能快速交付主论点" : "开头铺垫偏多", "前 100 字直接给结论、冲突或问题"),
    dimension("value", isZh ? "文章结构" : "Article structure", value, isZh, value >= 70 ? "文章有清晰可导航结构" : "长文缺少导航与层级", "按观点推进拆成小标题与可复用要点"),
    dimension("evidence", isZh ? "论据可信度" : "Evidence quality", evidence, isZh, evidence >= 70 ? "主张有具体证据支撑" : "论据仍偏抽象", "为主要判断补数据、案例、截图或来源"),
    dimension("conversion", isZh ? "结尾动作" : "Closing action", conversion, isZh, conversion >= 70 ? "结尾动作具体" : "结尾没有明确下一步", "只保留一个订阅、回复或分享动作"),
    dimension("readability", isZh ? "阅读节奏" : "Reading rhythm", readability, isZh, readability >= 70 ? "段落节奏适合长文阅读" : "段落过长或缺少小标题", "缩短段落，并在观点切换处增加小标题")
  ];
}

function assessGeneric(title: string, body: string, cta: string, locale: Locale): ContentReadinessDimension[] {
  const isZh = locale === "zh";
  const hook = clamp((title.length >= 8 ? 35 : 15) + (title.length <= 100 ? 35 : 15) + (/\d|[?？!！]|why|how|vs|为什么|如何|别再/iu.test(title) ? 30 : 15));
  const payoff = clamp((body.length >= 80 ? 40 : 18) + (paragraphCount(body) >= 2 ? 30 : 15) + (averageParagraphLength(body) <= 220 ? 30 : 10));
  const value = clamp((listItemCount(body) > 0 ? 35 : 18) + (body.length >= 180 ? 35 : 18) + (/(方法|步骤|经验|模板|lesson|steps|template)/iu.test(body) ? 30 : 15));
  const evidence = clamp((/\d/.test(body) ? 35 : 18) + (/(数据|案例|结果|客户|用户|data|case|result|customer)/iu.test(body) ? 45 : 20) + 20);
  const conversion = clamp((cta.length >= 8 ? 55 : 20) + (/[?？]/u.test(cta) || /(试试|回复|分享|关注|try|reply|share|follow)/iu.test(cta) ? 45 : 20));
  const readability = clamp((paragraphCount(body) >= 2 ? 45 : 20) + (averageParagraphLength(body) <= 220 ? 40 : 15) + (body.length <= 8000 ? 15 : 5));
  return [
    dimension("hook", isZh ? "开场钩子" : "Opening hook", hook, isZh, hook >= 70 ? "开场足够清楚" : "标题缺少明确张力", "写出具体人群、冲突或结果"),
    dimension("payoff", isZh ? "价值兑现" : "Value payoff", payoff, isZh, payoff >= 70 ? "正文能承接标题" : "正文承接不够直接", "前两段先交付标题承诺"),
    dimension("value", isZh ? "可用价值" : "Useful value", value, isZh, value >= 70 ? "已有可复用信息" : "内容偏泛", "加入一个方法、清单或具体经验"),
    dimension("evidence", isZh ? "具体证据" : "Concrete evidence", evidence, isZh, evidence >= 70 ? "有具体证据" : "缺少可验证细节", "补数据、案例或真实过程"),
    dimension("conversion", isZh ? "行动转化" : "Action conversion", conversion, isZh, conversion >= 70 ? "行动清楚" : "下一步不够明确", "只保留一个具体行动"),
    dimension("readability", isZh ? "可读性" : "Readability", readability, isZh, readability >= 70 ? "结构易读" : "正文密度偏高", "缩短段落并增加节奏")
  ];
}

function dimension(
  key: ContentReadinessDimension["key"],
  label: string,
  score: number,
  isZh: boolean,
  reason: string,
  actionZh: string
): ContentReadinessDimension {
  const actionEn: Record<ContentReadinessDimension["key"], string> = {
    hook: "Name a concrete reader, tension, or verifiable outcome",
    payoff: "Pay off the promise before adding background",
    value: "Add a checklist, template, steps, or comparison",
    evidence: "Add one real screenshot, number, case, or process detail",
    conversion: "State the durable value of following or subscribing",
    readability: "Give each paragraph or slide one information job"
  };
  return { key, label, score: clamp(score), reason, action: isZh ? actionZh : actionEn[key] };
}

function missionDimensionKey(metricKey?: GrowthMission["primaryMetricKey"]): ContentReadinessDimension["key"] | null {
  if (metricKey === "cover_click_rate" || metricKey === "impressions") return "hook";
  if (metricKey === "average_view_seconds") return "payoff";
  if (metricKey === "save_share_per_thousand") return "value";
  if (metricKey === "followers_per_thousand" || metricKey === "leads" || metricKey === "signups" || metricKey === "revenue") return "conversion";
  return null;
}

function paragraphCount(body: string): number {
  return body.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean).length;
}

function averageParagraphLength(body: string): number {
  const paragraphs = body.split(/\n\s*\n/).map((item) => item.replace(/\s+/g, "").trim()).filter(Boolean);
  if (paragraphs.length === 0) return body.length;
  return paragraphs.reduce((sum, item) => sum + Array.from(item).length, 0) / paragraphs.length;
}

function listItemCount(body: string): number {
  return (body.match(/(?:^|\n)\s*(?:[-*•✅❌📌]|\d+[.)、])/gmu) ?? []).length;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
