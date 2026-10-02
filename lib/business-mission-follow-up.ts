import type { GrowthMission } from "@/lib/agent/growth-missions";
import type { MissionOutcomeSummary } from "@/lib/mission-attribution";

export type BusinessMissionFollowUpPreview = {
  objectiveType: NonNullable<GrowthMission["objectiveType"]>;
  actualValue: number;
  previousTargetValue: number;
  nextTargetValue: number;
  currency: string;
  title: string;
  nextMissionTitle: string;
  hypothesis: string;
  workbenchPreamble: string;
};

export type BusinessMissionRepairFollowUpPreview = BusinessMissionFollowUpPreview & {
  bottleneck: NonNullable<GrowthMission["reviewBottleneck"]>;
  bottleneckLabel: string;
  reviewEvidence: string;
};

export function buildBusinessMissionFollowUp(
  mission: GrowthMission,
  summary: MissionOutcomeSummary,
  locale: "zh" | "en"
): BusinessMissionFollowUpPreview {
  if (
    mission.missionKind !== "growth_opportunity"
    || mission.status !== "completed"
    || mission.verdict !== "won"
    || !mission.objectiveType
  ) {
    throw new Error(locale === "en"
      ? "Only a completed business mission with a verified result can be repeated."
      : "只有已经达到目标的商业任务，才能进入结果复现。"
    );
  }

  const expectedMetricKey = mission.objectiveType === "leads"
    ? "leads"
    : mission.objectiveType === "signups"
      ? "signups"
      : "revenue";
  if (mission.primaryMetricKey !== expectedMetricKey) {
    throw new Error(locale === "en"
      ? "This business mission's objective and saved metric do not match."
      : "这条商业任务的目标与已保存指标不一致。"
    );
  }

  const actualValue = businessMissionActualValue(mission.objectiveType, summary);
  if (!Number.isFinite(actualValue) || actualValue < mission.targetValue) {
    throw new Error(locale === "en"
      ? "The saved business result no longer reaches this mission's target."
      : "已保存的真实业务结果尚未达到这条任务的目标。"
    );
  }

  const nextTargetValue = mission.objectiveType === "purchases"
    ? round(Math.max(actualValue, mission.targetValue), 2)
    : Math.ceil(Math.max(actualValue, mission.targetValue));
  const formattedActual = formatBusinessMissionValue(actualValue, mission.objectiveType, summary.currency, locale);
  const formattedPreviousTarget = formatBusinessMissionValue(mission.targetValue, mission.objectiveType, summary.currency, locale);
  const formattedNextTarget = formatBusinessMissionValue(nextTargetValue, mission.objectiveType, summary.currency, locale);
  const labels = businessMissionLabels(mission.objectiveType, locale);

  return {
    objectiveType: mission.objectiveType,
    actualValue,
    previousTargetValue: mission.targetValue,
    nextTargetValue,
    currency: summary.currency,
    title: labels.title,
    nextMissionTitle: locale === "en" ? `Replication: ${mission.title}` : `复现：${mission.title}`,
    hypothesis: locale === "en"
      ? `The previous mission recorded ${formattedActual} against a target of ${formattedPreviousTarget}. Repeat the same platform, offer, audience, and conversion path to test whether the result can be reproduced at ${formattedNextTarget}.`
      : `上一轮已记录${formattedActual}，达到${formattedPreviousTarget}的目标。本轮沿用相同平台、产品、受众与转化路径，再次达到${formattedNextTarget}，验证结果是否可重复。`,
    workbenchPreamble: locale === "en"
      ? [
          "This is a replication cycle for a completed business Growth Mission.",
          `Verified previous result: ${formattedActual}; previous target: ${formattedPreviousTarget}.`,
          `This cycle's operating target: ${formattedNextTarget}.`,
          "Keep the same platform, offer, audience, conversion path, and evidence. Reuse the executed approach before proposing changes. Do not invent customers, attribution, traffic, conversion, or revenue. Content generation and publishing still require user approval."
        ].join("\n")
      : [
          "这是已完成商业增长任务的结果复现轮次。",
          `上一轮已确认结果：${formattedActual}；上一轮目标：${formattedPreviousTarget}。`,
          `本轮经营目标：${formattedNextTarget}。`,
          "沿用相同平台、产品、受众、转化路径和证据，优先复用上一轮真实执行方式，不编造客户、归因、流量、转化或收入。内容生成和发布仍需用户批准。"
        ].join("\n")
  };
}

export function buildBusinessMissionRepairFollowUp(
  mission: GrowthMission,
  summary: MissionOutcomeSummary,
  locale: "zh" | "en"
): BusinessMissionRepairFollowUpPreview {
  if (
    mission.missionKind !== "growth_opportunity"
    || mission.status !== "completed"
    || mission.verdict !== "lost"
    || mission.reviewDecision !== "fix_bottleneck"
    || !mission.reviewBottleneck
    || !mission.objectiveType
  ) {
    throw new Error(locale === "en"
      ? "Only a reviewed commercial mission with one selected breakpoint can create a repair cycle."
      : "只有已复盘并明确一个断点的商业任务，才能进入修复轮次。"
    );
  }

  const expectedMetricKey = mission.objectiveType === "leads"
    ? "leads"
    : mission.objectiveType === "signups"
      ? "signups"
      : "revenue";
  if (mission.primaryMetricKey !== expectedMetricKey) {
    throw new Error(locale === "en"
      ? "This business mission's objective and saved metric do not match."
      : "这条商业任务的目标与已保存指标不一致。"
    );
  }

  const actualValue = businessMissionActualValue(mission.objectiveType, summary);
  if (!Number.isFinite(actualValue) || actualValue >= mission.targetValue) {
    throw new Error(locale === "en"
      ? "A repair cycle requires a reviewed result below the saved target."
      : "修复轮次只能来自已确认低于目标的真实结果。"
    );
  }

  const bottleneckLabel = businessMissionBottleneckLabel(mission.reviewBottleneck, locale);
  const formattedActual = formatBusinessMissionValue(actualValue, mission.objectiveType, summary.currency, locale);
  const formattedTarget = formatBusinessMissionValue(mission.targetValue, mission.objectiveType, summary.currency, locale);
  const reviewEvidence = mission.reviewEvidenceNote?.trim() ?? "";

  return {
    objectiveType: mission.objectiveType,
    actualValue,
    previousTargetValue: mission.targetValue,
    nextTargetValue: mission.targetValue,
    currency: summary.currency,
    bottleneck: mission.reviewBottleneck,
    bottleneckLabel,
    reviewEvidence,
    title: locale === "en" ? `Repair one breakpoint: ${bottleneckLabel}` : `只修复一个断点：${bottleneckLabel}`,
    nextMissionTitle: locale === "en" ? `Repair: ${mission.title}` : `修复：${mission.title}`,
    hypothesis: locale === "en"
      ? `The reviewed result was ${formattedActual} against a target of ${formattedTarget}. The user selected ${bottleneckLabel} as the one breakpoint to repair based on saved evidence. Keep the other operating conditions stable; this selection is a test, not a claim of causality.`
      : `复盘确认本轮实际为${formattedActual}，低于${formattedTarget}的目标。用户基于已保存证据选择“${bottleneckLabel}”作为唯一修复断点；其余经营条件保持不变。这个选择是下一轮待验证假设，不代表已经证明因果关系。`,
    workbenchPreamble: locale === "en"
      ? [
          "This is a repair cycle for a reviewed commercial Growth Mission.",
          `Reviewed result: ${formattedActual}; target: ${formattedTarget}.`,
          `Change exactly one breakpoint: ${bottleneckLabel}.`,
          "Keep the same platform, offer, audience, conversion path, target, source evidence, and currency. Use the saved review evidence to prepare the repair, but do not reproduce private customer details in customer-facing content. Do not claim that this breakpoint caused the missed result. Content generation and publishing still require user approval."
        ].join("\n")
      : [
          "这是已复盘商业增长任务的单断点修复轮次。",
          `本轮已确认结果：${formattedActual}；目标：${formattedTarget}。`,
          `只改变一个断点：${bottleneckLabel}。`,
          "沿用相同平台、产品、受众、转化路径、目标、来源证据和币种。使用已保存的复盘证据准备修复，但不要把客户隐私写入对外内容；不宣称该断点已经被证明是未达标原因。内容生成和发布仍需用户批准。"
        ].join("\n")
  };
}

export function businessMissionActualValue(
  objectiveType: NonNullable<GrowthMission["objectiveType"]>,
  summary: MissionOutcomeSummary
): number {
  if (objectiveType === "leads") return summary.leads;
  if (objectiveType === "signups") return summary.signups;
  return summary.revenue;
}

export function formatBusinessMissionValue(
  value: number,
  objectiveType: NonNullable<GrowthMission["objectiveType"]>,
  currency: string,
  locale: "zh" | "en"
): string {
  const number = new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", {
    maximumFractionDigits: objectiveType === "purchases" ? 2 : 0
  }).format(value);
  if (objectiveType === "purchases") return `${currency || "CNY"} ${number}`;
  if (locale === "en") return `${number} ${objectiveType === "leads" ? "qualified leads" : "signups"}`;
  return `${number} 个${objectiveType === "leads" ? "有效线索" : "注册"}`;
}

function businessMissionLabels(
  objectiveType: NonNullable<GrowthMission["objectiveType"]>,
  locale: "zh" | "en"
): { title: string } {
  if (locale === "en") {
    if (objectiveType === "leads") return { title: "Repeat the qualified-lead result" };
    if (objectiveType === "signups") return { title: "Repeat the signup result" };
    return { title: "Repeat the revenue result" };
  }
  if (objectiveType === "leads") return { title: "复现已达成的获客结果" };
  if (objectiveType === "signups") return { title: "复现已达成的注册结果" };
  return { title: "复现已达成的收入结果" };
}

export function businessMissionBottleneckLabel(
  bottleneck: NonNullable<GrowthMission["reviewBottleneck"]>,
  locale: "zh" | "en"
): string {
  const labels = {
    acquisition_message: { zh: "获客信息与内容承诺", en: "acquisition message" },
    landing_page: { zh: "落地页承诺与证据", en: "landing-page promise and proof" },
    lead_capture: { zh: "线索表单与咨询入口", en: "lead capture" },
    signup_flow: { zh: "注册流程", en: "signup flow" },
    checkout: { zh: "购买与支付流程", en: "checkout flow" }
  } as const;
  return labels[bottleneck][locale];
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
