"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Plus, TicketCheck, UsersRound } from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import type { FounderEvidence } from "@/lib/founder-evidence";
import type { Locale } from "@/lib/i18n";

type GeneratedCohort = {
  batchLabel: string;
  plan: string;
  durationDays: number;
  expiresAt: string | null;
  codes: string[];
};

export function SeedCohortPanel({
  locale,
  cohorts,
  totals,
  onCreated
}: {
  locale: Locale;
  cohorts: FounderEvidence["seedCohorts"];
  totals: FounderEvidence["seedCohortTotals"];
  onCreated: () => void;
}) {
  const [batchLabel, setBatchLabel] = useState("");
  const [count, setCount] = useState(10);
  const [plan, setPlan] = useState("pro");
  const [durationDays, setDurationDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedCohort | null>(null);
  const [copied, setCopied] = useState(false);

  async function createCohort() {
    if (batchLabel.trim().length < 2) {
      setError(locale === "en" ? "Give this cohort a clear batch name." : "请先填写清晰的批次名称。" );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/founder/seed-cohorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchLabel, count, plan, durationDays, expiresInDays: 30 })
      });
      const data = (await response.json()) as { cohort?: GeneratedCohort; error?: string };
      if (!response.ok || !data.cohort) throw new Error(data.error ?? "Failed to create cohort.");
      setGenerated(data.cohort);
      setBatchLabel("");
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create cohort.");
    } finally {
      setLoading(false);
    }
  }

  async function copyCodes() {
    if (!generated) return;
    await navigator.clipboard.writeText(generated.codes.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Panel className="p-5 md:p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <UsersRound className="h-5 w-5 text-brand" />
            <p className="eyebrow">{locale === "en" ? "Seed cohort operations" : "种子用户批次运营"}</p>
          </div>
          <h2 className="mt-2 text-2xl font-black text-fg">{locale === "en" ? "Invite, activate, publish, measure" : "邀请、激活、发布、回流，一条链看清"}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-muted">
            {locale === "en" ? "Create single-use trial codes and track each batch without confusing marketing trials with paid conversion." : "生成一次性体验码并按批次追踪，营销试用不会再被误算成付费转化。"}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-5 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline">
          {([
            [locale === "en" ? "Invited" : "邀请", totals.invited],
            [locale === "en" ? "Redeemed" : "兑换", totals.redeemed],
            [locale === "en" ? "Activated" : "激活", totals.activated],
            [locale === "en" ? "Published" : "发布", totals.published],
            [locale === "en" ? "Measured" : "回流", totals.measured]
          ] as Array<[string, number]>).map(([label, value]) => (
            <div key={label} className="min-w-[68px] bg-surface px-2 py-2.5 text-center">
              <p className="text-lg font-black tabular-nums text-fg">{value}</p>
              <p className="mt-0.5 text-[9px] font-bold text-fg-muted">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-xl border border-hairline bg-surface-2 p-4">
          <p className="text-xs font-bold text-fg">{locale === "en" ? "Create invitation batch" : "创建邀请批次"}</p>
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1.5 text-[11px] font-semibold text-fg-muted">
              {locale === "en" ? "Batch name" : "批次名称"}
              <input value={batchLabel} onChange={(event) => setBatchLabel(event.target.value)} placeholder={locale === "en" ? "July indie founders" : "7 月独立开发者"} className="focus-ring rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-fg" maxLength={60} />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <Field label={locale === "en" ? "Codes" : "人数"}>
                <input type="number" min={1} max={50} value={count} onChange={(event) => setCount(Number(event.target.value))} className="focus-ring w-full rounded-lg border border-hairline bg-surface px-2 py-2 text-sm text-fg" />
              </Field>
              <Field label={locale === "en" ? "Plan" : "套餐"}>
                <select value={plan} onChange={(event) => setPlan(event.target.value)} className="focus-ring w-full rounded-lg border border-hairline bg-surface px-2 py-2 text-sm text-fg">
                  <option value="starter">Starter</option><option value="pro">Pro</option><option value="growth">Growth</option><option value="employee">Employee</option>
                </select>
              </Field>
              <Field label={locale === "en" ? "Trial days" : "体验天数"}>
                <input type="number" min={1} max={90} value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value))} className="focus-ring w-full rounded-lg border border-hairline bg-surface px-2 py-2 text-sm text-fg" />
              </Field>
            </div>
            {error ? <p className="text-xs font-semibold text-risk">{error}</p> : null}
            <button type="button" onClick={() => void createCohort()} disabled={loading} className="btn-primary focus-ring disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {locale === "en" ? "Generate codes" : "生成体验码"}
            </button>
          </div>
        </div>

        <div className="min-w-0">
          {generated ? (
            <div className="mb-3 rounded-xl border border-positive/30 bg-positive/8 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2"><TicketCheck className="h-4 w-4 text-positive" /><p className="text-xs font-bold text-fg">{generated.batchLabel} · {generated.codes.length} codes</p></div>
                <button type="button" onClick={() => void copyCodes()} className="btn-ghost focus-ring px-2.5 py-1.5 text-xs">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? (locale === "en" ? "Copied" : "已复制") : locale === "en" ? "Copy all" : "复制全部"}</button>
              </div>
              <p className="mt-2 break-all font-mono text-[11px] leading-5 text-fg-muted">{generated.codes.join("  ·  ")}</p>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full min-w-[620px] border-collapse text-left">
              <thead className="bg-surface-2 text-[10px] font-bold uppercase tracking-wide text-fg-muted">
                <tr><th className="px-3 py-2.5">{locale === "en" ? "Batch" : "批次"}</th><th className="px-3 py-2.5">Plan</th><th className="px-3 py-2.5">{locale === "en" ? "Invite" : "邀请"}</th><th className="px-3 py-2.5">{locale === "en" ? "Redeem" : "兑换"}</th><th className="px-3 py-2.5">{locale === "en" ? "Activate" : "激活"}</th><th className="px-3 py-2.5">{locale === "en" ? "Publish" : "发布"}</th><th className="px-3 py-2.5">{locale === "en" ? "Measure" : "回流"}</th></tr>
              </thead>
              <tbody className="divide-y divide-hairline bg-surface text-xs">
                {cohorts.length > 0 ? cohorts.map((cohort) => (
                  <tr key={cohort.batchLabel}>
                    <td className="px-3 py-3"><p className="font-bold text-fg">{cohort.batchLabel}</p><p className="mt-0.5 text-[10px] text-fg-muted">{cohort.createdAt.slice(0, 10)}</p></td>
                    <td className="px-3 py-3 text-fg-muted">{cohort.plan} · {cohort.durationDays}d</td>
                    {[cohort.invited, cohort.redeemed, cohort.activated, cohort.published, cohort.measured].map((value, index) => <td key={index} className="px-3 py-3 font-black tabular-nums text-fg">{value}</td>)}
                  </tr>
                )) : (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-fg-muted">{locale === "en" ? "No seed cohort yet. Generate the first invitation batch on the left." : "还没有种子用户批次，从左侧生成第一批邀请。"}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-[11px] font-semibold text-fg-muted">{label}{children}</label>;
}
