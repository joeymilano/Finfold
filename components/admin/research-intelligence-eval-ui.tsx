"use client";

import React, { useEffect, useState } from "react";
import type { BlindReviewerCase } from "@/lib/research-intelligence-eval-files";
import type { ResearchIntelligenceCandidateScore } from "@/lib/research-intelligence-eval";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2"><span className="text-xs font-black text-fg">{label}</span>{children}</label>;
}

export function ScoreSelect({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="grid gap-1.5"><span className="text-xs font-bold text-fg-muted">{label}</span><select className="field-input" value={value} onChange={(event) => onChange(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}</select></label>;
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

export function CandidateCard({ label, output, score, onChange }: {
  label: "A" | "B";
  output: Pick<BlindReviewerCase["candidateA"], "title" | "body" | "cta">;
  score: ResearchIntelligenceCandidateScore;
  onChange: (score: ResearchIntelligenceCandidateScore) => void;
}) {
  return <article className="rounded-2xl border border-hairline bg-surface p-5"><p className="eyebrow">候选 {label}</p><h3 className="mt-3 text-xl font-black text-fg">{output.title}</h3><p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-7 text-fg">{output.body}</p><p className="mt-4 rounded-lg bg-action/[0.07] px-3 py-2 text-sm font-bold text-action-strong">{output.cta}</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><ScoreSelect label="问题贴合" value={score.topicFit} onChange={(value) => onChange({ ...score, topicFit: value })} /><ScoreSelect label="市场具体" value={score.marketSpecificity} onChange={(value) => onChange({ ...score, marketSpecificity: value })} /><ScoreSelect label="可执行" value={score.actionability} onChange={(value) => onChange({ ...score, actionability: value })} /></div><div className="mt-4 grid gap-2 text-xs font-semibold text-fg-muted"><Check label="首稿无需大改可采用" checked={score.firstDraftUsable} onChange={(value) => onChange({ ...score, firstDraftUsable: value })} /><Check label="存在无来源事实/幻觉" checked={score.hallucinatedClaim} onChange={(value) => onChange({ ...score, hallucinatedClaim: value })} /><Check label="存在明显来源复述" checked={score.sourceCopying} onChange={(value) => onChange({ ...score, sourceCopying: value })} /></div></article>;
}

export function emptyScore(): ResearchIntelligenceCandidateScore {
  return {
    topicFit: 3,
    marketSpecificity: 3,
    actionability: 3,
    firstDraftUsable: false,
    hallucinatedClaim: false,
    sourceCopying: false
  };
}

export function downloadJsonFile(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取文件。"));
    reader.readAsText(file);
  });
}

export function fileDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatUsd(value: number | null): string {
  return value == null ? "未知" : `$${value.toFixed(4)}`;
}

export function formatDuration(value: number | null): string {
  return value == null ? "未知" : `${(value / 1000).toFixed(1)}s`;
}

/**
 * Session state that survives a page refresh via localStorage, so a 3+ hour
 * experiment is not lost when the tab reloads. Storage failures never break
 * the workbench — the operator is still told to export checkpoint files.
 */
export function useRecoverableSession<T>(
  storageKey: string,
  deserialize: (raw: unknown) => T | null
): [T | null, React.Dispatch<React.SetStateAction<T | null>>, boolean] {
  const [session, setSession] = useState<T | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = deserialize(JSON.parse(raw) as unknown);
        if (parsed != null) setSession(parsed);
      }
    } catch {
      // Corrupted or unavailable storage: start fresh, checkpoint files remain
      // the durable recovery path.
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!restored) return;
    try {
      if (session == null) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, JSON.stringify(session));
    } catch {
      // Ignore quota errors; the operator is prompted to export checkpoints.
    }
  }, [session, restored, storageKey]);

  return [session, setSession, restored];
}
