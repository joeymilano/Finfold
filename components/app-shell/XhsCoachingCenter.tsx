"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Camera,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileSpreadsheet,
  Link2,
  Lock,
  Loader2,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  WandSparkles
} from "@/components/ui/icons";
import { buttonStyles } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/cn";
import { useLocale } from "@/hooks/useLocale";
import type {
  XhsDiagnosisEvidence,
  XhsDiagnosisReport,
  XhsEvidenceLevel,
  XhsFunnelStage
} from "@/lib/agent/xhs-coaching";

type DiagnosisRecord = {
  id: string;
  import_id?: string | null;
  diagnosis_type?: string;
  input?: Record<string, unknown>;
  report: XhsDiagnosisReport;
  created_at?: string;
};

type CoachingTask = {
  id: string;
  dayNumber: number;
  phase: string;
  kind: string;
  title: string;
  reason: string;
  deliverable: string;
  dueAt: string;
  targetMetric: string;
  singleVariable: string;
  completionProof: string;
  workbenchHref: string;
  status: "todo" | "in_progress" | "completed" | "skipped";
  completedAt: string | null;
};

type CoachingProgram = {
  id: string;
  status: string;
  startDate: string;
  currentDay: number;
  baselineDiagnosisId: string;
  latestDiagnosisId: string | null;
  finalRediagnosisReady: boolean;
  comparison: null | {
    baselineStage: XhsFunnelStage;
    currentStage: XhsFunnelStage;
    status: "advanced" | "unchanged" | "regressed";
    evidence: string;
    sampleChange: number;
  };
  checkpoints: {
    day7: { status: "improved" | "declined" | "unchanged" | "insufficient"; evidence: string };
    day14: { status: "improved" | "declined" | "unchanged" | "insufficient"; evidence: string };
  };
  tasks: CoachingTask[];
  checkIns: Array<{ id: string; taskId: string; proof: unknown; reflection: string; createdAt: string }>;
};

type RepresentativeDraft = { title: string; url: string; content: string };
type ImportMeta = { id: string; name: string; rowCount: number; accountUrl?: string | null; duplicate?: boolean; warnings?: string[] };

const EMPTY_NOTES: RepresentativeDraft[] = Array.from({ length: 3 }, () => ({ title: "", url: "", content: "" }));

const STAGE_LABEL: Record<XhsFunnelStage, { zh: string; en: string }> = {
  measurement: { zh: "数据", en: "Measurement" },
  policy: { zh: "政策", en: "Policy" },
  distribution: { zh: "分发", en: "Distribution" },
  click: { zh: "点击", en: "Click" },
  retention: { zh: "停留", en: "Retention" },
  value: { zh: "价值", en: "Value" },
  conversion: { zh: "转化", en: "Conversion" }
};

export function XhsCoachingCenter() {
  const locale = useLocale();
  const zh = locale !== "en";
  const [diagnoses, setDiagnoses] = useState<DiagnosisRecord[]>([]);
  const [program, setProgram] = useState<CoachingProgram | null>(null);
  const [accountUrl, setAccountUrl] = useState("");
  const [businessGoal, setBusinessGoal] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [representatives, setRepresentatives] = useState<RepresentativeDraft[]>(EMPTY_NOTES);
  const [platformNotice, setPlatformNotice] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [importMeta, setImportMeta] = useState<ImportMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkInTask, setCheckInTask] = useState<CoachingTask | null>(null);
  const [proof, setProof] = useState("");
  const [reflection, setReflection] = useState("");
  const [metricValue, setMetricValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [diagnosisResponse, programResponse] = await Promise.all([
        fetch("/api/agent/xhs/diagnoses?limit=5", { cache: "no-store" }),
        fetch("/api/agent/xhs/coaching-programs", { cache: "no-store" })
      ]);
      const diagnosisData = await diagnosisResponse.json().catch(() => ({})) as { diagnoses?: DiagnosisRecord[]; error?: string };
      const programData = await programResponse.json().catch(() => ({})) as { program?: CoachingProgram | null; error?: string };
      if (!diagnosisResponse.ok && diagnosisResponse.status !== 503) throw new Error(diagnosisData.error ?? (zh ? "暂时无法加载诊断记录。" : "Unable to load diagnoses."));
      if (!programResponse.ok && programResponse.status !== 503) throw new Error(programData.error ?? (zh ? "暂时无法加载陪跑计划。" : "Unable to load coaching."));
      setDiagnoses(diagnosisData.diagnoses ?? []);
      setProgram(programData.program ?? null);
      const latest = diagnosisData.diagnoses?.[0];
      if (latest?.import_id) {
        setImportMeta((current) => current ?? { id: String(latest.import_id), name: zh ? "最近一次创作中心导入" : "Latest Creator Center import", rowCount: latest.report.sample.imported ?? latest.report.sample.total, accountUrl: String(latest.input?.accountUrl ?? "") || null });
      }
      const storedInput = latest && typeof latest.input === "object"
        ? latest.input
        : null;
      if (storedInput) {
        setAccountUrl((current) => current || String(storedInput.accountUrl ?? ""));
        setBusinessGoal((current) => current || String(storedInput.businessGoal ?? ""));
        setTargetAudience((current) => current || String(storedInput.targetAudience ?? ""));
        setRepresentatives((current) => {
          if (current.some((item) => item.title || item.url)) return current;
          const saved = Array.isArray(storedInput.representativeNotes)
            ? storedInput.representativeNotes.flatMap((item) => {
                if (!item || typeof item !== "object") return [];
                const record = item as Record<string, unknown>;
                const title = String(record.title ?? "").trim();
                const url = String(record.url ?? "").trim();
                const content = String(record.content ?? "").trim();
                return title || url ? [{ title, url, content }] : [];
              }).slice(0, 12)
            : [];
          return saved.length >= 3 ? saved : [...saved, ...Array.from({ length: 3 - saved.length }, () => ({ title: "", url: "", content: "" }))];
        });
        setPlatformNotice((current) => {
          if (current) return current;
          if (!Array.isArray(storedInput.platformNotifications)) return "";
          return storedInput.platformNotifications.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const detail = String((item as Record<string, unknown>).detail ?? "").trim();
            return detail ? [detail] : [];
          }).join("\n\n");
        });
      }
      if (!diagnosisResponse.ok || !programResponse.ok) {
        setError(diagnosisData.error ?? programData.error ?? (zh ? "079 数据表尚未上线；你仍可填写资料包，执行 SQL 后即可诊断。" : "Migration 079 is not live yet. You can still prepare the intake."));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (zh ? "无法读取小红书陪跑状态。" : "Unable to load Xiaohongshu coaching."));
    } finally {
      setLoading(false);
    }
  }, [zh]);

  useEffect(() => {
    void load();
  }, [load]);

  const latest = diagnoses[0] ?? null;
  const report = latest?.report ?? null;
  const representativeCount = new Set(representatives.flatMap((item) => {
    const title = item.title.trim().toLowerCase().replace(/\s+/g, " ");
    const url = item.url.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
    return url ? [`url:${url}`] : title ? [`title:${title}`] : [];
  })).size;
  const intakeChecks = [
    Boolean(accountUrl.trim()),
    Boolean(importMeta || file || screenshots.length > 0 || pastedText.trim().length >= 10),
    representativeCount >= 3,
    Boolean(businessGoal.trim()),
    Boolean(targetAudience.trim())
  ];
  const intakeCompleted = intakeChecks.filter(Boolean).length;
  const activeTask = useMemo(() => {
    if (!program || program.status !== "active") return null;
    return program.tasks.find((task) => !["completed", "skipped"].includes(task.status) && task.dayNumber <= program.currentDay)
      ?? null;
  }, [program]);

  function updateRepresentative(index: number, patch: Partial<RepresentativeDraft>) {
    setRepresentatives((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function uploadImport(): Promise<string | undefined> {
    if (screenshots.length > 0 && (file || pastedText.trim().length >= 10)) {
      throw new Error(zh ? "截图与 CSV/XLSX/粘贴数据请分开导入，避免来源冲突。" : "Import screenshots separately from files or pasted tables to avoid source conflicts.");
    }
    if (screenshots.length > 0) {
      const formData = new FormData();
      screenshots.forEach((screenshot) => formData.append("screenshots", screenshot));
      if (accountUrl.trim()) formData.set("accountUrl", accountUrl.trim());
      const response = await fetch("/api/agent/xhs/data-import/screenshots", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: formData
      });
      const data = await response.json().catch(() => ({})) as { import?: ImportMeta; error?: string };
      if (!response.ok || !data.import) throw new Error(data.error ?? (zh ? "截图识别失败。" : "Screenshot extraction failed."));
      setImportMeta(data.import);
      setScreenshots([]);
      if (data.import.warnings?.length) {
        setNotice(data.import.warnings.join(" "));
      }
      return data.import.id;
    }
    if (!file && pastedText.trim().length < 10) return importMeta?.id;
    const formData = new FormData();
    if (file) formData.set("file", file);
    if (pastedText.trim()) formData.set("pastedText", pastedText.trim());
    if (accountUrl.trim()) formData.set("accountUrl", accountUrl.trim());
    const response = await fetch("/api/agent/xhs/data-import", { method: "POST", body: formData });
    const data = await response.json().catch(() => ({})) as { import?: ImportMeta; error?: string };
    if (!response.ok || !data.import) throw new Error(data.error ?? (zh ? "数据导入失败。" : "Data import failed."));
      setImportMeta(data.import);
      setFile(null);
      setPastedText("");
      return data.import.id;
  }

  async function runDiagnosis() {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const importId = await uploadImport();
      const response = await fetch("/api/agent/xhs/diagnoses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importId,
          ...(accountUrl.trim() ? { accountUrl: accountUrl.trim() } : {}),
          businessGoal: businessGoal.trim(),
          targetAudience: targetAudience.trim(),
          representativeNotes: representatives
            .filter((item) => item.title.trim() || item.url.trim())
            .map((item, index) => ({
              title: item.title.trim() || `${zh ? "代表笔记" : "Representative note"} ${index + 1}`,
              ...(item.url.trim() ? { url: item.url.trim() } : {}),
              ...(item.content.trim() ? { content: item.content.trim() } : {})
            })),
          platformNotifications: platformNotice.trim()
            ? [{ title: zh ? "用户提供的平台通知" : "User-provided platform notice", detail: platformNotice.trim() }]
            : [],
          locale
        })
      });
      const data = await response.json().catch(() => ({})) as { diagnosis?: { id: string; report: XhsDiagnosisReport }; error?: string };
      if (!response.ok || !data.diagnosis) throw new Error(data.error ?? (zh ? "诊断失败。" : "Diagnosis failed."));
      setNotice(zh ? "诊断已保存。每个原因都可以展开查看证据和来源。" : "Diagnosis saved. Every reason is traceable to evidence.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (zh ? "诊断失败。" : "Diagnosis failed."));
    } finally {
      setSubmitting(false);
    }
  }

  async function startCoaching() {
    if (!latest) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/xhs/coaching-programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosisId: latest.id, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai" })
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? (zh ? "无法创建陪跑计划。" : "Unable to create coaching program."));
      setNotice(zh ? "Day 0–14 任务已生成。发布仍由你亲自确认和完成。" : "Day 0–14 tasks created. You remain in control of publishing.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (zh ? "无法创建陪跑计划。" : "Unable to create coaching program."));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCheckIn() {
    if (!checkInTask || !proof.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent/xhs/tasks/${checkInTask.id}/check-ins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof: { type: proof.startsWith("http") ? "note_url" : "text", value: proof.trim() },
          observedMetrics: metricValue.trim() && Number.isFinite(Number(metricValue))
            ? { [checkInTask.targetMetric]: Number(metricValue) }
            : {},
          reflection: reflection.trim()
        })
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        roundTwoPlan?: { decision: string; stage: XhsFunnelStage; variable: string; targetMetric: string; reason: string } | null;
      };
      if (!response.ok) throw new Error(data.error ?? (zh ? "打卡失败。" : "Check-in failed."));
      setCheckInTask(null);
      setProof("");
      setReflection("");
      setMetricValue("");
      setNotice(data.roundTwoPlan
        ? (zh
            ? `Day 7 已复盘：第二轮只测试“${data.roundTwoPlan.variable}”，观察“${data.roundTwoPlan.targetMetric}”。${data.roundTwoPlan.reason}`
            : `Day 7 reviewed. Round two will test only “${data.roundTwoPlan.variable}”.`)
        : (zh ? `Day ${checkInTask.dayNumber} 完成证明已保存。` : `Day ${checkInTask.dayNumber} proof saved.`));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (zh ? "打卡失败。" : "Check-in failed."));
    } finally {
      setSubmitting(false);
    }
  }

  const needsRediagnosis = Boolean(
    program && checkInTask?.dayNumber === 14 && !program.finalRediagnosisReady
  );
  const isCheckpoint = checkInTask?.dayNumber === 7 || checkInTask?.dayNumber === 14;
  const needsCheckpointMetric = checkInTask?.dayNumber === 7 && !metricValue.trim();
  const needsCheckpointReflection = Boolean(isCheckpoint && !reflection.trim());

  return (
    <div className="mx-auto grid max-w-[1240px] gap-5 pb-12 xl:max-w-[1440px] 2xl:max-w-[1640px]">
      <section className="relative isolate overflow-hidden rounded-2xl border border-hairline bg-surface p-5 shadow-panel sm:p-7">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_9%_0%,rgb(var(--action)/0.14),transparent_34%),radial-gradient(circle_at_92%_12%,rgb(var(--positive)/0.08),transparent_28%)]" />
        <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-action/25 bg-action/[0.08] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-action-strong dark:text-action">
                <Sparkles className="h-3.5 w-3.5" />
                {zh ? "小红书陪跑" : "Xiaohongshu Coaching"}
              </span>
              <span className="rounded-full border border-positive/25 bg-positive/[0.07] px-2.5 py-1 text-[11px] font-bold text-positive">
                {zh ? "规则计算优先 · 证据可展开" : "Rules first · traceable evidence"}
              </span>
            </div>
            <h1 className="mt-4 max-w-4xl text-balance text-3xl font-black leading-[1.04] text-fg sm:text-5xl">
              {zh ? "为什么这篇没流量，接下来 14 天怎么做" : "Why this post stalled—and what to do for 14 days"}
            </h1>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-6 text-fg-muted sm:text-base">
              {zh
                ? "从账号与逐篇笔记诊断开始，把最早瓶颈变成单变量实验、创作任务、发布证明、复盘和再诊断。"
                : "Start with account and note diagnosis, then turn the earliest bottleneck into experiments, creation tasks, proof, review, and re-diagnosis."}
            </p>
          </div>
          <div className="grid gap-2 rounded-xl border border-hairline bg-bg/55 p-4">
            <p className="flex items-center gap-2 text-xs font-black text-fg"><ShieldCheck className="h-4 w-4 text-positive" />{zh ? "你始终掌握发布权" : "You control publishing"}</p>
            <p className="text-xs leading-5 text-fg-muted">{zh ? "系统可以生成选题、改稿、实验和复盘任务；不会自动评论、自动互动或无人值守代发。" : "Finfold can prepare topics, edits, experiments, and reviews. It never auto-comments, auto-engages, or publishes unattended."}</p>
          </div>
        </div>
      </section>

      {notice ? <div className="flex items-center gap-2 rounded-xl border border-positive/25 bg-positive/[0.07] px-4 py-3 text-sm font-semibold text-positive"><CheckCircle2 className="h-4 w-4" />{notice}</div> : null}
      {error ? <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/[0.07] px-4 py-3 text-sm leading-5 text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}

      {program ? (
        <CoachingProgramPanel
          program={program}
          activeTask={activeTask}
          locale={locale}
          onCheckIn={setCheckInTask}
        />
      ) : null}

      <Panel className="overflow-hidden p-0">
        <div className="grid border-b border-hairline lg:grid-cols-[310px_1fr]">
          <div className="border-b border-hairline bg-surface-2/55 p-5 lg:border-b-0 lg:border-r">
            <p className="eyebrow">{zh ? "5 分钟资料包" : "5-minute evidence pack"}</p>
            <p className="mt-3 text-3xl font-black text-fg">{intakeCompleted}/5</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-hairline">
              <motion.div className="h-full rounded-full bg-action" animate={{ width: `${intakeCompleted * 20}%` }} />
            </div>
            <div className="mt-5 grid gap-2 text-xs font-semibold">
              {[zh ? "账号链接" : "Account link", zh ? "30 天创作中心数据" : "30-day Creator Center data", zh ? "3 篇不同的代表笔记" : "3 distinct representative notes", zh ? "经营目标" : "Business goal", zh ? "目标用户" : "Target audience"].map((label, index) => (
                <div key={label} className={cn("flex items-center gap-2", intakeChecks[index] ? "text-positive" : "text-fg-muted")}>
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border", intakeChecks[index] ? "border-positive/30 bg-positive/10" : "border-hairline")}>
                    {intakeChecks[index] ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  {label}
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs leading-5 text-fg-muted">
              {zh ? "只有账号链接也能体检，但会明确标为低证据，不能判断平台处罚状态。" : "An account link alone gets a low-evidence check and cannot determine enforcement status."}
            </p>
          </div>

          <div className="grid gap-5 p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={zh ? "小红书账号链接" : "Xiaohongshu account URL"} icon={<Link2 className="h-4 w-4" />}>
                <input value={accountUrl} onChange={(event) => {
                  const next = event.target.value;
                  setAccountUrl(next);
                  if (importMeta?.accountUrl && importMeta.accountUrl !== next.trim()) setImportMeta(null);
                }} type="url" placeholder="https://www.xiaohongshu.com/user/profile/..." className="input min-h-11 w-full" />
              </Field>
              <Field label={zh ? "经营目标" : "Business goal"} icon={<Target className="h-4 w-4" />}>
                <input value={businessGoal} onChange={(event) => setBusinessGoal(event.target.value)} placeholder={zh ? "例如：每月获得 10 个高质量咨询" : "e.g. 10 qualified inquiries per month"} className="input min-h-11 w-full" />
              </Field>
            </div>
            <Field label={zh ? "目标用户" : "Target audience"} icon={<Target className="h-4 w-4" />}>
              <input value={targetAudience} onChange={(event) => setTargetAudience(event.target.value)} placeholder={zh ? "他们是谁、现在卡在哪里、为什么会行动" : "Who they are, what blocks them, and why they act"} className="input min-h-11 w-full" />
            </Field>

            <div className="grid gap-3 rounded-xl border border-hairline bg-surface-2/35 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 text-sm font-black text-fg"><FileSpreadsheet className="h-4 w-4 text-action-strong dark:text-action" />{zh ? "近 30 天创作中心数据" : "30-day Creator Center data"}</p>
                  <p className="mt-1 text-xs text-fg-muted">CSV / XLSX · {zh ? "粘贴表格 · 或创作中心截图" : "paste a table · or Creator Center screenshots"}</p>
                </div>
                {importMeta ? <span className="rounded-full border border-positive/25 bg-positive/[0.07] px-2.5 py-1 text-[11px] font-bold text-positive">{importMeta.duplicate ? (zh ? "已识别重复导入" : "Duplicate recognized") : (zh ? `${importMeta.rowCount} 篇已导入` : `${importMeta.rowCount} imported`)}</span> : null}
              </div>
              <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-action/35 bg-action/[0.035] px-4 text-sm font-bold text-action-strong transition hover:bg-action/[0.07] dark:text-action">
                <Upload className="h-4 w-4" />
                {file?.name ?? (zh ? "选择 CSV / XLSX" : "Choose CSV / XLSX")}
                <input type="file" accept=".csv,.xlsx,text/csv" className="sr-only" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setScreenshots([]); }} />
              </label>
              <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-hairline bg-surface px-4 text-sm font-bold text-fg transition hover:border-action/30 hover:bg-action/[0.035]">
                <Camera className="h-4 w-4 text-action-strong dark:text-action" />
                {screenshots.length > 0
                  ? (zh ? `已选择 ${screenshots.length} 张截图` : `${screenshots.length} screenshots selected`)
                  : (zh ? "选择创作中心截图（最多 6 张）" : "Choose Creator Center screenshots (up to 6)")}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  onChange={(event) => { setScreenshots(Array.from(event.target.files ?? []).slice(0, 6)); setFile(null); setPastedText(""); }}
                />
              </label>
              {screenshots.length > 0 ? <p className="text-[11px] leading-5 text-fg-muted">{zh ? "识别只抄录清晰可见的指标；原图在识别后立即删除。截图识别消耗 5 AI Credits。" : "Only clearly visible metrics are transcribed. Images are deleted after extraction. Screenshot extraction uses 5 AI Credits."}</p> : null}
              <textarea value={pastedText} onChange={(event) => { setPastedText(event.target.value); if (event.target.value) setScreenshots([]); }} rows={4} placeholder={zh ? "或粘贴：标题,发布时间,曝光量,阅读量,封面点击率,平均观看时长,收藏数,分享数,涨粉" : "Or paste: title,published date,impressions,views,cover CTR,view duration,saves,shares,follows"} className="input w-full resize-y py-3 font-mono text-xs leading-5" />
              {importMeta?.warnings?.length ? <div className="rounded-lg border border-warning/20 bg-warning/[0.05] p-3"><p className="text-[11px] font-black text-warning">{zh ? "需要人工核对" : "Review required"}</p>{importMeta.warnings.map((warning) => <p key={warning} className="mt-1 text-[11px] leading-5 text-fg-muted">· {warning}</p>)}</div> : null}
            </div>

            <div className="grid gap-3">
              <div>
                <p className="text-sm font-black text-fg">{zh ? "至少 3 篇代表笔记" : "At least 3 representative notes"}</p>
                <p className="mt-1 text-xs text-fg-muted">{zh ? "建议各选：成熟代表作 / 低流量样本 / 想重点修的一篇" : "Choose a mature winner, a low-reach post, and one you want to fix."}</p>
              </div>
              {representatives.map((item, index) => (
                <div key={index} className="grid gap-2 rounded-xl border border-hairline p-3 sm:grid-cols-[42px_1fr_1fr] sm:items-start">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-action/[0.09] text-xs font-black text-action-strong dark:text-action">{index + 1}</span>
                  <input value={item.title} onChange={(event) => updateRepresentative(index, { title: event.target.value })} placeholder={zh ? "笔记标题" : "Post title"} className="input min-h-10 w-full" />
                  <input value={item.url} onChange={(event) => updateRepresentative(index, { url: event.target.value })} placeholder={zh ? "笔记链接（可选）" : "Post URL (optional)"} className="input min-h-10 w-full" />
                  <label className="grid gap-1.5 sm:col-span-2 sm:col-start-2">
                    <span className="text-[11px] font-bold text-fg-muted">{zh ? "笔记正文 / 口播稿（可选，进入创作台时会自动带入）" : "Post copy / script (optional; carried into Workbench)"}</span>
                    <textarea
                      value={item.content}
                      onChange={(event) => updateRepresentative(index, { content: event.target.value })}
                      rows={3}
                      maxLength={12_000}
                      aria-label={zh ? `代表笔记 ${index + 1} 正文` : `Representative note ${index + 1} copy`}
                      placeholder={zh ? "粘贴原文，Finfold 会把诊断原因和这篇素材一起交给创作台改稿" : "Paste the original so Workbench receives both the diagnosis and source material"}
                      className="input w-full resize-y py-3 text-xs leading-5"
                    />
                  </label>
                </div>
              ))}
              <button type="button" disabled={representatives.length >= 12} onClick={() => setRepresentatives((items) => [...items, { title: "", url: "", content: "" }])} className="justify-self-start text-xs font-bold text-action-strong hover:underline disabled:cursor-not-allowed disabled:opacity-45 dark:text-action">
                + {zh ? "再加一篇" : "Add another"}
              </button>
            </div>

            <details className="rounded-xl border border-hairline bg-surface-2/30 p-4">
              <summary className="cursor-pointer text-sm font-bold text-fg">{zh ? "可选：粘贴平台通知原文" : "Optional: paste a platform notice"}</summary>
              <p className="mt-2 text-xs leading-5 text-fg-muted">{zh ? "只有平台通知或直接资格提示才能支持政策结论。低流量本身不会被写成“限流”。" : "Only direct platform notices support a policy conclusion. Low reach alone is never labeled as throttling."}</p>
              <textarea value={platformNotice} onChange={(event) => setPlatformNotice(event.target.value)} rows={4} className="input mt-3 w-full resize-y py-3" placeholder={zh ? "完整粘贴通知，不要只写“好像被限流”" : "Paste the full notice text"} />
            </details>

            <div className="flex flex-col gap-3 border-t border-hairline pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-fg-muted">{zh ? "诊断会保存证据来源、个人分位基准和前三项行动。" : "The diagnosis stores sources, personal baselines, and top three actions."}</p>
              <button type="button" onClick={() => void runDiagnosis()} disabled={submitting} className="btn-primary min-h-11 justify-center px-5 disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                {zh ? (report ? "重新诊断" : "生成账号与逐篇诊断") : (report ? "Re-diagnose" : "Diagnose account and posts")}
              </button>
            </div>
          </div>
        </div>
      </Panel>

      {loading ? <div className="flex min-h-40 items-center justify-center text-sm text-fg-muted"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{zh ? "读取诊断与陪跑进度…" : "Loading diagnosis and coaching…"}</div> : null}
      {report && latest ? (
        <DiagnosisReportPanel
          diagnosisId={latest.id}
          report={report}
          locale={locale}
          program={program}
          submitting={submitting}
          onStartCoaching={() => void startCoaching()}
        />
      ) : null}

      {checkInTask ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-t-2xl border border-hairline bg-surface p-5 shadow-raised sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><p className="eyebrow">Day {checkInTask.dayNumber} · {zh ? "完成证明" : "Completion proof"}</p><h3 className="mt-2 text-xl font-black text-fg">{checkInTask.title}</h3></div>
              <button type="button" onClick={() => setCheckInTask(null)} className="text-xs font-bold text-fg-muted hover:text-fg">{zh ? "关闭" : "Close"}</button>
            </div>
            <p className="mt-3 text-sm leading-6 text-fg-muted">{checkInTask.completionProof}</p>
            {needsRediagnosis ? <div className="mt-4 rounded-xl border border-action/25 bg-action/[0.06] p-4"><p className="text-xs font-black text-action-strong dark:text-action">{zh ? "先完成 Day 14 再诊断" : "Re-diagnose before Day 14 check-in"}</p><p className="mt-1 text-xs leading-5 text-fg-muted">{zh ? "关闭此弹窗，在上方导入第二轮的新数据，然后点击“重新诊断”。生成 Day 14 对比后才能完成最终复盘。" : "Close this dialog, import the second round's latest data above, then select Re-diagnose. The final review unlocks after the Day 14 comparison exists."}</p></div> : null}
            <label className="mt-5 grid gap-2 text-xs font-bold text-fg"><span>{zh ? "链接、截图说明或数据导入记录" : "URL, screenshot note, or import record"}</span><textarea value={proof} onChange={(event) => setProof(event.target.value)} rows={3} className="input w-full resize-y py-3" /></label>
            <label className="mt-4 grid gap-2 text-xs font-bold text-fg"><span>{zh ? "复盘（可选）" : "Reflection (optional)"}</span><textarea value={reflection} onChange={(event) => setReflection(event.target.value)} rows={3} className="input w-full resize-y py-3" placeholder={zh ? "发生了什么、保持了什么不变、下一步怎么验证" : "What happened, what stayed constant, and what to test next"} /></label>
            {checkInTask.dayNumber === 7 || checkInTask.dayNumber === 14 ? <label className="mt-4 grid gap-2 text-xs font-bold text-fg"><span>{zh ? `同口径主指标：${checkInTask.targetMetric}` : `Comparable primary metric: ${checkInTask.targetMetric}`}</span><input value={metricValue} onChange={(event) => setMetricValue(event.target.value)} type="number" inputMode="decimal" className="input min-h-11 w-full" placeholder={zh ? "填写与 Day 0 同口径的数值" : "Use the same definition as Day 0"} /></label> : null}
            {needsCheckpointMetric || needsCheckpointReflection ? <p className="mt-3 text-xs leading-5 text-warning">{zh
              ? `${needsCheckpointMetric ? "Day 7 必须填写同口径主指标。" : ""}${needsCheckpointReflection ? "检查点必须写下结论与下一步。" : ""}`
              : `${needsCheckpointMetric ? "Day 7 requires the comparable primary metric. " : ""}${needsCheckpointReflection ? "Checkpoint reflection and next step are required." : ""}`}</p> : null}
            <button type="button" onClick={() => void submitCheckIn()} disabled={submitting || !proof.trim() || needsRediagnosis || needsCheckpointMetric || needsCheckpointReflection} className="btn-primary mt-5 min-h-11 w-full justify-center disabled:opacity-45">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{needsRediagnosis ? (zh ? "等待重新诊断" : "Re-diagnosis required") : (zh ? "保存完成证明" : "Save proof")}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <label className="grid gap-2"><span className="flex items-center gap-2 text-xs font-black text-fg">{icon}{label}</span>{children}</label>;
}

function DiagnosisReportPanel({ diagnosisId, report, locale, program, submitting, onStartCoaching }: {
  diagnosisId: string;
  report: XhsDiagnosisReport;
  locale: "zh" | "en";
  program: CoachingProgram | null;
  submitting: boolean;
  onStartCoaching: () => void;
}) {
  const zh = locale !== "en";
  const programLabel = program?.status === "completed"
    ? (zh ? "本轮陪跑已完成" : "Coaching cycle complete")
    : program?.status === "paused"
      ? (zh ? "陪跑已暂停" : "Coaching paused")
    : (zh ? "陪跑进行中" : "Coaching active");
  return <section className="grid gap-5" aria-label={zh ? "小红书诊断报告" : "Xiaohongshu diagnosis report"}>
    <Panel className="relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-action" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ConfidenceBadge level={report.primaryProblem.confidence} locale={locale} />
            <span className="rounded-full border border-hairline bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-fg-muted">{zh ? `${report.sample.mature} 篇成熟样本` : `${report.sample.mature} mature posts`}</span>
            <span className="rounded-full border border-hairline bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-fg-muted">{report.mode === "diagnostic_package" ? (zh ? "完整资料包" : "Full pack") : (zh ? "快速体检" : "Quick check")}</span>
          </div>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-action-strong dark:text-action">{zh ? "最早主问题" : "Earliest primary bottleneck"} · {STAGE_LABEL[report.primaryProblem.stage][locale]}</p>
          <h2 className="mt-2 text-balance text-2xl font-black text-fg sm:text-3xl">{report.primaryProblem.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-fg-muted">{report.primaryProblem.reason}</p>
          <div className="mt-4 grid max-w-3xl gap-2">
            {report.accountFindings.map((finding) => <FindingEvidence key={`account-${finding.stage}`} finding={finding} evidence={report.evidence} locale={locale} />)}
          </div>
        </div>
        {!program || program.status === "completed" ? <button type="button" onClick={onStartCoaching} disabled={submitting} className="btn-primary min-h-11 shrink-0 justify-center px-5 disabled:opacity-50"><CalendarDays className="h-4 w-4" />{program?.status === "completed" ? (zh ? "用最新诊断开始下一轮" : "Start next cycle from latest diagnosis") : (zh ? "开始 14 天陪跑" : "Start 14-day coaching")}</button> : <span className={cn("inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-bold", program.status === "paused" ? "border-warning/25 bg-warning/[0.07] text-warning" : "border-positive/25 bg-positive/[0.07] text-positive")}><CheckCircle2 className="h-4 w-4" />{programLabel}</span>}
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {report.topActions.map((action) => <div key={action.rank} className="rounded-xl border border-hairline bg-surface-2/40 p-4"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-action-strong dark:text-action">TOP {action.rank}</p><p className="mt-2 text-sm font-black text-fg">{action.title}</p><p className="mt-2 text-xs leading-5 text-fg-muted">{action.deliverable}</p><p className="mt-3 text-[11px] font-bold text-fg-muted">{zh ? "只改：" : "Only change: "}{action.singleVariable}</p><Link href={action.workbenchHref} className="mt-3 inline-flex items-center gap-1 text-xs font-black text-action-strong hover:underline dark:text-action">{zh ? "去创作台执行" : "Execute in Workbench"}<ArrowRight className="h-3 w-3" /></Link></div>)}
      </div>
    </Panel>

    <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
      <Panel className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">{zh ? "逐篇笔记诊断" : "Per-post diagnosis"}</p><h3 className="mt-2 text-xl font-black text-fg">{zh ? "每篇从最早断点开始" : "Start at each post's earliest break"}</h3></div><BarChart3 className="h-5 w-5 text-action-strong dark:text-action" /></div>
        <div className="mt-4 grid gap-2">
          {report.noteDiagnoses.length > 0 ? report.noteDiagnoses.map((note, index) => <details key={`${note.url ?? note.title}-${note.publishedAt ?? "unknown"}-${index}`} className="group rounded-xl border border-hairline bg-surface-2/30 p-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-fg">{note.title}</p><p className="mt-1 text-xs text-fg-muted">{note.headline} · {note.maturity === "mature" ? (zh ? "成熟" : "Mature") : note.maturity === "early_signal" ? (zh ? "早期信号" : "Early signal") : (zh ? "成熟度未知" : "Unknown maturity")}</p></div><ChevronDown className="h-4 w-4 shrink-0 text-fg-muted transition group-open:rotate-180" /></summary><div className="mt-3 grid gap-2 border-t border-hairline pt-3">{note.findings.length > 0 ? note.findings.map((finding) => <FindingEvidence key={`${note.url ?? note.title}-${finding.stage}`} finding={finding} evidence={report.evidence} locale={locale} />) : <p className="text-xs text-fg-muted">{zh ? "证据不足，无法展开下游原因。" : "Insufficient evidence for downstream causes."}</p>}</div></details>) : <p className="rounded-xl border border-dashed border-hairline p-5 text-sm text-fg-muted">{zh ? "补充至少 3 篇代表笔记后，这里会显示逐篇诊断。" : "Add at least three representative posts for per-post diagnosis."}</p>}
        </div>
      </Panel>

      <Panel className="p-5 sm:p-6">
        <p className="eyebrow">{zh ? "证据账本" : "Evidence ledger"}</p>
        <h3 className="mt-2 text-xl font-black text-fg">{zh ? "原因、来源、可信度" : "Reason, source, confidence"}</h3>
        <div className="mt-4 grid gap-2">
          {report.evidence.map((item) => <EvidenceItem key={item.id} item={item} locale={locale} />)}
        </div>
        {report.limitations.length > 0 ? <div className="mt-4 rounded-xl border border-warning/20 bg-warning/[0.05] p-4"><p className="flex items-center gap-2 text-xs font-black text-warning"><AlertTriangle className="h-4 w-4" />{zh ? "判断边界" : "Limits"}</p>{report.limitations.map((item) => <p key={item} className="mt-2 text-xs leading-5 text-fg-muted">· {item}</p>)}</div> : null}
        <p className="mt-4 text-[10px] text-fg-muted">Diagnosis ID · {diagnosisId}</p>
      </Panel>
    </div>
  </section>;
}

function FindingEvidence({ finding, evidence, locale }: {
  finding: XhsDiagnosisReport["accountFindings"][number];
  evidence: XhsDiagnosisEvidence[];
  locale: "zh" | "en";
}) {
  const zh = locale !== "en";
  const sources = evidence.filter((item) => finding.evidenceIds.includes(item.id));
  return <details className="group/finding rounded-lg border border-hairline bg-surface/60 p-3">
    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-xs">
      <span className="font-bold text-fg">{STAGE_LABEL[finding.stage][locale]}</span>
      <span className={cn("text-right", finding.status === "bottleneck" ? "text-risk" : finding.status === "watch" ? "text-warning" : finding.status === "healthy" ? "text-positive" : "text-fg-muted")}>{finding.title}</span>
    </summary>
    <div className="mt-2 border-t border-hairline pt-2">
      <p className="text-[11px] leading-5 text-fg-muted">{finding.reason}</p>
      {sources.length > 0 ? sources.map((source) => <p key={source.id} className="mt-1 text-[10px] leading-4 text-fg-muted"><span className="font-black text-fg">{zh ? "来源：" : "Source: "}</span>{source.sourceLabel} · {source.observed}</p>) : <p className="mt-1 text-[10px] leading-4 text-warning">{zh ? "没有可展开的直接证据。" : "No direct evidence is available."}</p>}
    </div>
  </details>;
}

function EvidenceItem({ item, locale }: { item: XhsDiagnosisEvidence; locale: "zh" | "en" }) {
  const zh = locale !== "en";
  return <details className="group rounded-xl border border-hairline bg-surface-2/30 p-3.5"><summary className="flex cursor-pointer list-none items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><ConfidenceBadge level={item.level} locale={locale} /><span className="text-[10px] font-bold text-fg-muted">{item.sourceLabel}</span></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-fg">{item.observed}</p></div><ChevronDown className="mt-1 h-4 w-4 shrink-0 text-fg-muted transition group-open:rotate-180" /></summary><div className="mt-3 border-t border-hairline pt-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-fg-muted">{zh ? "这条证据能说明什么" : "What this supports"}</p><p className="mt-1 text-xs leading-5 text-fg-muted">{item.implication}</p></div></details>;
}

function ConfidenceBadge({ level, locale }: { level: XhsEvidenceLevel; locale: "zh" | "en" }) {
  const copy = {
    confirmed: locale === "en" ? "Confirmed" : "已确认",
    supported_hypothesis: locale === "en" ? "Supported hypothesis" : "证据支持的假设",
    insufficient: locale === "en" ? "Insufficient" : "证据不足"
  }[level];
  return <span className={cn("rounded-full border px-2 py-1 text-[10px] font-black", level === "confirmed" ? "border-positive/25 bg-positive/[0.07] text-positive" : level === "supported_hypothesis" ? "border-action/25 bg-action/[0.07] text-action-strong dark:text-action" : "border-warning/25 bg-warning/[0.07] text-warning")}>{copy}</span>;
}

function CoachingProgramPanel({ program, activeTask, locale, onCheckIn }: { program: CoachingProgram; activeTask: CoachingTask | null; locale: "zh" | "en"; onCheckIn: (task: CoachingTask) => void }) {
  const zh = locale !== "en";
  const completed = program.tasks.filter((task) => task.status === "completed").length;
  const completedProgram = program.status === "completed";
  const pausedProgram = program.status === "paused";
  const actionableProgram = program.status === "active";
  const nextTask = program.tasks.find((task) => !["completed", "skipped"].includes(task.status)) ?? null;
  return <Panel className="overflow-hidden p-0">
    <div className="grid lg:grid-cols-[360px_1fr]">
      <div className="border-b border-hairline bg-[linear-gradient(145deg,rgb(var(--action)/0.11),rgb(var(--surface-2)/0.42))] p-5 lg:border-b-0 lg:border-r lg:p-6">
        <div className="flex items-center justify-between gap-3"><span className="rounded-full border border-action/25 bg-action/[0.08] px-2.5 py-1 text-[11px] font-black text-action-strong dark:text-action">DAY {program.currentDay} / 14</span><span className="text-xs font-bold text-fg-muted">{completed}/15 {zh ? "已完成" : "done"}</span></div>
        <h2 className="mt-4 text-2xl font-black text-fg">{completedProgram ? (zh ? "本轮陪跑已完成" : "Coaching cycle complete") : pausedProgram ? (zh ? "陪跑已暂停" : "Coaching paused") : (zh ? "今日陪跑行动" : "Today's coaching action")}</h2>
        {pausedProgram ? <p className="mt-4 text-sm leading-6 text-warning">{zh ? "暂停期间不会开放或完成任务；恢复计划后从当前未完成任务继续。" : "Tasks stay locked while paused. Resume the program to continue from the current open task."}</p> : completedProgram ? <p className="mt-4 text-sm leading-6 text-positive">{zh ? "Day 14 对比与完成证明已经保存。下一周期从最新诊断的前三项行动继续。" : "The Day 14 comparison and proof are saved. Continue from the latest diagnosis's top actions."}</p> : activeTask ? <div className="mt-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-action-strong dark:text-action">Day {activeTask.dayNumber}</p><p className="text-[11px] font-bold text-fg-muted">{zh ? "截止" : "Due"} · {formatDueDate(activeTask.dueAt, locale)}</p></div><p className="mt-1 text-lg font-black text-fg">{activeTask.title}</p><p className="mt-2 text-sm leading-6 text-fg-muted">{activeTask.reason}</p><div className="mt-4 grid gap-2 rounded-xl border border-hairline bg-surface/70 p-3 text-xs"><p><span className="font-black text-fg">{zh ? "交付物：" : "Deliverable: "}</span><span className="text-fg-muted">{activeTask.deliverable}</span></p><p><span className="font-black text-fg">{zh ? "只改：" : "Only change: "}</span><span className="text-fg-muted">{activeTask.singleVariable}</span></p><p><span className="font-black text-fg">{zh ? "目标指标：" : "Metric: "}</span><span className="text-fg-muted">{activeTask.targetMetric}</span></p></div><div className="mt-4 flex flex-col gap-2 sm:flex-row">{activeTask.workbenchHref.startsWith("/workbench") ? <Link href={activeTask.workbenchHref} className="btn-primary min-h-10 flex-1 justify-center text-xs"><WandSparkles className="h-4 w-4" />{zh ? "去创作台执行" : "Open Workbench"}</Link> : null}<button type="button" onClick={() => onCheckIn(activeTask)} className={cn(buttonStyles({ variant: "secondary", size: "sm" }), "min-h-10 flex-1 justify-center text-xs")}><CheckCircle2 className="h-4 w-4" />{activeTask.dayNumber === 14 ? (zh ? "开始最终复盘" : "Start final review") : (zh ? "提交完成证明" : "Submit proof")}</button></div></div> : <p className="mt-4 text-sm leading-6 text-positive">{nextTask ? (zh ? `今天已完成。下一项 Day ${nextTask.dayNumber} 将按日程开放。` : `Today is complete. Day ${nextTask.dayNumber} unlocks on schedule.`) : (zh ? "本轮没有待办任务。" : "No open tasks remain in this cycle.")}</p>}
        <div className="mt-5 grid gap-2">
          {[program.checkpoints?.day7, program.checkpoints?.day14].filter(Boolean).map((checkpoint, index) => <div key={index} className={cn("rounded-xl border p-3", checkpoint.status === "improved" ? "border-positive/25 bg-positive/[0.06]" : checkpoint.status === "insufficient" ? "border-hairline bg-surface/50" : "border-warning/25 bg-warning/[0.05]")}><p className={cn("text-xs font-black", checkpoint.status === "improved" ? "text-positive" : checkpoint.status === "insufficient" ? "text-fg-muted" : "text-warning")}>{index === 0 ? "Day 0 / 7" : "Day 0 / 14"}</p><p className="mt-1 text-xs leading-5 text-fg-muted">{checkpoint.evidence}</p></div>)}
          {program.comparison ? <div className={cn("rounded-xl border p-3", program.comparison.status === "advanced" ? "border-positive/25 bg-positive/[0.06]" : program.comparison.status === "regressed" ? "border-risk/25 bg-risk/[0.05]" : "border-hairline bg-surface/50")}><p className={cn("text-xs font-black", program.comparison.status === "advanced" ? "text-positive" : program.comparison.status === "regressed" ? "text-risk" : "text-fg-muted")}>{zh ? "再诊断漏斗变化" : "Re-diagnosis funnel shift"}</p><p className="mt-1 text-xs leading-5 text-fg-muted">{program.comparison.evidence}</p><p className="mt-1 text-[10px] font-bold text-fg-muted">{program.comparison.sampleChange >= 0 ? "+" : ""}{program.comparison.sampleChange} {zh ? "篇成熟样本" : "mature samples"}</p></div> : null}
        </div>
      </div>
      <div className="min-w-0 p-5 lg:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">{zh ? "两轮单变量实验" : "Two single-variable rounds"}</p><h3 className="mt-2 text-xl font-black text-fg">Day 0 → 14</h3></div><CalendarDays className="h-5 w-5 text-action-strong dark:text-action" /></div>
        <div className="mt-5 flex gap-3 overflow-x-auto pb-3">
          {program.tasks.map((task) => {
            const future = task.dayNumber > program.currentDay;
            const blockedByEarlierTask = task.status !== "completed" && task.status !== "skipped" && task.id !== activeTask?.id;
            const locked = !actionableProgram || future || blockedByEarlierTask;
            const lockTitle = pausedProgram
              ? (zh ? "陪跑已暂停" : "Coaching is paused")
              : future
                ? (zh ? `Day ${task.dayNumber} 到达后开放` : `Unlocks on Day ${task.dayNumber}`)
                : blockedByEarlierTask
                  ? (zh ? "请先完成更早的未关闭任务" : "Complete the earlier open task first")
                  : undefined;
            return <button key={task.id} type="button" disabled={locked || task.status === "completed" || task.status === "skipped"} title={lockTitle} onClick={() => !locked && onCheckIn(task)} className={cn("group min-w-[148px] rounded-xl border p-3 text-left transition disabled:cursor-default", task.status === "completed" ? "border-positive/25 bg-positive/[0.05]" : task.status === "skipped" ? "border-hairline bg-surface-2/20 opacity-60" : locked ? "border-hairline bg-surface-2/15 opacity-55" : task.dayNumber === activeTask?.dayNumber ? "border-action/40 bg-action/[0.07] shadow-[inset_0_3px_0_rgb(var(--action))]" : "border-hairline bg-surface-2/30 hover:border-action/25")}><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black text-fg-muted">DAY {task.dayNumber}</span>{task.status === "completed" ? <Check className="h-3.5 w-3.5 text-positive" /> : locked ? <Lock className="h-3.5 w-3.5 text-fg-muted" /> : <Clock className="h-3.5 w-3.5 text-fg-muted" />}</div><p className="mt-2 text-xs font-black leading-5 text-fg">{task.title}</p><p className="mt-2 line-clamp-2 text-[10px] leading-4 text-fg-muted">{future ? (zh ? `将在 Day ${task.dayNumber} 开放` : `Unlocks on Day ${task.dayNumber}`) : task.deliverable}</p></button>;
          })}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-fg-muted"><span className="rounded-lg bg-surface-2 px-2 py-2">Day 1–6 · {zh ? "第一轮" : "Round 1"}</span><span className="rounded-lg bg-surface-2 px-2 py-2">Day 7 · {zh ? "复盘" : "Review"}</span><span className="rounded-lg bg-surface-2 px-2 py-2">Day 8–14 · {zh ? "第二轮 + 再诊断" : "Round 2 + re-diagnosis"}</span></div>
      </div>
    </div>
  </Panel>;
}

function formatDueDate(value: string, locale: "zh" | "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}
