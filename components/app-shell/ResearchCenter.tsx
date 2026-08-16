"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  Loader2,
  Radar,
  Search,
  Sparkles,
  Upload
} from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { useLocale } from "@/hooks/useLocale";
import type {
  ResearchMission,
  ResearchMissionType,
  ResearchSourceType
} from "@/lib/operations/research";

const missionCards: Array<{
  id: ResearchMissionType;
  icon: typeof Search;
  zh: string;
  en: string;
  detailZh: string;
  detailEn: string;
  questionZh: string;
  questionEn: string;
}> = [
  { id: "account_diagnosis", icon: Radar, zh: "账号诊断", en: "Account diagnosis", detailZh: "账号定位、内容表现、异常信号与恢复动作", detailEn: "Positioning, performance, anomalies and recovery", questionZh: "这个账号当前最关键的增长瓶颈是什么，未来 14 天应如何验证并改善？", questionEn: "What is this account's primary growth bottleneck and how should we test it over 14 days?" },
  { id: "category_opportunity", icon: BarChart3, zh: "品类机会", en: "Category opportunity", detailZh: "拆解需求、关键词、内容空白和 14 天抢位动作", detailEn: "Demand, keywords, content gaps and a 14-day entry plan", questionZh: "这个品类有哪些有证据支撑但尚未被满足的内容与转化机会？", questionEn: "Which evidence-backed content and conversion gaps remain underserved in this category?" },
  { id: "product_competitor", icon: Search, zh: "商品 / 竞品", en: "Product / competitor", detailZh: "对比卖点、投放内容、用户异议与差异化策略", detailEn: "Compare claims, content, objections and differentiation", questionZh: "竞品靠什么内容获得关注与成交，我们应该复制什么、避开什么、差异化什么？", questionEn: "What drives competitor attention and conversion, and what should we copy, avoid, or differentiate?" }
];

const sourceOptions: Array<{ id: ResearchSourceType; zh: string; en: string }> = [
  { id: "first_party_analytics", zh: "账号后台 / 一方数据", en: "First-party analytics" },
  { id: "licensed_provider", zh: "合规数据服务导出", en: "Licensed provider export" },
  { id: "public_web", zh: "公开网页观察", en: "Public web observation" },
  { id: "manual_observation", zh: "人工访谈 / 观察", en: "Interview / manual observation" }
];

type ProgramResponse = { program?: { id: string; status: string } | null };
type MissionsResponse = { missions?: ResearchMission[]; mission?: ResearchMission; error?: string };

export function ResearchCenter() {
  const locale = useLocale();
  const en = locale === "en";
  const [missions, setMissions] = useState<ResearchMission[]>([]);
  const [programId, setProgramId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ResearchMissionType>("category_opportunity");
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState(missionCards[1].questionZh);
  const [subjects, setSubjects] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [sourceType, setSourceType] = useState<ResearchSourceType>("first_party_analytics");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function importEvidenceFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) {
      setMessage(en ? "Evidence files must be 1 MB or smaller." : "证据文件不能超过 1 MB。");
      return;
    }
    const text = await file.text();
    setEvidenceText(text.slice(0, 12000));
    setMessage(en ? "Evidence file loaded. Review it before creating the mission." : "证据文件已载入，请检查后再建立任务。");
  }

  function exportMission(mission: ResearchMission) {
    if (!mission.decision) return;
    const report = [
      `# ${mission.title}`,
      "",
      mission.question,
      "",
      `## ${copy.opportunities}`,
      ...mission.decision.opportunities.flatMap((item) => [`- **${item.title}** (${item.evidenceIds.join(", ")}): ${item.rationale}`]),
      "",
      `## ${copy.strategy}`,
      mission.decision.strategy.thesis,
      "",
      ...mission.decision.strategy.next14Days.map((item, index) => `${index + 1}. ${item}`),
      "",
      `## ${copy.conversion}`,
      mission.decision.strategy.conversionPath,
      "",
      "## Evidence",
      ...mission.evidence.map((item) => `- ${item.id} [${item.sourceType}]: ${item.excerpt}`),
      "",
      "## Limitations",
      ...mission.decision.limitations.map((item) => `- ${item}`)
    ].join("\n");
    const url = URL.createObjectURL(new Blob([report], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `finfold-research-${mission.id}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/operations/program", { cache: "no-store" }).then((response) => response.json() as Promise<ProgramResponse>),
      fetch("/api/operations/research", { cache: "no-store" }).then((response) => response.json() as Promise<MissionsResponse>)
    ]).then(([program, research]) => {
      if (cancelled) return;
      setProgramId(program.program?.id ?? null);
      setMissions(research.missions ?? []);
    }).catch((error) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : "Unable to load Research Center.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function selectMission(id: ResearchMissionType) {
    const card = missionCards.find((item) => item.id === id)!;
    setSelected(id);
    setQuestion(en ? card.questionEn : card.questionZh);
    setTitle("");
    setMessage(null);
  }

  const evidenceLines = useMemo(
    () => evidenceText.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 50),
    [evidenceText]
  );

  async function createMission() {
    const subjectList = subjects.split(/[，,\n]+/).map((item) => item.trim()).filter(Boolean).slice(0, 20);
    if (title.trim().length < 2 || question.trim().length < 10 || subjectList.length === 0) {
      setMessage(en ? "Add a title, research question, and at least one subject." : "请填写任务名称、研究问题和至少一个研究对象。");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const now = new Date().toISOString();
      const response = await fetch("/api/operations/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatingProgramId: programId,
          missionType: selected,
          title,
          question,
          subjects: subjectList,
          evidence: evidenceLines.map((excerpt, index) => ({
            id: `E${index + 1}`,
            sourceType,
            title: `${sourceOptions.find((item) => item.id === sourceType)?.zh ?? "Evidence"} ${index + 1}`,
            observedAt: now,
            excerpt,
            reliability: sourceType === "first_party_analytics" || sourceType === "licensed_provider" ? "measured" : "observed"
          }))
        })
      });
      const data = await response.json() as MissionsResponse;
      if (!response.ok || !data.mission) throw new Error(data.error || "Unable to create research mission.");
      setMissions((current) => [data.mission!, ...current]);
      setTitle("");
      setSubjects("");
      setEvidenceText("");
      setMessage(en ? "Research mission created. Analyze it when the evidence is ready." : "研究任务已建立；证据齐备后即可生成策略。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : en ? "Unable to save." : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function analyze(mission: ResearchMission) {
    if (mission.evidence.length === 0) {
      setMessage(en ? "This mission has no evidence. Create a new mission with real observations." : "这个任务还没有证据，请补充真实数据后再分析。");
      return;
    }
    setAnalyzingId(mission.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/operations/research/${mission.id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale })
      });
      const data = await response.json() as MissionsResponse;
      if (!response.ok || !data.mission) throw new Error(data.error || "Unable to analyze research.");
      setMissions((current) => current.map((item) => item.id === data.mission!.id ? data.mission! : item));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : en ? "Analysis failed." : "分析失败。");
    } finally {
      setAnalyzingId(null);
    }
  }

  const copy = en ? {
    eyebrow: "RESEARCH CENTER",
    title: "Turn market evidence into an operating decision",
    body: "Finfold covers account, category and competitor research — then continues into strategy, creation and conversion. Creator style learning now happens in Agent from real samples.",
    parity: "Three operating research missions",
    differentiation: "Strategy + conversion handoff",
    sourceTruth: "No evidence, no invented conclusion",
    newMission: "New research mission",
    evidence: "Evidence, one observation per line",
    evidenceHint: "Paste measured facts, provider-export rows, interview findings or public observations. Do not paste passwords or cookies.",
    subjects: "Accounts, products or keywords",
    subjectHint: "Comma-separated",
    titleLabel: "Mission name",
    questionLabel: "Decision question",
    source: "Evidence source",
    create: "Create mission",
    history: "Research decisions",
    empty: "No research mission yet. Start with one narrow business question.",
    analyze: "Generate evidence-backed strategy",
    analyzing: "Analyzing evidence…",
    collecting: "Collecting evidence",
    ready: "Decision ready",
    strategy: "14-day operating strategy",
    opportunities: "Opportunities",
    risks: "Risks & mitigations",
    next: "Next 14 days",
    conversion: "Conversion path",
    workbench: "Continue to Workbench",
    evidenceCount: "evidence items"
  } : {
    eyebrow: "调研中心",
    title: "把市场证据变成可执行的运营决策",
    body: "覆盖账号、品类和竞品调研，并继续衔接策略、创作与转化。博主风格学习改由 Agent 基于真实样本完成。",
    parity: "三类运营研究任务",
    differentiation: "继续衔接策略与转化",
    sourceTruth: "没有证据，不编造结论",
    newMission: "新建研究任务",
    evidence: "研究证据（每行一条观察）",
    evidenceHint: "可粘贴账号后台指标、合规数据导出、访谈结论或公开观察。不要粘贴密码与 Cookie。",
    subjects: "账号、商品或关键词",
    subjectHint: "用逗号分隔",
    titleLabel: "任务名称",
    questionLabel: "需要回答的决策问题",
    source: "证据来源",
    create: "建立研究任务",
    history: "研究决策",
    empty: "还没有研究任务。先从一个具体的生意问题开始。",
    analyze: "生成有证据的策略",
    analyzing: "正在分析证据…",
    collecting: "收集中",
    ready: "决策已生成",
    strategy: "14 天运营策略",
    opportunities: "机会判断",
    risks: "风险与应对",
    next: "未来 14 天",
    conversion: "转化路径",
    workbench: "进入创作台执行",
    evidenceCount: "条证据"
  };

  if (loading) return <Panel className="min-h-[520px] animate-pulse bg-surface-2/40"><span className="sr-only">Loading</span></Panel>;

  return (
    <div className="mx-auto grid max-w-[1240px] gap-5 pb-10">
      <Panel className="relative overflow-hidden p-6 md:p-8">
        <div className="grain-local" aria-hidden />
        <div className="relative max-w-4xl">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="mt-4 text-balance text-3xl font-black leading-tight text-fg md:text-5xl">{copy.title}</h1>
          <p className="mt-4 max-w-3xl text-sm font-semibold leading-6 text-fg-muted md:text-base">{copy.body}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Tag tone="success" dot>{copy.parity}</Tag>
            <Tag tone="action" dot>{copy.differentiation}</Tag>
            <Tag tone="neutral" dot>{copy.sourceTruth}</Tag>
          </div>
        </div>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {missionCards.map((card) => {
          const Icon = card.icon;
          const active = selected === card.id;
          if (card.id === "account_diagnosis") {
            return <Link key={card.id} href="/operations/xiaohongshu" className="focus-ring group rounded-2xl border border-action/30 bg-action/[0.055] p-4 text-left transition hover:border-action/55 hover:bg-action/[0.09]">
              <div className="flex items-center justify-between gap-2"><Icon className="h-5 w-5 text-action" /><ArrowRight className="h-4 w-4 text-action transition group-hover:translate-x-0.5" /></div>
              <p className="mt-4 text-sm font-black text-fg">{en ? card.en : card.zh}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-fg-muted">{en ? "Use the single XHS Coaching entry for evidence-led diagnosis and the 14-day loop." : "进入唯一的小红书陪跑入口，完成证据诊断与 14 天闭环。"}</p>
            </Link>;
          }
          return <button key={card.id} type="button" onClick={() => selectMission(card.id)} className={`focus-ring rounded-2xl border p-4 text-left transition ${active ? "border-action bg-action/[0.08]" : "border-hairline bg-surface hover:border-action/40"}`}>
            <Icon className={`h-5 w-5 ${active ? "text-action" : "text-fg-muted"}`} />
            <p className="mt-4 text-sm font-black text-fg">{en ? card.en : card.zh}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-fg-muted">{en ? card.detailEn : card.detailZh}</p>
          </button>;
        })}
      </div>

      <Panel className="grid gap-3 p-5 md:grid-cols-3">
        <SourceStatus title={en ? "First-party imports" : "账号后台 / 一方数据"} detail={en ? "Available now · measured evidence" : "当前可用 · 计为实测证据"} tone="success" />
        <SourceStatus title={en ? "Public web observations" : "公开网页观察"} detail={en ? "Available now · observation only" : "当前可用 · 只计为观察证据"} tone="action" />
        <SourceStatus title={en ? "Licensed Xiaohongshu dataset" : "合规小红书商业数据"} detail={en ? "Provider contract required · not connected" : "需要数据供应商合同 · 尚未接入"} tone="neutral" />
      </Panel>

      <Panel className="p-5 md:p-6">
        <div className="flex items-center gap-3"><Database className="h-5 w-5 text-action" /><h2 className="text-lg font-black text-fg">{copy.newMission}</h2></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label={copy.titleLabel}><input className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} /></Field>
          <Field label={copy.subjects}><input className="field-input" value={subjects} onChange={(event) => setSubjects(event.target.value)} placeholder={copy.subjectHint} maxLength={1200} /></Field>
          <Field label={copy.questionLabel} className="md:col-span-2"><textarea className="field-input min-h-24 resize-y" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1200} /></Field>
          <Field label={copy.source}><select className="field-input" value={sourceType} onChange={(event) => setSourceType(event.target.value as ResearchSourceType)}>{sourceOptions.map((source) => <option key={source.id} value={source.id}>{en ? source.en : source.zh}</option>)}</select></Field>
          <div className="flex items-end"><p className="pb-3 text-xs font-semibold leading-5 text-fg-muted">{copy.evidenceHint}</p></div>
          <Field label={`${copy.evidence} · ${evidenceLines.length} ${copy.evidenceCount}`} className="md:col-span-2"><textarea className="field-input min-h-36 resize-y font-mono text-xs" value={evidenceText} onChange={(event) => setEvidenceText(event.target.value)} maxLength={12000} /><span className="flex justify-end"><label className="btn-ghost focus-ring cursor-pointer"><Upload className="h-4 w-4" />{en ? "Import CSV / TXT" : "导入 CSV / TXT"}<input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(event) => void importEvidenceFile(event.target.files?.[0])} /></label></span></Field>
        </div>
        {message ? <p role="status" className="mt-4 rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-sm font-semibold text-fg-muted">{message}</p> : null}
        <div className="mt-5 flex justify-end"><button type="button" onClick={() => void createMission()} disabled={saving} className="btn-primary focus-ring disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}{copy.create}</button></div>
      </Panel>

      <section className="grid gap-4">
        <div className="flex items-center gap-3"><BrainCircuit className="h-5 w-5 text-action" /><h2 className="text-xl font-black text-fg">{copy.history}</h2></div>
        {missions.length === 0 ? <Panel className="p-8 text-center text-sm font-semibold text-fg-muted">{copy.empty}</Panel> : missions.map((mission) => (
          <Panel key={mission.id} className="p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><div className="flex flex-wrap items-center gap-2"><Tag tone={mission.status === "ready" ? "success" : "neutral"} dot>{mission.status === "ready" ? copy.ready : copy.collecting}</Tag><span className="text-xs font-bold text-fg-muted">{mission.evidence.length} {copy.evidenceCount}</span></div><h3 className="mt-3 text-xl font-black text-fg">{mission.title}</h3><p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-fg-muted">{mission.question}</p></div>
              {!mission.decision ? <button type="button" onClick={() => void analyze(mission)} disabled={analyzingId === mission.id || mission.evidence.length === 0} className="btn-primary focus-ring disabled:cursor-not-allowed disabled:opacity-45">{analyzingId === mission.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{analyzingId === mission.id ? copy.analyzing : copy.analyze}</button> : null}
            </div>
            {mission.decision ? <div className="mt-6 grid gap-5 border-t border-hairline pt-5">
              <p className="text-sm font-semibold leading-7 text-fg">{mission.decision.executiveSummary}</p>
              <div className="grid gap-4 lg:grid-cols-2"><DecisionList title={copy.opportunities} items={mission.decision.opportunities.map((item) => ({ title: item.title, detail: item.rationale, evidence: item.evidenceIds }))} /><DecisionList title={copy.risks} items={mission.decision.risks.map((item) => ({ title: item.title, detail: item.mitigation, evidence: item.evidenceIds }))} /></div>
              <div className="rounded-2xl border border-action/25 bg-action/[0.06] p-5"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-action" /><h4 className="font-black text-fg">{copy.strategy}</h4></div><p className="mt-3 text-sm font-semibold leading-6 text-fg">{mission.decision.strategy.thesis}</p><div className="mt-4 grid gap-4 lg:grid-cols-2"><div><p className="text-xs font-black uppercase tracking-wider text-fg-muted">{copy.next}</p><ol className="mt-2 grid gap-2">{mission.decision.strategy.next14Days.map((item, index) => <li key={`${index}-${item}`} className="text-sm font-semibold leading-5 text-fg"><span className="mr-2 text-action">{index + 1}.</span>{item}</li>)}</ol></div><div><p className="text-xs font-black uppercase tracking-wider text-fg-muted">{copy.conversion}</p><p className="mt-2 text-sm font-semibold leading-6 text-fg">{mission.decision.strategy.conversionPath}</p></div></div></div>
              <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => exportMission(mission)} className="btn-ghost focus-ring"><Download className="h-4 w-4" />{en ? "Export research report" : "导出研究报告"}</button><Link href="/workbench" className="btn-ghost focus-ring">{copy.workbench}</Link></div>
            </div> : null}
          </Panel>
        ))}
      </section>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`grid gap-2 ${className}`}><span className="text-xs font-black text-fg">{label}</span>{children}</label>;
}

function DecisionList({ title, items }: { title: string; items: Array<{ title: string; detail: string; evidence: string[] }> }) {
  return <div><p className="text-xs font-black uppercase tracking-wider text-fg-muted">{title}</p><div className="mt-3 grid gap-3">{items.map((item) => <div key={item.title} className="rounded-xl border border-hairline bg-surface-2/50 p-4"><p className="text-sm font-black text-fg">{item.title}</p><p className="mt-1 text-xs font-semibold leading-5 text-fg-muted">{item.detail}</p><div className="mt-2 flex flex-wrap gap-1">{item.evidence.map((id) => <Tag key={id} tone="neutral">{id}</Tag>)}</div></div>)}</div></div>;
}

function SourceStatus({ title, detail, tone }: { title: string; detail: string; tone: "success" | "action" | "neutral" }) {
  return <div className="rounded-xl border border-hairline bg-surface-2/45 p-4"><div className="flex items-center gap-2"><Tag tone={tone} dot>{title}</Tag></div><p className="mt-2 text-xs font-semibold leading-5 text-fg-muted">{detail}</p></div>;
}
