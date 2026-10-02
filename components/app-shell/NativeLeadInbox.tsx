"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Mail,
  MessageSquare,
  ShieldCheck,
  XCircle
} from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import type { NativeLeadSummary } from "@/lib/native-leads";

type LeadResponse = { leads?: NativeLeadSummary[]; error?: string };

export function NativeLeadInbox({
  missionId,
  locale,
  acceptingSubmissions,
  onChanged
}: {
  missionId: string;
  locale: "en" | "zh";
  acceptingSubmissions: boolean;
  onChanged: () => Promise<void>;
}) {
  const en = locale === "en";
  const [leads, setLeads] = useState<NativeLeadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent/missions/${missionId}/leads`, { cache: "no-store" });
      const result = await response.json().catch(() => ({})) as LeadResponse;
      if (!response.ok) throw new Error(result.error ?? (en ? "Unable to load lead submissions." : "暂时无法加载线索。"));
      setLeads(result.leads ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (en ? "Unable to load lead submissions." : "暂时无法加载线索。"));
    } finally {
      setLoading(false);
    }
  }, [en, missionId]);

  useEffect(() => { void load(); }, [load]);

  const newCount = useMemo(() => leads.filter((lead) => lead.status === "new").length, [leads]);

  async function review(leadId: string, decision: "qualify" | "reject") {
    setReviewingId(leadId);
    setError(null);
    try {
      const response = await fetch(`/api/agent/missions/${missionId}/leads/${leadId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? (en ? "Unable to review this lead." : "暂时无法确认这条线索。"));
      await Promise.all([load(), onChanged()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (en ? "Unable to review this lead." : "暂时无法确认这条线索。"));
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <Panel className="overflow-hidden p-0">
      <div className="relative border-b border-hairline bg-[linear-gradient(120deg,rgb(var(--surface-2)/0.86),rgb(var(--brand)/0.08))] px-5 py-5 md:px-6">
        <div aria-hidden className="absolute right-5 top-5 font-mono text-5xl font-black tracking-[-0.12em] text-brand/10">LEAD</div>
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">{en ? "CONSENTED LEAD INBOX" : "自愿留资收件箱"}</p>
            <h3 className="mt-2 text-xl font-black text-fg">
              {newCount > 0
                ? (en ? `${newCount} waiting for your judgment` : `${newCount} 条等待你判断`)
                : (en ? "A real lead starts with a real person" : "真实线索，从真人主动表达开始")}
            </h3>
            <p className="mt-2 max-w-2xl text-xs font-semibold leading-5 text-fg-muted">
              {en
                ? "A submission is only a candidate. Confirm that it matches your qualified-lead rule before Finfold counts it as an outcome."
                : "表单提交只是候选；只有你确认符合有效线索条件后，Finfold 才会把它计入任务结果。"}
            </p>
          </div>
          <Tag tone={acceptingSubmissions ? "success" : "neutral"} dot>
            {acceptingSubmissions ? (en ? "Form open" : "表单开放中") : (en ? "Form paused" : "表单未开放")}
          </Tag>
        </div>
      </div>

      <div className="p-5 md:p-6">
        {loading ? (
          <div className="grid gap-3" aria-label={en ? "Loading lead submissions" : "正在加载线索"}>
            {[0, 1].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-surface-2/65" />)}
          </div>
        ) : leads.length === 0 ? (
          <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-hairline bg-surface-2/35 px-5 py-8 text-center">
            <ShieldCheck className="h-6 w-6 text-brand" />
            <p className="mt-3 text-sm font-black text-fg">{en ? "No invented pipeline" : "不制造虚假商机"}</p>
            <p className="mt-1 max-w-lg text-xs font-semibold leading-5 text-fg-muted">
              {en ? "Share the mission's lead form. The first consented submission will appear here with its source intact." : "分享这条任务的线索表单。第一条自愿提交会带着真实来源出现在这里。"}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {leads.map((lead) => (
              <article key={lead.id} className={`rounded-xl border p-4 transition ${lead.status === "new" ? "border-brand/35 bg-brand/[0.045]" : "border-hairline bg-surface-2/35"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag tone={lead.status === "qualified" ? "success" : lead.status === "rejected" ? "neutral" : "warn"} dot>
                        {leadStatus(lead.status, locale)}
                      </Tag>
                      <time className="text-[10px] font-bold text-fg-subtle">{formatDate(lead.createdAt, locale)}</time>
                    </div>
                    <h4 className="mt-3 flex items-center gap-2 text-base font-black text-fg"><Building2 className="h-4 w-4 text-brand" />{lead.company}</h4>
                    <a href={`mailto:${encodeURIComponent(lead.workEmail)}`} className="focus-ring mt-2 inline-flex rounded text-xs font-bold text-action-strong hover:underline dark:text-action"><Mail className="mr-2 h-3.5 w-3.5" />{lead.workEmail}</a>
                  </div>
                  {lead.status === "new" ? (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="tertiary" disabled={reviewingId === lead.id} onClick={() => void review(lead.id, "reject")}>
                        <XCircle className="h-3.5 w-3.5" />{en ? "Not a fit" : "不符合"}
                      </Button>
                      <Button size="sm" variant="primary" loading={reviewingId === lead.id} onClick={() => void review(lead.id, "qualify")}>
                        <CheckCircle2 className="h-3.5 w-3.5" />{en ? "Count as lead" : "计为有效线索"}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 flex items-start gap-2 border-l-2 border-hairline-strong pl-3 text-xs font-medium leading-6 text-fg-muted">
                  <MessageSquare className="mt-1 h-3.5 w-3.5 shrink-0" />
                  <p className="whitespace-pre-wrap">{lead.need}</p>
                </div>
                {lead.status === "qualified" ? (
                  <p className="mt-3 flex items-center gap-2 text-[11px] font-bold text-positive"><CheckCircle2 className="h-3.5 w-3.5" />{en ? "Recorded once in the outcome ledger" : "已幂等写入任务结果账本"}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
        {error ? <p role="alert" className="mt-3 rounded-lg border border-risk/25 bg-risk/10 px-3 py-2 text-xs font-bold text-risk">{error}</p> : null}
        <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold leading-4 text-fg-subtle">
          <ArrowRight className="h-3.5 w-3.5" />
          <span>{en ? "Contact details stay outside analytics and the outcome ledger." : "联系方式不会进入分析事件或结果账本。"}</span>
        </div>
      </div>
    </Panel>
  );
}

function leadStatus(status: NativeLeadSummary["status"], locale: "en" | "zh"): string {
  if (locale === "en") return status === "new" ? "Awaiting review" : status === "qualified" ? "Qualified" : "Not qualified";
  return status === "new" ? "等待判断" : status === "qualified" ? "有效线索" : "不符合";
}

function formatDate(value: string, locale: "en" | "zh"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
