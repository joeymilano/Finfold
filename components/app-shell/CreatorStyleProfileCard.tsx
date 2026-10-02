"use client";

import React from "react";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles, Target } from "@/components/ui/icons";
import type { CreatorStyleProfile } from "@/lib/agent/style-profile-schema";

export function CreatorStyleProfileCard({
  profile,
  locale,
  variant = "dark",
  compact = false,
  onAskAgent
}: {
  profile: CreatorStyleProfile;
  locale: "zh" | "en";
  variant?: "dark" | "surface";
  compact?: boolean;
  onAskAgent?: (prompt: string) => void;
}) {
  const zh = locale === "zh";
  const dark = variant === "dark";
  const sections = [
    [zh ? "选题与受众" : "Audience & topics", profile.audienceAndTopics],
    [zh ? "标题、封面与开场" : "Hooks & packaging", profile.hooksAndPackaging],
    [zh ? "结构与叙事节奏" : "Structure & rhythm", profile.structureAndRhythm],
    [zh ? "证据与信任" : "Proof & trust", profile.proofAndTrust],
    [zh ? "互动与转化" : "Engagement & conversion", profile.engagementAndConversion]
  ] as const;
  const confidence = profile.confidence === "high"
    ? (zh ? "高证据一致性" : "High evidence consistency")
    : profile.confidence === "medium"
      ? (zh ? "中等证据" : "Medium evidence")
      : (zh ? "证据有限" : "Limited evidence");
  const performance = profile.performanceStatus === "performance_evidence_supplied"
    ? (zh ? "已提供表现指标" : "Performance metrics supplied")
    : (zh ? "仅为对标样本，未验证爆款表现" : "Reference samples; performance not verified");

  return (
    <section className={`mt-3 overflow-hidden rounded-xl border ${dark ? "border-action/25 bg-[#0c1514]" : "border-action/25 bg-action/[0.045]"}`} aria-label={zh ? "对标博主能力画像" : "Benchmark creator capability profile"}>
      <div className={`border-b px-4 py-3 ${dark ? "border-white/10" : "border-hairline"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-action">
              <Sparkles className="h-3.5 w-3.5" />
              {zh ? "对标博主能力画像" : "Creator capability profile"}
            </p>
            <h3 className={`mt-1 text-base font-black ${dark ? "text-white" : "text-fg"}`}>{profile.creatorName}</h3>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
            <span className={`rounded-full border px-2 py-1 ${dark ? "border-white/10 text-white/72" : "border-hairline text-fg-muted"}`}>{confidence}</span>
            <span className={`rounded-full border px-2 py-1 ${profile.performanceStatus === "performance_evidence_supplied" ? "border-positive/30 text-positive" : dark ? "border-warn/25 text-warn" : "border-warn/30 text-warn"}`}>{performance}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4">
        <div className={`grid gap-3 ${compact ? "" : "lg:grid-cols-2"}`}>
          {sections.map(([title, findings]) => (
            <div key={title} className={`rounded-lg border p-3 ${dark ? "border-white/10 bg-white/[0.025]" : "border-hairline bg-surface/70"}`}>
              <p className={`text-[11px] font-black uppercase tracking-wider ${dark ? "text-white/68" : "text-fg-muted"}`}>{title}</p>
              <ul className="mt-2 grid gap-2">
                {findings.slice(0, compact ? 2 : 4).map((item) => (
                  <li key={`${title}-${item.finding}`} className={`text-xs leading-5 ${dark ? "text-white/76" : "text-fg"}`}>
                    {item.finding}
                    <EvidenceIds ids={item.evidenceIds} dark={dark} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className={`rounded-lg border p-3 ${dark ? "border-action/25 bg-action/[0.065]" : "border-action/25 bg-action/[0.05]"}`}>
          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-action">
            <Target className="h-3.5 w-3.5" />
            {zh ? "可迁移规则" : "Transferable rules"}
          </p>
          <ol className="mt-2 grid gap-2">
            {profile.transferableRules.map((rule, index) => (
              <li key={rule.finding} className={`flex gap-2 text-xs leading-5 ${dark ? "text-white/82" : "text-fg"}`}>
                <span className="font-black text-action">{index + 1}.</span>
                <span>{rule.finding}<EvidenceIds ids={rule.evidenceIds} dark={dark} /></span>
              </li>
            ))}
          </ol>
        </div>

        <div className={`rounded-lg border p-3 ${dark ? "border-white/10 bg-white/[0.025]" : "border-hairline bg-surface/70"}`}>
          <p className={`text-[11px] font-black uppercase tracking-wider ${dark ? "text-white/68" : "text-fg-muted"}`}>
            {zh ? "证据来源" : "Evidence sources"}
          </p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {profile.evidenceSources.slice(0, compact ? 3 : 12).map((source) => {
              const label = source.sourceType === "pasted_text"
                ? (zh ? "粘贴文本" : "Pasted text")
                : source.sourceType === "screenshot"
                  ? (zh ? "截图观察" : "Screenshot observation")
                  : source.sourceType === "public_post"
                    ? (zh ? "公开内容" : "Public post")
                    : (zh ? "表现数据" : "Performance export");
              const content = (
                <>
                  <span className="font-black text-action">{source.id}</span>
                  <span className="min-w-0 flex-1 truncate">{source.title}</span>
                  <span className={dark ? "text-white/60" : "text-fg-muted"}>{label}{source.hasMetrics ? (zh ? " · 含指标" : " · metrics") : ""}</span>
                </>
              );
              return (
                <li key={source.id}>
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer" className={`focus-ring flex min-h-9 items-center gap-2 rounded-md border px-2.5 text-[10px] transition hover:border-action/40 ${dark ? "border-white/10 text-white/78" : "border-hairline text-fg"}`}>
                      {content}
                    </a>
                  ) : (
                    <div className={`flex min-h-9 items-center gap-2 rounded-md border px-2.5 text-[10px] ${dark ? "border-white/10 text-white/78" : "border-hairline text-fg"}`}>
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`grid gap-3 ${compact ? "" : "md:grid-cols-2"}`}>
          <div className={`rounded-lg border p-3 ${dark ? "border-risk/20 bg-risk/[0.04]" : "border-risk/20 bg-risk/[0.035]"}`}>
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-risk">
              <ShieldCheck className="h-3.5 w-3.5" />
              {zh ? "不应复制" : "Do not copy"}
            </p>
            <ul className={`mt-2 list-disc space-y-1 pl-4 text-xs leading-5 ${dark ? "text-white/68" : "text-fg-muted"}`}>
              {profile.doNotCopy.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className={`rounded-lg border p-3 ${dark ? "border-white/10 bg-white/[0.025]" : "border-hairline bg-surface/70"}`}>
            <p className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-wider ${dark ? "text-white/68" : "text-fg-muted"}`}>
              <CheckCircle2 className="h-3.5 w-3.5 text-action" />
              {zh ? "证据局限" : "Evidence limits"}
            </p>
            <ul className={`mt-2 list-disc space-y-1 pl-4 text-xs leading-5 ${dark ? "text-white/68" : "text-fg-muted"}`}>
              {(profile.limitations.length ? profile.limitations : [zh ? "未发现额外局限。" : "No additional limitation reported."]).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>

        {onAskAgent ? (
          <div className="flex flex-wrap gap-2 border-t border-current/10 pt-3">
            {[
              [zh ? "用于下一篇内容" : "Use for the next post", zh ? "使用这份已分析的对标风格画像，帮我完成下一篇内容；保留我的身份与事实，不复制博主原文。" : "Use this analyzed creator profile for my next post without copying the creator's identity or wording."],
              [zh ? "生成 3 个选题实验" : "Create 3 topic experiments", zh ? "基于这份画像生成 3 个一次只改变一个变量的选题实验，并说明各自验证什么。" : "Create three single-variable topic experiments from this profile and explain what each tests."],
              [zh ? "加入 14 天陪跑" : "Add to 14-day coaching", zh ? "把这份画像中可迁移的规则加入我的 14 天小红书陪跑计划，先让我确认实验变量。" : "Add the transferable rules to my 14-day Xiaohongshu coaching plan and ask me to confirm the experiment variable first."]
            ].map(([label, prompt]) => (
              <button key={label} type="button" onClick={() => onAskAgent(prompt)} className={`focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition ${dark ? "border-white/12 text-white/72 hover:border-action/45 hover:text-white" : "border-hairline text-fg-muted hover:border-action/45 hover:text-fg"}`}>
                {label}<ArrowRight className="h-3 w-3" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function EvidenceIds({ ids, dark }: { ids: string[]; dark: boolean }) {
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => (
        <span key={id} className={`rounded px-1 py-0.5 text-[9px] font-black ${dark ? "bg-white/[0.07] text-white/70" : "bg-surface-2 text-fg-muted"}`}>{id}</span>
      ))}
    </span>
  );
}
