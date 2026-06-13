"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  Pause,
  Play,
  RotateCw,
  ShieldCheck,
  Zap,
  Loader2,
  Sparkles
} from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { agentMetrics, agentPipeline, agentRunLog, agentWorkflows, type AgentWorkflowStatus } from "@/lib/agent-data";
import { useLocale } from "@/hooks/useLocale";

export function AgentAutomationCenter() {
  const locale = useLocale();

  const statusStyle: Record<AgentWorkflowStatus, { label: string; tone: TagTone; live?: boolean }> = {
    running: { label: locale === "en" ? "Scanning" : "巡检中", tone: "brand", live: true },
    ready: { label: locale === "en" ? "Ready" : "待派单", tone: "accent" },
    review: { label: locale === "en" ? "In Review" : "待审核", tone: "warn" },
    paused: { label: locale === "en" ? "Paused" : "已暂停", tone: "neutral" }
  };

  const copy = locale === "en" ? {
    headerEyebrow: "Agentic Content Operations",
    headerTitle: "Auto-detect channel gaps, trigger production, QA and scheduling.",
    headerDesc: "The Agent layer is the core engine of the workflow: it analyzes Dashboard coverage in real time, invokes Workbench production when gaps are found, applies brand Guardrails for QA and scheduling, and hands off judgment calls to humans.",
    runBtn: "Run Operations Scan",
    runningBtn: "Running Operations Scan",
    backDashboard: "Back to Dashboard",
    activeFlows: "flows running or listening",
    pipelineEyebrow: "Automation Pipeline",
    pipelineTitle: "Agent Self-Driving Content Engine Loop",
    workflowOwnerPrefix: "Owner:",
    pauseBtn: "Pause",
    runBtn2: "Run",
    automationLabel: "Automation Steps",
    outputLabel: "Expected Output",
    confidenceLabel: "Confidence Threshold",
    runLogEyebrow: "Run Log",
    runLogTitle: "Agent Run Log",
    humanApprovalTitle: "Human Approval Boundary",
    humanApprovalDesc: "Agents handle pipeline monitoring, auto-production and scheduling, but the system always maintains a 'pending review' human approval state before brand risk checks, compliance review, and final publishing.",
    simRunning: "Operations scan running…",
  } : {
    headerEyebrow: "Agentic Content Operations",
    headerTitle: "自动巡检渠道缺口，发起生产、质检与排期。",
    headerDesc: "Agent 层是流程流转的核心引擎：实时分析 Dashboard 覆盖度数据，发现缺口时调用 Workbench 生产能力，并注入品牌 Guardrails 完成质检与排期，把需要判断的事项交回人工。",
    runBtn: "运行运营巡检",
    runningBtn: "正在运行运营巡检",
    backDashboard: "返回运营 Dashboard",
    activeFlows: "个流程正在运行或侦听外部信号",
    pipelineEyebrow: "自动化流水线",
    pipelineTitle: "Agent 自驱动内容引擎环路",
    workflowOwnerPrefix: "负责人：",
    pauseBtn: "暂停",
    runBtn2: "运行",
    automationLabel: "执行动作",
    outputLabel: "预期输出",
    confidenceLabel: "置信度阈值",
    runLogEyebrow: "运行日志",
    runLogTitle: "Agent 运行日志",
    humanApprovalTitle: "人工审批边界",
    humanApprovalDesc: "Agent 负责流水线监控、自动生产与调度，但在品牌风控、合规审查以及最终发布前，系统始终保持「待审核」人工审批状态。",
    simRunning: "运营巡检正在执行…",
  };

  const [runningIds, setRunningIds] = useState<string[]>(["agent-gap-scout"]);
  const [activity, setActivity] = useState<Array<{ time: string; agent: string; event: string; state: string }>>([
    ...agentRunLog.map((item) => ({
      time: item.time,
      agent: item.agent,
      event: locale === "en" ? item.eventEn : item.event,
      state: locale === "en" ? item.stateEn : item.state,
    }))
  ]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationStep, setSimulationStep] = useState(0);

  const activeCount = useMemo(() => runningIds.length + (isSimulating ? 1 : 0), [runningIds, isSimulating]);

  function runWorkflow(id: string, agent: string, name: string) {
    setRunningIds((current) => (current.includes(id) ? current : [id, ...current]));
    setActivity((current) => [
      {
        time: locale === "en" ? "just now" : "刚刚",
        agent,
        event: locale === "en"
          ? `${name} started, generating next growth actions.`
          : `${name} 已启动，正在生成下一步运营动作。`,
        state: locale === "en" ? "Scanning" : "巡检中"
      },
      ...current
    ]);
  }

  function pauseWorkflow(id: string, agent: string, name: string) {
    setRunningIds((current) => current.filter((item) => item !== id));
    setActivity((current) => [
      {
        time: locale === "en" ? "just now" : "刚刚",
        agent,
        event: locale === "en"
          ? `${name} paused, awaiting manual re-activation.`
          : `${name} 已暂停，等待人工重新启用。`,
        state: locale === "en" ? "Paused" : "已暂停"
      },
      ...current
    ]);
  }

  // Choreographed walk-through of the gap → produce → review → schedule pipeline.
  function runCommandCenter() {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimulationStep(1);

    setActivity((current) => [
      {
        time: locale === "en" ? "1s ago" : "1秒前",
        agent: "运营侦察 Agent",
        event: locale === "en"
          ? "Starting cross-platform operations scan, reading channel coverage and publish windows."
          : "启动跨平台运营巡检，读取各渠道覆盖与发布窗口。",
        state: locale === "en" ? "Scanning" : "巡检中"
      },
      ...current
    ]);
  }

  useEffect(() => {
    if (!isSimulating) return;

    let timer: ReturnType<typeof setTimeout>;

    if (simulationStep === 1) {
      timer = setTimeout(() => {
        setActivity((current) => [
          {
            time: locale === "en" ? "just now" : "刚刚",
            agent: "运营侦察 Agent",
            event: locale === "en"
              ? "Scan complete: Bilibili and Instagram have publish window gaps this week."
              : "侦测完成：B站与 Instagram 本周存在发布窗口空窗。",
            state: locale === "en" ? "Scanning" : "巡检中"
          },
          ...current
        ]);
        setSimulationStep(2);
      }, 1500);
    } else if (simulationStep === 2) {
      timer = setTimeout(() => {
        setActivity((current) => [
          {
            time: locale === "en" ? "just now" : "刚刚",
            agent: "资产生产 Agent",
            event: locale === "en"
              ? "Dispatched: created production tasks for Bilibili script and IG visual card from product assets."
              : "已派单：基于产品资产为 B站脚本与 IG 视觉卡片创建生产任务。",
            state: locale === "en" ? "Dispatched" : "已派单"
          },
          ...current
        ]);
        setSimulationStep(3);
      }, 1500);
    } else if (simulationStep === 3) {
      timer = setTimeout(() => {
        setActivity((current) => [
          {
            time: locale === "en" ? "just now" : "刚刚",
            agent: "品牌质检 Agent",
            event: locale === "en"
              ? "Completed 4 brand rule scans, 2 copies flagged for human review."
              : "完成 4 项品牌规则扫描，2 条文案标记为待人工确认。",
            state: locale === "en" ? "In Review" : "待审核"
          },
          ...current
        ]);
        setSimulationStep(4);
      }, 1500);
    } else if (simulationStep === 4) {
      timer = setTimeout(() => {
        setActivity((current) => [
          {
            time: locale === "en" ? "just now" : "刚刚",
            agent: "排期编排 Agent",
            event: locale === "en"
              ? "Approved packages scheduled for Friday 12:00 publish window, awaiting final approval."
              : "已将通过审核的资产包排入周五 12:00 发布窗口，等待最终批准。",
            state: locale === "en" ? "Pending Schedule" : "待排期"
          },
          ...current
        ]);
        setIsSimulating(false);
        setSimulationStep(0);
      }, 1500);
    }

    return () => clearTimeout(timer);
  }, [isSimulating, simulationStep, locale]);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto grid max-w-[1400px] gap-6 pb-10">
      {/* Header */}
      <section className="grid overflow-hidden rounded-panel lg:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-6 md:p-7">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
            <Bot className="h-4 w-4 text-brand" />
            {copy.headerEyebrow}
          </div>
          <h1 className="mt-4 max-w-3xl text-2xl font-bold leading-tight text-fg sm:text-4xl">
            {copy.headerTitle}
          </h1>
          <p className="mt-4 max-w-2xl text-xs leading-6 text-fg-muted sm:text-sm">
            {copy.headerDesc}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={runCommandCenter} disabled={isSimulating} className="btn-primary focus-ring disabled:opacity-75">
              {isSimulating ? (
                <>
                  {copy.runningBtn} <Loader2 className="h-4 w-4 animate-spin" />
                </>
              ) : (
                <>
                  {copy.runBtn} <Zap className="h-4 w-4" />
                </>
              )}
            </button>
            <Link href="/dashboard" className="btn-ghost focus-ring">
              {copy.backDashboard} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Panel>

        <Panel command className="relative overflow-hidden p-6 md:p-7">
          {isSimulating ? <div className="absolute inset-0 bg-brand/5 backdrop-blur-[1px] transition-all" /> : null}

          <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Agent running state</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="tabular text-5xl font-bold text-white">{activeCount}</p>
            <span className="text-xs text-white/50">{copy.activeFlows}</span>
          </div>

          <div className="relative z-10 mt-6 grid gap-3.5">
            {agentMetrics.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5 transition-colors hover:bg-white/[0.06]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-white/70">
                    {locale === "en" ? metric.labelEn : metric.label}
                  </p>
                  <p className="tabular text-sm font-bold text-white">{metric.value}</p>
                </div>
                <p className="mt-1 text-[11px] font-medium leading-relaxed text-white/50">
                  {locale === "en" ? metric.detailEn : metric.detail}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      {/* Pipeline run progress */}
      {isSimulating ? (
        <Panel className="rk-enter p-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 animate-pulse text-brand" />
            <h3 className="text-sm font-bold text-fg">{copy.simRunning} ({simulationStep}/4)</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <SimStep locale={locale} index={1} current={simulationStep} label={locale === "en" ? "Gap Scout" : "渠道巡检 (Gap Scout)"} desc={locale === "en" ? "Find this week's publish windows" : "搜寻本周发布空窗"} />
            <SimStep locale={locale} index={2} current={simulationStep} label={locale === "en" ? "Asset Router" : "资产派单 (Asset Router)"} desc={locale === "en" ? "Create production tasks for gaps" : "按缺口创建生产任务"} />
            <SimStep locale={locale} index={3} current={simulationStep} label={locale === "en" ? "Brand Guard" : "品牌质检 (Brand Guard)"} desc={locale === "en" ? "Review against brand rules" : "对照品牌规则审查"} />
            <SimStep locale={locale} index={4} current={simulationStep} label={locale === "en" ? "Calendar" : "发布排期 (Calendar)"} desc={locale === "en" ? "Match windows, pending approval" : "匹配窗口待批准"} />
          </div>
        </Panel>
      ) : null}

      {/* Pipeline concept */}
      <Panel className="p-5">
        <SectionHeader eyebrow={copy.pipelineEyebrow} title={copy.pipelineTitle} icon={RotateCw} />
        <div className="mt-4 grid gap-3.5 md:grid-cols-3 xl:grid-cols-6">
          {agentPipeline.map((step, index) => (
            <motion.article
              key={step.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="panel-inset p-4 transition-all hover:border-brand/40"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                  {locale === "en" ? step.labelEn : step.label}
                </span>
                <step.icon className="h-4 w-4 text-brand" />
              </div>
              <h3 className="mt-3.5 text-xs font-bold text-fg">
                {locale === "en" ? step.titleEn : step.title}
              </h3>
              <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">
                {locale === "en" ? step.detailEn : step.detail}
              </p>
            </motion.article>
          ))}
        </div>
      </Panel>

      {/* Workflows + run log */}
      <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-4">
          {agentWorkflows.map((workflow) => {
            const isRunning = runningIds.includes(workflow.id);
            const status = isRunning ? statusStyle.running : statusStyle[workflow.status];

            return (
              <Panel key={workflow.id} className="flex flex-col justify-between p-5">
                <div>
                  <div className="mb-4 flex flex-col gap-3 border-b border-hairline pb-3.5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                        <workflow.icon className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-bold text-fg">
                            {locale === "en" ? workflow.nameEn : workflow.name}
                          </h2>
                          <Tag tone={status.tone} dot={status.live}>
                            {status.label}
                          </Tag>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-fg-muted">
                          {workflow.agent} · {copy.workflowOwnerPrefix}{locale === "en" ? workflow.ownerEn : workflow.owner} · {locale === "en" ? workflow.cadenceEn : workflow.cadence}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {isRunning ? (
                        <button type="button" onClick={() => pauseWorkflow(workflow.id, workflow.agent, locale === "en" ? workflow.nameEn : workflow.name)} className="btn-ghost focus-ring px-3 py-1.5 text-xs">
                          {copy.pauseBtn} <Pause className="h-3 w-3" />
                        </button>
                      ) : (
                        <button type="button" onClick={() => runWorkflow(workflow.id, workflow.agent, locale === "en" ? workflow.nameEn : workflow.name)} className="btn-primary focus-ring px-3 py-1.5 text-xs">
                          {copy.runBtn2} <Play className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mb-4 text-xs leading-6 text-fg-muted sm:text-sm">
                    {locale === "en" ? workflow.triggerEn : workflow.trigger}
                  </p>

                  <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                    <div className="panel-inset p-3.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">{copy.automationLabel}</p>
                      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                        {(locale === "en" ? workflow.automationEn : workflow.automation).map((step) => (
                          <div key={step} className="flex items-start gap-1.5 text-xs leading-relaxed text-fg-muted">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="panel-inset flex flex-col justify-between p-3.5">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">{copy.outputLabel}</p>
                        <p className="mt-1.5 text-xs font-bold leading-relaxed text-fg">
                          {locale === "en" ? workflow.outputEn : workflow.output}
                        </p>
                      </div>
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[10px] font-bold text-fg-muted">
                          <span>{copy.confidenceLabel}</span>
                          <span className="tabular text-fg">{workflow.confidence}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${workflow.confidence}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>

        <aside className="grid content-start gap-6">
          <Panel className="p-5">
            <SectionHeader eyebrow={copy.runLogEyebrow} title={copy.runLogTitle} icon={Clock3} />
            <div className="mt-4 grid max-h-[580px] gap-3 overflow-y-auto">
              {activity.slice(0, 10).map((item, index) => (
                <div key={`${item.time}-${item.agent}-${index}`} className="panel-inset p-3 transition-colors hover:border-brand/40">
                  <div className="mb-1.5 flex items-center justify-between gap-3 border-b border-hairline pb-1.5">
                    <p className="text-[10px] font-semibold text-fg-muted">
                      {item.time} · {item.agent}
                    </p>
                    <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-fg-muted">{item.state}</span>
                  </div>
                  <p className="text-xs font-medium leading-relaxed text-fg-muted">{item.event}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <ShieldCheck className="h-6 w-6 text-brand" />
            <h2 className="mt-3.5 text-sm font-bold text-fg">{copy.humanApprovalTitle}</h2>
            <p className="mt-2 text-xs leading-6 text-fg-muted">
              {copy.humanApprovalDesc}
            </p>
          </Panel>
        </aside>
      </section>
    </motion.div>
  );
}

function SimStep({ index, current, label, desc, locale }: { index: number; current: number; label: string; desc: string; locale: string }) {
  const isDone = current > index;
  const isCurrent = current === index;

  return (
    <div
      className={`panel-inset flex flex-col justify-between p-3.5 transition-all ${
        isDone ? "border-brand/40" : isCurrent ? "border-brand/60 shadow-glow-brand" : "opacity-45"
      }`}
    >
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
              isDone ? "bg-brand text-white" : isCurrent ? "bg-brand text-white" : "bg-surface-2 text-fg-muted"
            }`}
          >
            {isDone ? "✓" : index}
          </span>
          <span className={`text-[9px] font-bold ${isDone || isCurrent ? "text-brand-strong dark:text-brand" : "text-fg-muted"}`}>
            {isDone
              ? (locale === "en" ? "Done" : "已完成")
              : isCurrent
                ? (locale === "en" ? "Running" : "运行中")
                : (locale === "en" ? "Waiting" : "等待中")}
          </span>
        </div>
        <h4 className={`text-xs font-bold ${isCurrent || isDone ? "text-fg" : "text-fg-muted"}`}>{label}</h4>
        <p className="mt-1 text-[10px] leading-normal text-fg-muted">{desc}</p>
      </div>
    </div>
  );
}
