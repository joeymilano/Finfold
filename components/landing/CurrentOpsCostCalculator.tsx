"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Clock3, Coins, Layers3, RotateCcw } from "@/components/ui/icons";
import { TrackedCtaLink } from "@/components/marketing/TrackedCtaLink";
import type { Locale } from "@/lib/i18n";
import { PRICING_PLANS } from "@/lib/pricing";
import {
  OPS_COST_CALCULATION_VERSION,
  OPS_COST_LIMITS,
  calculateCurrentOpsCost,
  getOpsCostAnalyticsBuckets,
  isValidOpsCostInput,
  type OpsCostCurrency,
  type OpsCostInputs,
  type OpsCostResult
} from "@/lib/ops-cost";
import { captureEvent } from "@/lib/posthog";

const numericFieldKeys = ["postsPerWeek", "platformsPerPost", "minutesPerPlatform", "hourlyCost", "agencyMonthlyCost"] as const;
type NumericFieldKey = typeof numericFieldKeys[number];
type FieldKey = NumericFieldKey | "delegationRate";
type FormValues = Record<FieldKey, string>;
const delegationOptions = [25, 50, 75, 100] as const;

const copy = {
  zh: {
    eyebrow: "算清每月运营成本",
    title: "跨平台运营 每个月到底花多少钱",
    sub: "人工时间 运营机构 小红书陪跑 都算进去",
    valueTitle: "Finfold 能替你省下哪些成本",
    valuePoints: ["多平台文案和图片不用重复做", "尺寸和格式不用来回改", "运营结果和下一步放在一起"],
    fields: {
      postsPerWeek: "每周发布多少条内容",
      platformsPerPost: "每条内容覆盖几个平台",
      minutesPerPlatform: "处理单个平台要多久",
      hourlyCost: "执行人员时薪",
      agencyMonthlyCost: "可由 Finfold 替代的机构 / 小红书陪跑月费",
      delegationRate: "Finfold 能接手多少重复工作"
    },
    units: { postsPerWeek: "条 / 周", platformsPerPost: "个平台 / 条", minutesPerPlatform: "分钟", hourlyCost: "元 / 小时", agencyMonthlyCost: "元 / 月" },
    calculate: "算算每月能省多少",
    resultEyebrow: "你现在每月花多少",
    tasks: "个平台版本 / 月",
    hours: "人工小时 / 月",
    cost: "当前总成本 / 月",
    savingsEyebrow: "Finfold 每个月预计帮你省下",
    savingsCostLabel: "运营成本",
    savingsTimeLabel: "个人 / OPC 时间",
    formulaLabor: "重复人工",
    formulaAgency: "机构 / 陪跑",
    formulaFinfold: "Finfold 创作者版",
    recalculate: "重新计算",
    cta: "先用一次真实任务试试",
    error: "有一项数字不对 请检查后再算"
  },
  en: {
    eyebrow: "Monthly operating cost",
    title: "What does cross-platform marketing really cost each month",
    sub: "Put labor agency retainers and RedNote coaching fees in the same calculation",
    valueTitle: "The costs Finfold can take out",
    valuePoints: ["No repeat copy and visual work for every platform", "No back-and-forth resizing and reformatting", "Results and next actions stay together"],
    fields: {
      postsPerWeek: "Content pieces published per week",
      platformsPerPost: "Platforms per content piece",
      minutesPerPlatform: "Time spent per platform",
      hourlyCost: "Operator hourly cost",
      agencyMonthlyCost: "Agency / RedNote fee Finfold can replace",
      delegationRate: "How much repeat work Finfold can take over"
    },
    units: { postsPerWeek: "pieces / week", platformsPerPost: "platforms / piece", minutesPerPlatform: "minutes", hourlyCost: "USD / hour", agencyMonthlyCost: "USD / month" },
    calculate: "See what I could save",
    resultEyebrow: "What you spend each month",
    tasks: "platform versions / month",
    hours: "operator hours / month",
    cost: "current total cost / month",
    savingsEyebrow: "Finfold could save you each month",
    savingsCostLabel: "operating cost",
    savingsTimeLabel: "solo operator time",
    formulaLabor: "repeat labor",
    formulaAgency: "agency / coaching",
    formulaFinfold: "Finfold Creator",
    recalculate: "Calculate again",
    cta: "Try one real task first",
    error: "One number needs fixing before we calculate"
  }
} as const;

function defaults(locale: Locale): FormValues {
  return {
    postsPerWeek: "3",
    platformsPerPost: "4",
    minutesPerPlatform: "30",
    hourlyCost: locale === "en" ? "30" : "100",
    agencyMonthlyCost: "0",
    delegationRate: "50"
  };
}

function parseInputs(values: FormValues): OpsCostInputs {
  return {
    postsPerWeek: Number(values.postsPerWeek),
    platformsPerPost: Number(values.platformsPerPost),
    minutesPerPlatform: Number(values.minutesPerPlatform),
    hourlyCost: Number(values.hourlyCost),
    agencyMonthlyCost: Number(values.agencyMonthlyCost),
    delegationRate: Number(values.delegationRate)
  };
}

function formatNumber(value: number, locale: Locale, maximumFractionDigits: number): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", { maximumFractionDigits }).format(value);
}

export function CurrentOpsCostCalculator({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const currency: OpsCostCurrency = locale === "en" ? "USD" : "CNY";
  const market = locale === "en" ? "global" : "cn";
  const finfoldMonthlyPrice = PRICING_PLANS.creator.price[market];
  const sectionRef = useRef<HTMLElement>(null);
  const viewedRef = useRef(false);
  const startedRef = useRef(false);
  const [values, setValues] = useState<FormValues>(() => defaults(locale));
  const [invalidFields, setInvalidFields] = useState<FieldKey[]>([]);
  const [result, setResult] = useState<OpsCostResult | null>(null);

  useEffect(() => {
    setValues(defaults(locale));
    setInvalidFields([]);
    setResult(null);
    startedRef.current = false;
  }, [finfoldMonthlyPrice, locale]);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || viewedRef.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || viewedRef.current) return;
      viewedRef.current = true;
      captureEvent("ops_cost_calculator_viewed", {
        calculation_version: OPS_COST_CALCULATION_VERSION,
        locale,
        currency
      });
      observer.disconnect();
    }, { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [currency, locale]);

  function updateField(key: FieldKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setInvalidFields((current) => current.filter((item) => item !== key));
    setResult(null);
    if (!startedRef.current) {
      startedRef.current = true;
      captureEvent("ops_cost_calculator_started", {
        calculation_version: OPS_COST_CALCULATION_VERSION,
        locale,
        currency
      });
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const inputs = parseInputs(values);
    const invalid = ([...numericFieldKeys, "delegationRate"] as FieldKey[]).filter((key) => !isValidOpsCostInput(key, inputs[key]));
    setInvalidFields([...invalid]);
    if (invalid.length > 0) {
      setResult(null);
      return;
    }

    const nextResult = calculateCurrentOpsCost(inputs, finfoldMonthlyPrice);
    setResult(nextResult);
    captureEvent("ops_cost_result_generated", {
      calculation_version: OPS_COST_CALCULATION_VERSION,
      locale,
      currency,
      ...getOpsCostAnalyticsBuckets(inputs, nextResult)
    });
  }

  return (
    <section ref={sectionRef} id="ops-cost" className="relative overflow-hidden border-y border-hairline bg-surface/35">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_14%,rgb(var(--brand)/0.10),transparent_34%),radial-gradient(circle_at_90%_76%,rgb(var(--positive)/0.07),transparent_30%)]" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:py-28 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div className="lg:sticky lg:top-28">
          <p className="eyebrow-mono text-brand">{c.eyebrow}</p>
          <h2 className="text-pretty mt-4 text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-5xl">{c.title}</h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-fg-muted">{c.sub}</p>

          <div className="mt-8 rounded-2xl border border-brand/20 bg-brand/[0.055] p-5">
            <p className="text-sm font-semibold text-fg">{c.valueTitle}</p>
            <ul className="mt-4 space-y-3">
              {c.valuePoints.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm leading-6 text-fg-muted">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-positive/15 text-positive"><Check className="h-3 w-3" /></span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="glass overflow-hidden !rounded-[1.5rem] shadow-raised">
          {result ? (
            <div aria-live="polite" className="rk-enter relative p-5 sm:p-7">
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgb(var(--brand)/0.04),transparent_50%,rgb(var(--positive)/0.035))]" />
              <div className="relative">
                <div className="flex items-center justify-between gap-4">
                  <p className="eyebrow-mono">{c.resultEyebrow}</p>
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-full border border-hairline bg-bg/45 px-3.5 py-2 text-xs font-semibold text-fg-muted transition hover:border-brand/40 hover:text-fg"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {c.recalculate}
                  </button>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <ResultCard icon={Layers3} value={formatNumber(Math.round(result.monthlyPlatformTasks), locale, 0)} label={c.tasks} />
                  <ResultCard icon={Clock3} value={formatNumber(result.monthlyHours, locale, 1)} label={c.hours} />
                  <ResultCard icon={Coins} value={formatCurrency(result.currentMonthlyCost, locale, currency)} label={c.cost} />
                </div>

                <div className="mt-6 overflow-hidden rounded-2xl border border-positive/25 bg-positive/[0.075] p-5 sm:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <p className="eyebrow-mono text-positive">{c.savingsEyebrow}</p>
                    <span className="w-fit rounded-full border border-brand/20 bg-bg/50 px-3 py-1.5 text-xs font-semibold text-fg-muted">
                      {c.formulaFinfold} {formatCurrency(result.finfoldMonthlyPrice, locale, currency)} / {locale === "zh" ? "月" : "month"}
                    </span>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-positive/20 bg-bg/40 p-4">
                      <p className="tabular text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
                        {formatCurrency(result.estimatedMonthlySavings, locale, currency)}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-positive">{c.savingsCostLabel}</p>
                    </div>
                    <div className="rounded-xl border border-positive/20 bg-bg/40 p-4">
                      <p className="tabular text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
                        {formatNumber(result.estimatedMonthlyHoursSaved, locale, 1)}<span className="ml-2 text-base text-fg-muted">{locale === "zh" ? "小时" : "hours"}</span>
                      </p>
                      <p className="mt-2 text-xs font-semibold text-positive">{c.savingsTimeLabel}</p>
                    </div>
                  </div>
                  <p className="tabular mt-5 text-xs leading-6 text-fg-muted">
                    {c.formulaLabor} {formatCurrency(result.monthlyLaborCost, locale, currency)} × {values.delegationRate}%
                    <span className="mx-2 text-positive">+</span>
                    {c.formulaAgency} {formatCurrency(Number(values.agencyMonthlyCost), locale, currency)}
                    <span className="mx-2 text-risk">−</span>
                    {c.formulaFinfold} {formatCurrency(result.finfoldMonthlyPrice, locale, currency)}
                  </p>
                  <TrackedCtaLink
                    href="/signup?next=%2Fdashboard"
                    sourceType="landing"
                    sourceSlug="home"
                    sourceSurface="ops_cost_calculator"
                    ctaId="landing_ops_cost_signup"
                    destination="signup"
                    locale={locale}
                    onClick={() => captureEvent("ops_cost_cta_clicked", {
                      calculation_version: OPS_COST_CALCULATION_VERSION,
                      locale,
                      currency,
                      source_surface: "ops_cost_calculator"
                    })}
                    className="focus-ring mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
                  >
                    {c.cta}<ArrowRight className="h-4 w-4" />
                  </TrackedCtaLink>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="rk-enter p-5 sm:p-7">
              <div className="grid gap-4 sm:grid-cols-2">
                {numericFieldKeys.map((key) => {
                  const invalid = invalidFields.includes(key);
                  const limits = OPS_COST_LIMITS[key];
                  return (
                    <label key={key} className={`block text-xs font-semibold text-fg ${key === "agencyMonthlyCost" ? "sm:col-span-2" : ""}`}>
                      <span className="flex items-center justify-between gap-3">
                        <span>{c.fields[key]}</span>
                        <span className="font-normal text-fg-muted">{c.units[key]}</span>
                      </span>
                      <input
                        id={`ops-cost-${key}`}
                        name={key}
                        type="number"
                        inputMode={key === "hourlyCost" || key === "agencyMonthlyCost" ? "decimal" : "numeric"}
                        min={limits.min}
                        max={limits.max}
                        step={key === "minutesPerPlatform" ? 5 : key === "agencyMonthlyCost" ? 100 : 1}
                        value={values[key]}
                        onChange={(event) => updateField(key, event.target.value)}
                        aria-invalid={invalid}
                        aria-describedby={invalid ? "ops-cost-error" : undefined}
                        className={`field-input tabular mt-2 min-h-12 ${invalid ? "!border-risk !shadow-[0_0_0_3px_rgb(var(--risk)/0.12)]" : ""}`}
                      />
                    </label>
                  );
                })}
                <fieldset className="sm:col-span-2">
                  <legend className="text-xs font-semibold text-fg">{c.fields.delegationRate}</legend>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {delegationOptions.map((rate) => {
                      const active = values.delegationRate === String(rate);
                      return (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => updateField("delegationRate", String(rate))}
                          aria-pressed={active}
                          className={`focus-ring min-h-11 rounded-xl border text-sm font-semibold transition ${active ? "border-brand bg-brand/15 text-brand" : "border-hairline bg-bg/45 text-fg-muted hover:border-brand/40 hover:text-fg"}`}
                        >
                          {rate}%
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
              {invalidFields.length > 0 ? <p id="ops-cost-error" role="alert" className="mt-4 text-sm font-semibold text-risk">{c.error}</p> : null}
              <button type="submit" className="btn-primary focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 px-6 py-3 text-sm sm:w-auto">
                {c.calculate}<ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function formatCurrency(value: number, locale: Locale, currency: OpsCostCurrency): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

function ResultCard({ icon: Icon, value, label }: { icon: typeof Clock3; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-bg/55 p-4">
      <Icon className="h-4 w-4 text-brand" />
      <p className="tabular mt-5 break-words text-2xl font-semibold tracking-tight text-fg">{value}</p>
      <p className="mt-1 text-[11px] leading-5 text-fg-muted">{label}</p>
    </div>
  );
}
