"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Loader2, Upload } from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { growthGoals } from "@/lib/goals";
import { personas } from "@/lib/personas";
import { platforms } from "@/lib/platforms";
import type { ResearchMission } from "@/lib/operations/research";
import {
  deriveBlindReviewerPackId,
  researchIntelligenceEvalCaseSchema,
  researchIntelligenceEvalDatasetSchema,
  researchIntelligenceEvalReviewSchema,
  researchIntelligenceExperimentProvenanceSchema,
  researchIntelligenceFailedCallSchema,
  summarizeResearchIntelligenceEval,
  type ResearchIntelligenceEvalDataset,
  type ResearchIntelligenceEvalReview,
  type ResearchIntelligenceExperimentProvenance,
  type ResearchIntelligenceFailedCall
} from "@/lib/research-intelligence-eval";
import {
  buildBlindReviewerPack,
  buildOperatorAnswerKey,
  buildOperatorCheckpoint,
  parseOperatorAnswerKeyFile,
  parseOperatorCheckpointFile,
  parseReviewResultPackFile
} from "@/lib/research-intelligence-eval-files";
import { ResearchIntelligenceEvalReviewer } from "@/components/admin/ResearchIntelligenceEvalReviewer";
import {
  downloadJsonFile,
  Field,
  fileDateStamp,
  formatDuration,
  formatUsd,
  readFileText,
  useRecoverableSession
} from "@/components/admin/research-intelligence-eval-ui";

type Props = { initialAuthorized: boolean };
type MissionResponse = { missions?: ResearchMission[]; error?: string };

const OPERATOR_STORAGE_KEY = "finfold-research-intelligence-eval-operator-v2";

type OperatorSession = {
  dataset: ResearchIntelligenceEvalDataset;
  reviews: ResearchIntelligenceEvalReview[];
  failedCalls: ResearchIntelligenceFailedCall[];
  provenance: ResearchIntelligenceExperimentProvenance | null;
};

const EMPTY_REVIEWS: ResearchIntelligenceEvalReview[] = [];
const EMPTY_FAILED_CALLS: ResearchIntelligenceFailedCall[] = [];

function deserializeSession(raw: unknown): OperatorSession | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as Partial<OperatorSession>;
  try {
    return {
      dataset: researchIntelligenceEvalDatasetSchema.parse(candidate.dataset),
      reviews: Array.isArray(candidate.reviews)
        ? candidate.reviews.map((review) => researchIntelligenceEvalReviewSchema.parse(review))
        : [],
      failedCalls: Array.isArray(candidate.failedCalls)
        ? candidate.failedCalls.map((call) => researchIntelligenceFailedCallSchema.parse(call))
        : [],
      provenance: candidate.provenance == null
        ? null
        : researchIntelligenceExperimentProvenanceSchema.parse(candidate.provenance)
    };
  } catch {
    return null;
  }
}

function newDataset(): ResearchIntelligenceEvalDataset {
  return {
    version: 2,
    title: "Finfold Research intelligence blind test",
    blindSeed: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    cases: []
  };
}

/** Display-only placeholder so the gate board renders (all failing) before the
 * first case is generated. Never exported and never used for real samples. */
const DISPLAY_ONLY_EMPTY_DATASET: ResearchIntelligenceEvalDataset = {
  version: 2,
  title: "未开始的实验",
  blindSeed: "display-only-empty-session",
  createdAt: "2026-08-17T00:00:00.000Z",
  cases: []
};

export function ResearchIntelligenceEvalClient({ initialAuthorized }: Props) {
  const [mode, setMode] = useState<"operator" | "reviewer">("operator");

  if (!initialAuthorized) {
    return <Panel className="p-8"><h1 className="text-xl font-black text-fg">Research 情报盲测</h1><p className="mt-3 text-sm text-fg-muted">该工作台仅对管理员开放。</p><Link href="/dashboard" className="btn-ghost focus-ring mt-5 inline-flex">返回 Dashboard</Link></Panel>;
  }

  return (
    <div className="mx-auto grid max-w-[1280px] gap-5 pb-12">
      <Panel className="p-6 md:p-8">
        <p className="eyebrow">EVIDENCE-TO-GENERATION EVALUATION</p>
        <h1 className="mt-3 text-3xl font-black text-fg md:text-5xl">Research 情报盲测工作台</h1>
        <p className="mt-4 max-w-3xl text-sm font-semibold leading-6 text-fg-muted">实验操作台负责生成对照、保管答案文件和判定放行；盲评台只接收不含答案的评审文件。每组对照会真实调用模型两次并产生供应商成本；系统不会扣 Finfold Credits、不会保存为内容包，也不会批量自动执行。</p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-fg-muted">
          <span className="rounded-full border border-hairline px-3 py-1.5">真实模型调用 ×2 / 组</span>
          <span className="rounded-full border border-hairline px-3 py-1.5">不自动发布 · 不保存整篇来源 · 不声称平台处罚因果</span>
        </div>
      </Panel>

      <div role="tablist" aria-label="评测模式" className="flex flex-wrap gap-2">
        <button type="button" role="tab" aria-selected={mode === "operator"} onClick={() => setMode("operator")} className={mode === "operator" ? "btn-primary focus-ring" : "btn-ghost focus-ring"}>实验操作台（Operator）</button>
        <button type="button" role="tab" aria-selected={mode === "reviewer"} onClick={() => setMode("reviewer")} className={mode === "reviewer" ? "btn-primary focus-ring" : "btn-ghost focus-ring"}>盲评台（Reviewer）</button>
      </div>

      {mode === "operator" ? <OperatorPanel /> : <ResearchIntelligenceEvalReviewer />}
    </div>
  );
}

function OperatorPanel() {
  const [missions, setMissions] = useState<ResearchMission[]>([]);
  const [session, setSession, restored] = useRecoverableSession<OperatorSession>(OPERATOR_STORAGE_KEY, deserializeSession);
  const [missionId, setMissionId] = useState("");
  const [goal, setGoal] = useState("lead-gen");
  const [persona, setPersona] = useState("ai-saas");
  const [platform, setPlatform] = useState("xiaohongshu");
  const [language, setLanguage] = useState("zh");
  const [modelTier, setModelTier] = useState("haiku");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [provenanceDraft, setProvenanceDraft] = useState({
    testCommand: "",
    executedAtLocal: "",
    workspaceFingerprint: "",
    testStatus: "unverified" as "unverified" | "passed" | "failed",
    notes: ""
  });

  const dataset = session?.dataset ?? null;
  const reviews = session?.reviews ?? EMPTY_REVIEWS;
  const failedCalls = session?.failedCalls ?? EMPTY_FAILED_CALLS;
  const provenance = session?.provenance ?? null;

  useEffect(() => {
    void fetch("/api/operations/research", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as MissionResponse;
        if (!response.ok) throw new Error(data.error || "无法读取 Research 任务。");
        const ready = (data.missions ?? []).filter((mission) => mission.status === "ready" && mission.decision);
        setMissions(ready);
        setMissionId((current) => current || ready[0]?.id || "");
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "无法读取 Research 任务。"));
  }, []);

  const summary = useMemo(
    () => summarizeResearchIntelligenceEval(
      dataset ?? DISPLAY_ONLY_EMPTY_DATASET,
      reviews,
      { provenance, failedCalls }
    ),
    [dataset, reviews, provenance, failedCalls]
  );

  function updateSession(patch: Partial<OperatorSession>) {
    setSession((current) => {
      const base: OperatorSession = current ?? {
        dataset: newDataset(),
        reviews: [],
        failedCalls: [],
        provenance: null
      };
      return { ...base, ...patch };
    });
  }

  async function generatePair() {
    if (!missionId) return;
    setCreating(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/research-intelligence-eval/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId, goal, persona, platform, language, modelTier, confirmProviderSpend: true })
      });
      const data = await response.json() as {
        evaluationCase?: unknown;
        failedCall?: {
          occurredAt: string;
          missionId: string;
          stage: string;
          error: string;
          attempts: { control: unknown[]; treatment: unknown[] };
          estimatedCostUsd: number | null;
        };
        error?: string;
      };
      if (!response.ok || !data.evaluationCase) {
        if (data.failedCall) {
          const failedCall = researchIntelligenceFailedCallSchema.parse({
            occurredAt: data.failedCall.occurredAt,
            missionId: data.failedCall.missionId,
            stage: data.failedCall.stage,
            error: data.failedCall.error,
            attempts: [...(data.failedCall.attempts?.control ?? []), ...(data.failedCall.attempts?.treatment ?? [])],
            estimatedCostUsd: data.failedCall.estimatedCostUsd
          });
          updateSession({ failedCalls: [...failedCalls, failedCall] });
          setMessage(`生成失败，但已产生成本 ${formatUsd(failedCall.estimatedCostUsd)}，已记入失败调用记录；不会用假样本回退。`);
          return;
        }
        throw new Error(data.error || "生成盲测对失败。");
      }
      const evaluationCase = researchIntelligenceEvalCaseSchema.parse(data.evaluationCase);
      const currentCases = dataset?.cases ?? [];
      const nextDataset = dataset
        ? { ...dataset, cases: [...dataset.cases, evaluationCase] }
        : { ...newDataset(), cases: [evaluationCase] };
      updateSession({ dataset: nextDataset });
      const nextCount = currentCases.length + 1;
      const invalid = evaluationCase.pairValidity?.status === "invalid";
      const invalidNote = invalid
        ? ` 注意：本组两侧最终模型设置不一致（${evaluationCase.pairValidity?.reasons.join(", ")}），计入成本但不计入有效样本。`
        : "";
      setMessage(
        nextCount % 5 === 0
          ? `已生成 ${nextCount} 组真实对照；A/B 顺序已盲化。${invalidNote}建议现在导出检查点文件，防止页面刷新丢失进度。`
          : `已生成 ${nextCount} 组真实对照；A/B 顺序已盲化。${invalidNote}`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成盲测对失败。");
    } finally {
      setCreating(false);
    }
  }

  async function importOperatorFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5_000_000) {
      setMessage("实验文件不能超过 5 MB。");
      return;
    }
    try {
      const raw = JSON.parse(await readFileText(file)) as { kind?: unknown };
      const kind = typeof raw.kind === "string" ? raw.kind : "";
      if (kind === "finfold-research-intelligence-operator-answer-key") {
        const answerKey = parseOperatorAnswerKeyFile(raw);
        setSession({
          dataset: answerKey.dataset,
          reviews: answerKey.reviews,
          failedCalls: answerKey.failedCalls,
          provenance: answerKey.provenance ?? null
        });
        setMessage(`已导入答案文件：${answerKey.dataset.cases.length} 组样本、${answerKey.reviews.length} 条评分。该文件包含分组答案，仅限操作者使用。`);
        return;
      }
      if (kind === "finfold-research-intelligence-operator-checkpoint") {
        const checkpoint = parseOperatorCheckpointFile(raw);
        setSession({
          dataset: checkpoint.dataset,
          reviews: checkpoint.reviews,
          failedCalls: checkpoint.failedCalls,
          provenance: checkpoint.provenance ?? null
        });
        setMessage(`已从检查点恢复：${checkpoint.dataset.cases.length} 组样本、${checkpoint.reviews.length} 条评分、${checkpoint.failedCalls.length} 次失败调用（保存于 ${checkpoint.savedAt}）。`);
        return;
      }
      if (kind === "finfold-research-intelligence-review-result-pack") {
        const resultPack = parseReviewResultPackFile(raw);
        if (!dataset) {
          setMessage("请先导入或生成实验数据，再合并评分结果文件。");
          return;
        }
        const expectedPackId = deriveBlindReviewerPackId(dataset.blindSeed, dataset.title);
        if (resultPack.packId !== expectedPackId) {
          setMessage(`评分结果文件 (${resultPack.packId}) 与当前实验 (${expectedPackId}) 不匹配，已拒绝导入。`);
          return;
        }
        const merged = new Map<string, ResearchIntelligenceEvalReview>();
        for (const review of [...reviews, ...resultPack.reviews]) {
          const key = `${review.caseId}::${review.reviewerId}`;
          const existing = merged.get(key);
          if (!existing || review.reviewedAt >= existing.reviewedAt) merged.set(key, review);
        }
        updateSession({ reviews: [...merged.values()] });
        setMessage(`已合并 ${resultPack.reviews.length} 条评分；同 case 同评审重复评分仅保留最新。`);
        return;
      }
      setMessage("未知文件类型：操作台只接受答案文件、检查点文件或评分结果文件；盲评文件请在盲评台导入。");
    } catch (error) {
      setMessage(error instanceof Error ? `导入失败：${error.message}` : "导入失败：文件无效。");
    }
  }

  function exportReviewerPack() {
    if (!dataset) return;
    const pack = buildBlindReviewerPack(dataset);
    downloadJsonFile(`finfold-rie-blind-reviewer-pack-${fileDateStamp()}.json`, pack);
    setMessage(`已导出盲评文件 ${pack.packId}：${pack.cases.length} 个 case（不含无效配对）。文件不含 control/treatment、盲化种子或策略信息，可交给独立评审。`);
  }

  function exportAnswerKey() {
    if (!dataset) return;
    const answerKey = buildOperatorAnswerKey({ dataset, reviews, failedCalls, provenance });
    downloadJsonFile(`finfold-rie-operator-answer-key-${fileDateStamp()}.json`, answerKey);
    setMessage("已导出答案文件：包含 control/treatment 对应关系与模型记录，仅限实验操作者保存，不得发给评审。");
  }

  function exportCheckpoint() {
    if (!dataset) return;
    const checkpoint = buildOperatorCheckpoint({
      dataset,
      reviews,
      failedCalls,
      provenance,
      savedAt: new Date().toISOString()
    });
    downloadJsonFile(`finfold-rie-operator-checkpoint-${fileDateStamp()}.json`, checkpoint);
    setMessage(`已导出检查点（${checkpoint.dataset.cases.length} 组样本）。页面刷新或换设备时可通过导入检查点恢复。`);
  }

  function saveProvenance() {
    try {
      const executedAt = provenanceDraft.executedAtLocal
        ? new Date(provenanceDraft.executedAtLocal).toISOString()
        : "";
      const parsed = researchIntelligenceExperimentProvenanceSchema.parse({
        testCommand: provenanceDraft.testCommand,
        executedAt,
        workspaceFingerprint: provenanceDraft.workspaceFingerprint,
        automatedTestsPassed: provenanceDraft.testStatus === "passed",
        notes: provenanceDraft.notes.trim() || undefined
      });
      updateSession({ provenance: parsed });
      setMessage("已登记测试溯源。跨租户门槛以该自动化测试结果为准，不再支持手动勾选。");
    } catch (error) {
      setMessage(error instanceof Error ? `溯源登记无效：${error.message}` : "溯源登记无效。");
    }
  }

  const casesCount = dataset?.cases.length ?? 0;

  return (
    <div className="grid gap-5">
      <Panel className="p-5 md:p-6">
        <h2 className="text-lg font-black text-fg">1. 生成一组真实对照</h2>
        <p className="mt-1 text-xs font-semibold text-fg-muted">每次生成会顺序调用真实模型两次（control 不带情报，treatment 带服务端读取的情报），并记录供应商、模型、Token、估算成本与耗时。</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="已完成的 Research 任务"><select className="field-input" value={missionId} onChange={(event) => setMissionId(event.target.value)}><option value="">请选择</option>{missions.map((mission) => <option key={mission.id} value={mission.id}>{mission.title}</option>)}</select></Field>
          <Field label="目标"><select className="field-input" value={goal} onChange={(event) => setGoal(event.target.value)}>{growthGoals.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
          <Field label="受众"><select className="field-input" value={persona} onChange={(event) => setPersona(event.target.value)}>{personas.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
          <Field label="平台"><select className="field-input" value={platform} onChange={(event) => setPlatform(event.target.value)}>{platforms.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
          <Field label="语言"><select className="field-input" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="zh">中文</option><option value="en">English</option><option value="auto">Auto</option><option value="bilingual">Bilingual</option></select></Field>
          <Field label="模型档位"><select className="field-input" value={modelTier} onChange={(event) => setModelTier(event.target.value)}><option value="haiku">Haiku · 低成本</option><option value="sonnet">Sonnet</option><option value="opus">Opus</option></select></Field>
        </div>
        <div className="mt-5 flex flex-wrap justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void generatePair()} disabled={!missionId || creating} className="btn-primary focus-ring disabled:opacity-45">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}生成 1 组（模型调用 ×2）</button>
            <label className="btn-ghost focus-ring cursor-pointer"><Upload className="h-4 w-4" />导入实验文件<input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void importOperatorFile(event.target.files?.[0])} /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportReviewerPack} disabled={!dataset || casesCount === 0} className="btn-ghost focus-ring disabled:opacity-45">导出盲评文件</button>
            <button type="button" onClick={exportCheckpoint} disabled={!dataset || casesCount === 0} className="btn-ghost focus-ring disabled:opacity-45"><Download className="h-4 w-4" />导出检查点</button>
            <button type="button" onClick={exportAnswerKey} disabled={!dataset || casesCount === 0} className="btn-ghost focus-ring disabled:opacity-45">导出答案文件</button>
          </div>
        </div>
        {restored && dataset ? (
          <p className="mt-4 rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-xs font-semibold text-fg-muted">已从本浏览器恢复未完成实验：{casesCount} 组样本、{reviews.length} 条评分、{failedCalls.length} 次失败调用。请尽快导出检查点留存。</p>
        ) : null}
        {message ? <p role="status" className="mt-4 rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-sm font-semibold text-fg-muted">{message}</p> : null}
        {failedCalls.length > 0 ? (
          <div className="mt-4 rounded-xl border border-hairline bg-surface-2/60 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-fg-muted">失败调用记录（已计成本，不回退假样本）</p>
            <ul className="mt-2 grid gap-1 text-xs font-semibold text-fg-muted">
              {failedCalls.slice(-5).map((call, index) => (
                <li key={`${call.occurredAt}-${index}`}>{call.occurredAt} · {call.stage} · {call.error} · 成本 {formatUsd(call.estimatedCostUsd)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>

      <Panel className="p-5 md:p-6">
        <h2 className="text-lg font-black text-fg">2. 测试溯源登记</h2>
        <p className="mt-1 text-xs font-semibold text-fg-muted">跨租户边界不再接受手动勾选。登记本地自动化测试的命令、执行时间与工作区指纹（如 git rev-parse HEAD），放行门槛只认登记的测试结果。</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="测试命令"><input className="field-input" value={provenanceDraft.testCommand} onChange={(event) => setProvenanceDraft({ ...provenanceDraft, testCommand: event.target.value })} placeholder="npm test -- research-intelligence" maxLength={500} /></Field>
          <Field label="执行时间"><input type="datetime-local" className="field-input" value={provenanceDraft.executedAtLocal} onChange={(event) => setProvenanceDraft({ ...provenanceDraft, executedAtLocal: event.target.value })} /></Field>
          <Field label="代码版本 / 工作区指纹"><input className="field-input" value={provenanceDraft.workspaceFingerprint} onChange={(event) => setProvenanceDraft({ ...provenanceDraft, workspaceFingerprint: event.target.value })} placeholder="git commit hash 或等价指纹" maxLength={200} /></Field>
          <Field label="自动化测试结果"><select className="field-input" value={provenanceDraft.testStatus} onChange={(event) => setProvenanceDraft({ ...provenanceDraft, testStatus: event.target.value as typeof provenanceDraft.testStatus })}><option value="unverified">尚未运行</option><option value="passed">全部通过</option><option value="failed">存在失败</option></select></Field>
          <Field label="备注（可选）"><input className="field-input" value={provenanceDraft.notes} onChange={(event) => setProvenanceDraft({ ...provenanceDraft, notes: event.target.value })} maxLength={2000} /></Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={saveProvenance} className="btn-primary focus-ring">保存溯源</button>
          {provenance ? (
            <span className="text-xs font-semibold text-fg-muted">已登记：{provenance.testCommand} @ {provenance.executedAt} · 指纹 {provenance.workspaceFingerprint} · {provenance.automatedTestsPassed ? "自动化测试通过" : "自动化测试未通过/未运行"}</span>
          ) : <span className="text-xs font-semibold text-fg-muted">尚未登记；跨租户门槛将保持未通过。</span>}
        </div>
      </Panel>

      <Panel className="p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-fg">3. 放行判定</h2>
            <p className="mt-1 text-xs font-semibold text-fg-muted">只有全部门槛通过，才进入自动数据源试点；30 组达标仅记为 P0 pilot passed。</p>
          </div>
          {summary?.passed ? <span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1.5 text-sm font-black text-success"><CheckCircle2 className="h-4 w-4" />通过</span> : <span className="rounded-full border border-hairline px-3 py-1.5 text-sm font-black text-fg-muted">未通过</span>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-fg-muted">
          <span className="rounded-full border border-hairline px-3 py-1.5">样本 {casesCount}/30</span>
          <span className="rounded-full border border-hairline px-3 py-1.5">有效配对 {summary?.validPairs ?? 0}</span>
          <span className="rounded-full border border-hairline px-3 py-1.5">已评 {summary?.completedCases ?? 0}/30</span>
          <span className="rounded-full border border-hairline px-3 py-1.5">任务覆盖 {summary?.distinctMissions ?? 0}</span>
        </div>
        {summary ? (
          <p className="mt-4 rounded-xl border border-hairline bg-surface-2/60 px-4 py-3 text-sm font-bold text-fg">
            判定：{summary.verdict === "p0-pilot-passed" ? "P0 pilot passed" : summary.verdict === "expand-to-60-cases" ? "扩大到 60 组" : "未通过"}
            <span className="mt-1 block text-xs font-medium text-fg-muted">{summary.verdictNote}</span>
          </p>
        ) : null}
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{summary?.gates.map((gate) => <div key={gate.key} className={`rounded-xl border p-4 ${gate.passed ? "border-success/30 bg-success/[0.06]" : "border-hairline bg-surface-2/45"}`}><p className="text-sm font-black text-fg">{gate.label}</p><p className="mt-2 text-sm font-black text-fg">{gate.actual}</p><p className="mt-1 text-xs font-semibold text-fg-muted">目标 {gate.target}</p></div>)}</div>
        {summary ? <p className="mt-4 text-xs font-semibold text-fg-muted">估算模型成本：控制组 {formatUsd(summary.controlEstimatedCostUsd)} · 情报组 {formatUsd(summary.treatmentEstimatedCostUsd)} · 失败调用 {formatUsd(summary.failedCallEstimatedCostUsd)}（{summary.failedCallCount} 次）。平均耗时：控制组 {formatDuration(summary.controlAverageDurationMs)} · 情报组 {formatDuration(summary.treatmentAverageDurationMs)}。</p> : null}
      </Panel>
    </div>
  );
}
