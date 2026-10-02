import type { ContentKit, KitOutput } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";

export type KitLifecycleStageId = "signal" | "drafts" | "publish" | "learn";
export type KitLifecycleStageState = "complete" | "current" | "upcoming";

export type KitLifecycleStage = {
  id: KitLifecycleStageId;
  label: string;
  detail: string;
  state: KitLifecycleStageState;
};

export type KitLifecycle = {
  stages: KitLifecycleStage[];
  nextAction: string;
  postedCount: number;
  measuredCount: number;
  iteratedCount: number;
};

const POSTED_STATUSES = new Set<KitOutput["publishStatus"]>(["posted", "measured", "iterated"]);
const MEASURED_STATUSES = new Set<KitOutput["publishStatus"]>(["measured", "iterated"]);

function stageState(complete: boolean, current: boolean): KitLifecycleStageState {
  if (complete) return "complete";
  return current ? "current" : "upcoming";
}

export function summarizeSignal(value: string, maxLength = 72): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function getKitLifecycle(kit: Pick<ContentKit, "outputs">, locale: Locale): KitLifecycle {
  const total = kit.outputs.length;
  const postedCount = kit.outputs.filter((output) => POSTED_STATUSES.has(output.publishStatus)).length;
  const measuredCount = kit.outputs.filter((output) => MEASURED_STATUSES.has(output.publishStatus)).length;
  const iteratedCount = kit.outputs.filter((output) => output.publishStatus === "iterated").length;

  const draftsComplete = total > 0;
  const publishComplete = total > 0 && postedCount === total;
  const learnComplete = postedCount > 0 && iteratedCount === postedCount;

  const copy = locale === "en"
    ? {
        signal: "Signal",
        signalDetail: "Source captured",
        drafts: "Drafts",
        draftsDetail: total > 0 ? `${total} ready` : "Generate outputs",
        publish: "Publish",
        publishDetail: postedCount > 0 ? `${postedCount}/${total} posted` : "Not posted",
        learn: "Learn",
        learnDetail: measuredCount > 0 ? `${measuredCount} measured` : "Awaiting results",
        generate: "Generate platform-native drafts from this signal",
        publishNext: "Review and publish the first useful output",
        measure: "Add performance data for a published output",
        iterate: "Turn measured results into a reusable rule",
        complete: "Start the next signal with the learned rules"
      }
    : {
        signal: "信号",
        signalDetail: "源素材已捕获",
        drafts: "草稿",
        draftsDetail: total > 0 ? `${total} 份已生成` : "等待生成",
        publish: "发布",
        publishDetail: postedCount > 0 ? `${postedCount}/${total} 已发布` : "尚未发布",
        learn: "学习",
        learnDetail: measuredCount > 0 ? `${measuredCount} 份已回流` : "等待表现数据",
        generate: "从这条信号生成平台原生草稿",
        publishNext: "审核并发布第一份可用内容",
        measure: "为已发布内容补充表现数据",
        iterate: "把表现数据沉淀为可复用规则",
        complete: "带着已学习规则开始下一条信号"
      };

  let nextAction = copy.generate;
  if (draftsComplete && postedCount === 0) nextAction = copy.publishNext;
  else if (postedCount > measuredCount) nextAction = copy.measure;
  else if (measuredCount > iteratedCount) nextAction = copy.iterate;
  else if (learnComplete) nextAction = copy.complete;

  return {
    stages: [
      { id: "signal", label: copy.signal, detail: copy.signalDetail, state: "complete" },
      { id: "drafts", label: copy.drafts, detail: copy.draftsDetail, state: stageState(draftsComplete, !draftsComplete) },
      { id: "publish", label: copy.publish, detail: copy.publishDetail, state: stageState(publishComplete, draftsComplete && !publishComplete) },
      { id: "learn", label: copy.learn, detail: copy.learnDetail, state: stageState(learnComplete, postedCount > 0 && !learnComplete) }
    ],
    nextAction,
    postedCount,
    measuredCount,
    iteratedCount
  };
}
