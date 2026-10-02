"use client";

import React, { useMemo, useState } from "react";
import { ArrowRight, Download, Upload } from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { researchIntelligenceEvalReviewSchema, type ResearchIntelligenceEvalReview } from "@/lib/research-intelligence-eval";
import {
  buildReviewResultPack,
  parseBlindReviewerPackFile,
  type BlindReviewerPack
} from "@/lib/research-intelligence-eval-files";
import {
  CandidateCard,
  downloadJsonFile,
  emptyScore,
  Field,
  fileDateStamp,
  readFileText,
  useRecoverableSession
} from "@/components/admin/research-intelligence-eval-ui";

const STORAGE_KEY = "finfold-research-intelligence-eval-reviewer-v2";

type ReviewerSession = {
  pack: BlindReviewerPack;
  reviews: ResearchIntelligenceEvalReview[];
  reviewerId: string;
};

const EMPTY_REVIEWS: ResearchIntelligenceEvalReview[] = [];

function deserializeSession(raw: unknown): ReviewerSession | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as { pack?: unknown; reviews?: unknown; reviewerId?: unknown };
  try {
    const pack = parseBlindReviewerPackFile(candidate.pack);
    const reviews = Array.isArray(candidate.reviews)
      ? candidate.reviews.map((review) => researchIntelligenceEvalReviewSchema.parse(review))
      : [];
    const reviewerId = typeof candidate.reviewerId === "string" && candidate.reviewerId.trim().length > 0
      ? candidate.reviewerId
      : "reviewer-1";
    return { pack, reviews, reviewerId };
  } catch {
    return null;
  }
}

/**
 * Blind reviewer workbench. It only ever accepts a Blind Reviewer Pack file:
 * operator answer keys, datasets, and other file kinds are rejected before
 * parsing, so neither the page state nor anything exported from here can
 * reveal the treatment arm, blind seed, strategy hints, or model details.
 */
export function ResearchIntelligenceEvalReviewer() {
  const [session, setSession, restored] = useRecoverableSession<ReviewerSession>(STORAGE_KEY, deserializeSession);
  const [message, setMessage] = useState<string | null>(null);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [candidateA, setCandidateA] = useState(emptyScore());
  const [candidateB, setCandidateB] = useState(emptyScore());
  const [preferredForTopic, setPreferredForTopic] = useState<"A" | "B" | "tie">("tie");
  const [overallPreference, setOverallPreference] = useState<"A" | "B" | "tie">("tie");
  const [notes, setNotes] = useState("");

  const pack = session?.pack ?? null;
  const reviews = session?.reviews ?? EMPTY_REVIEWS;
  const reviewerId = session?.reviewerId ?? "reviewer-1";

  const activeCase = useMemo(() => {
    if (!pack) return null;
    const explicit = pack.cases.find((item) => item.id === activeCaseId);
    if (explicit) return explicit;
    return pack.cases.find((item) =>
      !reviews.some((review) => review.caseId === item.id && review.reviewerId === reviewerId)
    ) ?? null;
  }, [pack, activeCaseId, reviews, reviewerId]);

  const completedCount = useMemo(
    () => new Set(reviews.filter((review) => review.reviewerId === reviewerId).map((review) => review.caseId)).size,
    [reviews, reviewerId]
  );

  async function importPack(file: File | undefined) {
    if (!file) return;
    if (file.size > 5_000_000) {
      setMessage("盲评文件不能超过 5 MB。");
      return;
    }
    try {
      const nextPack = parseBlindReviewerPackFile(JSON.parse(await readFileText(file)) as unknown);
      setSession({ pack: nextPack, reviews: [], reviewerId });
      setActiveCaseId(null);
      setMessage(`已导入盲评文件 ${nextPack.packId}：${nextPack.cases.length} 个 case。本页面不会接触任何分组答案信息。`);
    } catch (error) {
      setMessage(error instanceof Error ? `导入失败：${error.message}` : "导入失败：文件无效。");
    }
  }

  function resetReviewDraft() {
    setCandidateA(emptyScore());
    setCandidateB(emptyScore());
    setPreferredForTopic("tie");
    setOverallPreference("tie");
    setNotes("");
  }

  function saveReview() {
    if (!pack || !activeCase || reviewerId.trim().length === 0) return;
    const review = researchIntelligenceEvalReviewSchema.parse({
      caseId: activeCase.id,
      reviewerId,
      preferredForTopic,
      overallPreference,
      candidateA,
      candidateB,
      notes: notes.trim() || undefined,
      reviewedAt: new Date().toISOString()
    });
    const nextReviews = [
      ...reviews.filter((item) => !(item.caseId === review.caseId && item.reviewerId === review.reviewerId)),
      review
    ];
    setSession({ pack, reviews: nextReviews, reviewerId });
    if (nextReviews.length > 0 && nextReviews.length % 5 === 0) {
      setMessage("评分已记录。已完成多组评审，请导出评分结果文件留存，防止页面刷新丢失。");
    } else {
      setMessage("评分已记录在当前浏览器会话中；请定期导出评分结果文件。");
    }
    const next = pack.cases.find((item) =>
      item.id !== activeCase.id && !nextReviews.some((existing) => existing.caseId === item.id && existing.reviewerId === reviewerId)
    );
    setActiveCaseId(next?.id ?? null);
    resetReviewDraft();
  }

  function exportResults() {
    if (!pack) return;
    const resultPack = buildReviewResultPack(pack.packId, reviews);
    downloadJsonFile(`finfold-rie-review-result-pack-${fileDateStamp()}.json`, resultPack);
    setMessage("已导出评分结果文件：只包含 case ID、评审代号、A/B 评分与偏好，不含分组信息。");
  }

  function clearSession() {
    setSession(null);
    setActiveCaseId(null);
    resetReviewDraft();
    setMessage("已清空本地盲评会话。");
  }

  return (
    <div className="grid gap-5">
      <Panel className="p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-fg">盲评台（Reviewer Mode）</h2>
            <p className="mt-1 text-xs font-semibold text-fg-muted">只能导入 Blind Reviewer Pack；页面不显示、不保存任何 control/treatment、盲化种子或策略信息。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="btn-ghost focus-ring cursor-pointer"><Upload className="h-4 w-4" />导入盲评文件<input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void importPack(event.target.files?.[0])} /></label>
            <button type="button" onClick={exportResults} disabled={!pack || reviews.length === 0} className="btn-ghost focus-ring disabled:opacity-45"><Download className="h-4 w-4" />导出评分结果</button>
            {pack ? <button type="button" onClick={clearSession} className="btn-ghost focus-ring">清空会话</button> : null}
          </div>
        </div>
        {restored && pack ? (
          <p className="mt-4 rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-xs font-semibold text-fg-muted">
            已从本浏览器恢复未完成会话 {pack.packId}：{completedCount}/{pack.cases.length} 已评。请尽快导出评分结果文件留存。
          </p>
        ) : null}
        {message ? <p role="status" className="mt-4 rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-sm font-semibold text-fg-muted">{message}</p> : null}
      </Panel>

      {pack ? (
        <Panel className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-wider text-fg-muted">统一评审背景</p>
            <Field label="评审代号"><input className="field-input max-w-48" value={reviewerId} onChange={(event) => setSession({ pack, reviews, reviewerId: event.target.value })} maxLength={80} /></Field>
          </div>
          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-hairline bg-surface-2/60 p-4 text-xs leading-5 font-semibold text-fg-muted">{pack.reviewGuidance}</p>
          {activeCase ? (
            <div className="mt-5 grid gap-5">
              <div className="rounded-xl border border-hairline bg-surface-2/60 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-fg-muted">创作 brief（两候选相同）</p>
                <p className="mt-2 text-sm font-bold text-fg">{activeCase.brief.ideaText}</p>
                <p className="mt-2 text-xs text-fg-muted">目标 {activeCase.brief.goal} · 受众 {activeCase.brief.persona} · 平台 {activeCase.brief.platform} · 语言 {activeCase.brief.language}</p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <CandidateCard label="A" output={activeCase.candidateA} score={candidateA} onChange={setCandidateA} />
                <CandidateCard label="B" output={activeCase.candidateB} score={candidateB} onChange={setCandidateB} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="选题/用户问题更贴合"><select className="field-input" value={preferredForTopic} onChange={(event) => setPreferredForTopic(event.target.value as "A" | "B" | "tie")}><option value="tie">持平</option><option value="A">A</option><option value="B">B</option></select></Field>
                <Field label="整体更愿意采用"><select className="field-input" value={overallPreference} onChange={(event) => setOverallPreference(event.target.value as "A" | "B" | "tie")}><option value="tie">持平</option><option value="A">A</option><option value="B">B</option></select></Field>
              </div>
              <Field label="评审备注（可选）"><textarea className="field-input min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /></Field>
              <div className="flex justify-end"><button type="button" onClick={saveReview} className="btn-primary focus-ring">保存并进入下一组<ArrowRight className="h-4 w-4" /></button></div>
            </div>
          ) : (
            <p className="mt-5 rounded-xl border border-dashed border-hairline p-8 text-center text-sm font-semibold text-fg-muted">全部 case 已完成评审或暂无待评样本。</p>
          )}
        </Panel>
      ) : (
        <Panel className="p-5 md:p-6"><p className="rounded-xl border border-dashed border-hairline p-8 text-center text-sm font-semibold text-fg-muted">尚未导入盲评文件。盲评台只接受 Blind Reviewer Pack，不接受实验数据或答案文件。</p></Panel>
      )}
    </div>
  );
}
