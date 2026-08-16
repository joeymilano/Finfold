"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Compass,
  Save,
  Search,
  Target,
  Users
} from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { useLocale } from "@/hooks/useLocale";
import {
  DEFAULT_QUALIFIED_LEAD_RULES,
  EMPTY_OPERATING_PROGRAM,
  getOperatingProgramMissingRequirements,
  type OperatingProgram,
  type OperatingProgramInput,
  type OperatingProgramRequirement,
  type QualifiedLeadTemplate
} from "@/lib/operations/program";

type ApiResponse = {
  program?: OperatingProgram | null;
  defaults?: OperatingProgramInput;
  error?: string;
};

function parseList(value: string): string[] {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

const requirementLabels: Record<OperatingProgramRequirement, { zh: string; en: string }> = {
  offer: { zh: "补全主推产品名称和说明", en: "Add the offer name and summary" },
  audience: { zh: "说明目标客户和主要需求", en: "Define the audience and primary need" },
  objective: { zh: "填写本月业务目标", en: "Add this month's business goal" },
  qualified_lead_rule: { zh: "确认至少一条有效线索条件", en: "Confirm at least one lead condition" },
  watchlist: { zh: "竞品和关键词合计至少 3 项", en: "Add at least 3 competitors or keywords" }
};

const templateCopy: Record<QualifiedLeadTemplate, { zh: string; en: string; detailZh: string; detailEn: string }> = {
  professional_services: {
    zh: "专业服务",
    en: "Professional services",
    detailZh: "咨询、设计、教育和企业服务",
    detailEn: "Consulting, design, education, and B2B services"
  },
  local_business: {
    zh: "本地生意",
    en: "Local business",
    detailZh: "门店、到店服务和预约业务",
    detailEn: "Stores, appointments, and local services"
  },
  small_brand: {
    zh: "小品牌",
    en: "Small brand",
    detailZh: "商品、试用和合作咨询",
    detailEn: "Products, trials, and partnership inquiries"
  },
  custom: {
    zh: "自定义",
    en: "Custom",
    detailZh: "自己定义什么才算有效线索",
    detailEn: "Define your own qualified-lead rule"
  }
};

export function OperatingProgramSetup() {
  const locale = useLocale();
  const en = locale === "en";
  const [program, setProgram] = useState<OperatingProgramInput>(EMPTY_OPERATING_PROGRAM);
  const [programId, setProgramId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/operations/program", { cache: "no-store" });
        const data = (await response.json()) as ApiResponse;
        if (!response.ok) throw new Error(data.error || "Unable to load the operating program.");
        if (!cancelled) {
          setProgram(data.program ?? data.defaults ?? EMPTY_OPERATING_PROGRAM);
          setProgramId(data.program?.id ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage({
            tone: "error",
            text: error instanceof Error ? error.message : en ? "Unable to load your program." : "暂时无法读取运营项目。"
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [en]);

  const missing = useMemo(() => getOperatingProgramMissingRequirements(program), [program]);
  const readiness = Math.round(((5 - missing.length) / 5) * 100);
  const isActive = program.status === "active";

  function patch<K extends keyof OperatingProgramInput>(key: K, value: OperatingProgramInput[K]) {
    setProgram((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  async function save(status: "draft" | "active") {
    const next = { ...program, status };
    const missingForActivation = getOperatingProgramMissingRequirements(next);
    if (status === "active" && missingForActivation.length > 0) {
      setMessage({
        tone: "error",
        text: en ? "Complete the items listed under readiness before starting." : "请先完成右侧列出的必填项，再启动运营项目。"
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/operations/program", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next)
      });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok || !data.program) throw new Error(data.error || "Unable to save the operating program.");
      setProgram(data.program);
      setProgramId(data.program.id);
      setMessage({
        tone: "success",
        text: status === "active"
          ? en ? "Operating program started. Research can now use this brief." : "运营项目已启动，调研将使用这份业务简报。"
          : en ? "Draft saved." : "草稿已保存。"
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : en ? "Unable to save." : "保存失败，请稍后重试。"
      });
    } finally {
      setSaving(false);
    }
  }

  const copy = en ? {
    eyebrow: "OPERATING PROGRAM",
    title: "Give Finfold a business target before asking it to create",
    body: "This brief tells Research what to watch, Strategy what to prioritize, and attribution what counts as a qualified lead.",
    active: "Active",
    draft: "Draft",
    platform: "Primary platform",
    platformDetail: "One operating seat is included. Xiaohongshu is available in this beta.",
    offer: "Offer",
    offerDetail: "What should this content ultimately sell?",
    audience: "Audience",
    audienceDetail: "Describe the buyer precisely enough to reject weak ideas.",
    objective: "Business target",
    objectiveDetail: "Set the result Finfold should optimize this month.",
    qualification: "Qualified lead rule",
    qualificationDetail: "Finfold will count only contacts that satisfy this rule.",
    watchlist: "Research watchlist",
    watchlistDetail: "Add at least three competitors or keywords in total.",
    baseline: "Current baseline",
    baselineDetail: "Monthly numbers before this operating program starts.",
    readiness: "Launch readiness",
    ready: "Ready to start",
    start: "Start operating program",
    save: "Save draft",
    saveChanges: "Save changes",
    available: "Available now",
    later: "Prepared for later",
    cadence: "Posts per week"
  } : {
    eyebrow: "运营项目",
    title: "先把生意目标交给 Finfold，再让它开始创作",
    body: "这份简报决定调研看什么、策略优先做什么，以及什么样的咨询才算有效线索。",
    active: "运行中",
    draft: "草稿",
    platform: "主运营平台",
    platformDetail: "套餐包含一个主平台。本次内测先开放小红书。",
    offer: "主推产品",
    offerDetail: "这些内容最终要卖什么。",
    audience: "目标客户",
    audienceDetail: "把客户写清楚，系统才能主动排除弱选题。",
    objective: "本月业务目标",
    objectiveDetail: "确定 Finfold 本月需要优化的业务结果。",
    qualification: "有效线索规则",
    qualificationDetail: "只有满足这些条件的咨询才计入核心指标。",
    watchlist: "调研关注列表",
    watchlistDetail: "竞品账号和关键词合计至少填写三项。",
    baseline: "当前基线",
    baselineDetail: "填写启动运营项目前的月度数据。",
    readiness: "启动准备度",
    ready: "可以启动",
    start: "启动运营项目",
    save: "保存草稿",
    saveChanges: "保存修改",
    available: "当前可用",
    later: "已预留结构",
    cadence: "每周发布篇数"
  };

  if (loading) {
    return <Panel className="min-h-[420px] animate-pulse bg-surface-2/35"><span className="sr-only">Loading</span></Panel>;
  }

  return (
    <div className="mx-auto grid max-w-[1180px] gap-5 pb-10">
      <Panel className="relative overflow-hidden p-6 md:p-8">
        <div className="grain-local" aria-hidden />
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-action/10 blur-3xl" />
        <div className="relative max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow">{copy.eyebrow}</p>
            <Tag tone={isActive ? "success" : "neutral"} dot>{isActive ? copy.active : copy.draft}</Tag>
          </div>
          <h1 className="mt-4 max-w-4xl text-balance text-3xl font-black leading-tight text-fg md:text-5xl">{copy.title}</h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-fg-muted md:text-base">{copy.body}</p>
        </div>
      </Panel>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-5">
          <Section icon={Compass} number="01" title={copy.platform} detail={copy.platformDetail}>
            <div className="grid gap-3 md:grid-cols-3">
              <PlatformOption name={en ? "Xiaohongshu" : "小红书"} detail={copy.available} selected />
              <PlatformOption name="LinkedIn" detail={copy.later} />
              <PlatformOption name={en ? "WeChat Official" : "微信公众号"} detail={copy.later} />
            </div>
          </Section>

          <Section icon={Target} number="02" title={copy.offer} detail={copy.offerDetail}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={en ? "Offer name" : "产品或服务名称"}>
                <input value={program.offer.name} onChange={(event) => patch("offer", { ...program.offer, name: event.target.value })} className="field-input" placeholder={en ? "e.g. Brand strategy consulting" : "例如 品牌策略咨询"} maxLength={120} />
              </Field>
              <Field label={en ? "Price range" : "价格区间"} optional>
                <input value={program.offer.priceRange} onChange={(event) => patch("offer", { ...program.offer, priceRange: event.target.value })} className="field-input" placeholder={en ? "e.g. ¥8,000–20,000" : "例如 ¥8,000 至 ¥20,000"} maxLength={120} />
              </Field>
              <Field label={en ? "Offer summary" : "客户最终会买到什么"} className="md:col-span-2">
                <textarea value={program.offer.summary} onChange={(event) => patch("offer", { ...program.offer, summary: event.target.value })} className="field-input min-h-24 resize-y" placeholder={en ? "Describe the deliverable and result in plain language." : "用客户听得懂的话说明交付内容和结果。"} maxLength={800} />
              </Field>
              <Field label={en ? "Service area" : "服务地区"} optional>
                <input value={program.offer.serviceArea} onChange={(event) => patch("offer", { ...program.offer, serviceArea: event.target.value })} className="field-input" placeholder={en ? "Online, Shanghai, Greater Bay Area…" : "线上、上海、大湾区等"} maxLength={120} />
              </Field>
              <Field label={copy.cadence}>
                <select value={program.cadencePerWeek} onChange={(event) => patch("cadencePerWeek", Number(event.target.value))} className="field-input">
                  {[2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          <Section icon={Users} number="03" title={copy.audience} detail={copy.audienceDetail}>
            <div className="grid gap-4">
              <Field label={en ? "Ideal customer" : "理想客户是谁"}>
                <textarea value={program.audience.description} onChange={(event) => patch("audience", { ...program.audience, description: event.target.value })} className="field-input min-h-20 resize-y" placeholder={en ? "Role, business stage, location, and situation." : "写清身份、业务阶段、地区和所处情境。"} maxLength={800} />
              </Field>
              <Field label={en ? "Primary need" : "最想解决的问题"}>
                <textarea value={program.audience.primaryNeed} onChange={(event) => patch("audience", { ...program.audience, primaryNeed: event.target.value })} className="field-input min-h-20 resize-y" placeholder={en ? "What would make them actively seek help now?" : "什么情况会让他们现在就主动寻求帮助。"} maxLength={800} />
              </Field>
              <Field label={en ? "Purchase barriers" : "购买阻力"} optional>
                <textarea value={program.audience.purchaseBarriers.join("\n")} onChange={(event) => patch("audience", { ...program.audience, purchaseBarriers: parseList(event.target.value) })} className="field-input min-h-20 resize-y" placeholder={en ? "One barrier per line" : "每行一个，例如 担心效果无法衡量"} />
              </Field>
            </div>
          </Section>

          <Section icon={BadgeCheck} number="04" title={copy.qualification} detail={copy.qualificationDetail}>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(templateCopy) as QualifiedLeadTemplate[]).map((template) => {
                const item = templateCopy[template];
                const selected = program.qualifiedLeadRule.template === template;
                return (
                  <button
                    key={template}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => patch("qualifiedLeadRule", DEFAULT_QUALIFIED_LEAD_RULES[template])}
                    className={`focus-ring rounded-xl border p-4 text-left transition ${selected ? "border-action/55 bg-action/[0.08]" : "border-hairline bg-surface-2/45 hover:border-action/30"}`}
                  >
                    <span className="flex items-center justify-between gap-3 text-sm font-bold text-fg">
                      {en ? item.en : item.zh}
                      {selected ? <Check className="h-4 w-4 text-action" /> : null}
                    </span>
                    <span className="mt-1.5 block text-xs font-medium leading-5 text-fg-muted">{en ? item.detailEn : item.detailZh}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label={en ? "Qualification conditions" : "匹配条件"}>
                <textarea value={program.qualifiedLeadRule.matchConditions.join("\n")} onChange={(event) => patch("qualifiedLeadRule", { ...program.qualifiedLeadRule, matchConditions: parseList(event.target.value) })} className="field-input min-h-24 resize-y" placeholder={en ? "One condition per line" : "每行一个判断条件"} />
              </Field>
              <Field label={en ? "Additional rule" : "补充说明"} optional>
                <textarea value={program.qualifiedLeadRule.customNotes} onChange={(event) => patch("qualifiedLeadRule", { ...program.qualifiedLeadRule, customNotes: event.target.value })} className="field-input min-h-24 resize-y" placeholder={en ? "Anything the standard template misses" : "标准模板没有覆盖的特殊条件"} maxLength={500} />
              </Field>
            </div>
          </Section>

          <Section icon={Search} number="05" title={copy.watchlist} detail={copy.watchlistDetail}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={en ? "Competitors or reference accounts" : "竞品或对标账号"}>
                <textarea value={program.watchlist.competitors.join("\n")} onChange={(event) => patch("watchlist", { ...program.watchlist, competitors: parseList(event.target.value) })} className="field-input min-h-32 resize-y" placeholder={en ? "One name or public URL per line" : "每行填写一个名称或公开网址"} />
              </Field>
              <Field label={en ? "Research keywords" : "调研关键词"}>
                <textarea value={program.watchlist.keywords.join("\n")} onChange={(event) => patch("watchlist", { ...program.watchlist, keywords: parseList(event.target.value) })} className="field-input min-h-32 resize-y" placeholder={en ? "Problems, scenarios, products, or locations" : "客户问题、使用场景、产品词或地区词"} />
              </Field>
            </div>
          </Section>

          <Section icon={Target} number="06" title={copy.objective} detail={copy.objectiveDetail}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={en ? "Monthly business goal" : "本月希望获得什么结果"} className="md:col-span-2">
                <textarea value={program.objective.monthlyGoal} onChange={(event) => patch("objective", { ...program.objective, monthlyGoal: event.target.value })} className="field-input min-h-20 resize-y" placeholder={en ? "e.g. Generate 12 qualified consulting leads" : "例如 获得 12 条有效咨询线索"} maxLength={800} />
              </Field>
              <Field label={en ? "Primary conversion action" : "主要转化动作"}>
                <select value={program.objective.conversionAction} onChange={(event) => patch("objective", { ...program.objective, conversionAction: event.target.value as OperatingProgramInput["objective"]["conversionAction"] })} className="field-input">
                  <option value="lead_form">{en ? "Submit a form" : "提交表单"}</option>
                  <option value="direct_message">{en ? "Send a direct message" : "发送私信"}</option>
                  <option value="phone_call">{en ? "Call" : "电话咨询"}</option>
                  <option value="appointment">{en ? "Book an appointment" : "预约"}</option>
                  <option value="purchase">{en ? "Purchase" : "直接购买"}</option>
                  <option value="other">{en ? "Other" : "其他"}</option>
                </select>
              </Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <NumberField label={en ? "Posts / month" : "月发布篇数"} value={program.baseline.publishedPosts} onChange={(value) => patch("baseline", { ...program.baseline, publishedPosts: value })} />
              <NumberField label={en ? "Qualified leads / month" : "月有效线索"} value={program.baseline.qualifiedLeads} onChange={(value) => patch("baseline", { ...program.baseline, qualifiedLeads: value })} />
              <NumberField label={en ? "Won revenue / month" : "月成交收入"} value={program.baseline.wonRevenue} onChange={(value) => patch("baseline", { ...program.baseline, wonRevenue: value })} />
            </div>
          </Section>
        </div>

        <aside className="sticky top-5 grid gap-4">
          <Panel className="overflow-hidden p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-fg-muted">{copy.readiness}</p>
                <p className="mt-2 text-3xl font-black tabular-nums text-fg">{readiness}%</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-action/30 bg-action/[0.08] text-action">
                {missing.length === 0 ? <Check className="h-5 w-5" /> : <Compass className="h-5 w-5" />}
              </div>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-action transition-all" style={{ width: `${readiness}%` }} />
            </div>
            <div className="mt-5 grid gap-2.5">
              {missing.length === 0 ? (
                <p className="flex items-center gap-2 text-sm font-bold text-positive"><Check className="h-4 w-4" />{copy.ready}</p>
              ) : missing.map((item) => (
                <p key={item} className="flex items-start gap-2 text-xs font-semibold leading-5 text-fg-muted">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                  {en ? requirementLabels[item].en : requirementLabels[item].zh}
                </p>
              ))}
            </div>
          </Panel>

          {message ? (
            <div role={message.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-xs font-semibold leading-5 ${message.tone === "success" ? "border-positive/30 bg-positive/10 text-positive" : "border-risk/30 bg-risk/10 text-risk"}`}>
              {message.text}
            </div>
          ) : null}

          <div className="grid gap-2">
            <Button variant="primary" size="lg" fullWidth loading={saving} onClick={() => void save("active")}>
              {isActive ? <Save className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              {isActive ? copy.saveChanges : copy.start}
            </Button>
            {!isActive ? (
              <Button variant="tertiary" fullWidth disabled={saving} onClick={() => void save("draft")}>
                <Save className="h-4 w-4" /> {copy.save}
              </Button>
            ) : null}
          </div>
          {programId ? <p className="text-center text-[10px] font-semibold text-fg-muted">{en ? "Program" : "项目"} {programId.slice(0, 8)}</p> : null}
        </aside>
      </div>
    </div>
  );
}

function Section({ icon: Icon, number, title, detail, children }: { icon: typeof Target; number: string; title: string; detail: string; children: React.ReactNode }) {
  return (
    <Panel className="p-5 md:p-6">
      <div className="mb-5 flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-2 text-action"><Icon className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black tracking-[0.18em] text-fg-muted">{number}</p>
          <h2 className="mt-1 text-lg font-black text-fg">{title}</h2>
          <p className="mt-1 text-xs font-medium leading-5 text-fg-muted">{detail}</p>
        </div>
      </div>
      {children}
    </Panel>
  );
}

function Field({ label, optional, className, children }: { label: string; optional?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      <span className="mb-2 flex items-center gap-2 text-xs font-bold text-fg">{label}{optional ? <span className="font-medium text-fg-muted">Optional</span> : null}</span>
      {children}
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <input type="number" min={0} value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} className="field-input tabular-nums" />
    </Field>
  );
}

function PlatformOption({ name, detail, selected = false }: { name: string; detail: string; selected?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${selected ? "border-action/55 bg-action/[0.08]" : "border-hairline bg-surface-2/35 opacity-60"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-black text-fg">{name}</span>
        {selected ? <Check className="h-4 w-4 text-action" /> : null}
      </div>
      <p className="mt-1.5 text-[11px] font-semibold text-fg-muted">{detail}</p>
    </div>
  );
}
