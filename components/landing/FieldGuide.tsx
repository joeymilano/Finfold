"use client";

import React, { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Bot,
  Check,
  ClipboardPaste,
  Database,
  PenLine,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles
} from "@/components/ui/icons";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { TrackedCtaLink } from "@/components/marketing/TrackedCtaLink";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/motion-primitives";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import type { Locale } from "@/lib/i18n";

/* ------------------------------------------------------------------ */
/*  Field Guide — the product manual section of the landing page.      */
/*  Styled like a printed SaaS manual: a metadata masthead, a sticky   */
/*  table of contents with scroll-spy, and six numbered chapters,      */
/*  each pairing one strongest capability with a labelled diagram      */
/*  (FIG. 01–06), three how-to steps and a "when to use" strip.        */
/* ------------------------------------------------------------------ */

const SIGNUP_HREF = "/signup?next=%2Fdashboard";

type FigureProps = { locale: Locale };

/* ------------------------------------------------------------------ */
/*  Figures — hand-built schematic illustrations (manual style)        */
/* ------------------------------------------------------------------ */

function FigDiagnose({ locale }: FigureProps) {
  const zh = locale === "zh";
  return (
    <div className="panel overflow-hidden rounded-2xl shadow-raised">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-muted">
          FINFOLD · FF-XHS-0826
        </span>
        <span className="rounded-full border border-warn/25 bg-warn/[0.08] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warn">
          {zh ? "中置信" : "MEDIUM CONFIDENCE"}
        </span>
      </header>
      <div className="p-4 sm:p-5">
        <p className="text-pretty text-sm font-semibold leading-6 text-fg sm:text-[15px]">
          {zh
            ? "阅读下降更像内容风险 尚无证据证明账号被限流"
            : "Reach decline reads as content risk — no evidence of throttling yet"}
        </p>
        <div className="mt-4 rounded-xl border border-risk/25 bg-risk/[0.05] px-3 py-3">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-risk">
            <ShieldAlert className="h-3.5 w-3.5" />
            {zh ? "高风险表达 · 潜在" : "RISKY WORDING · POTENTIAL"}
          </p>
          <p className="mt-2 text-[12.5px] font-semibold leading-5 text-fg">
            {zh ? "“保证 3 天涨粉 10,000，评论区扣 1 领资料”" : "“Gain 10,000 followers in 3 days — comment 1 to get the file”"}
          </p>
          <p className="mt-1.5 text-[11px] leading-4 text-fg-muted">
            {zh ? "绝对化承诺与诱导互动叠加 命中不等于已限流" : "Absolute promise plus engagement bait — a flag, not a verdict"}
          </p>
        </div>
        <div className="mt-3 rounded-xl border border-positive/20 bg-positive/[0.05] px-3 py-3">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-positive">
            <PenLine className="h-3.5 w-3.5" />
            {zh ? "建议改成" : "SUGGESTED REWRITE"}
          </p>
          <p className="mt-2 text-[12.5px] font-semibold leading-5 text-fg">
            {zh
              ? "分享 3 个可验证的动作 每个都附适用条件"
              : "Share 3 verifiable moves, each with its conditions"}
          </p>
        </div>
      </div>
    </div>
  );
}

function FigBrandProfile({ locale }: FigureProps) {
  const zh = locale === "zh";
  return (
    <div className="panel rounded-2xl p-5 shadow-raised sm:p-6">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-strong to-brand text-bg">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-fg">{zh ? "品牌资料" : "Brand profile"}</p>
            <p className="text-[11px] text-fg-muted">{zh ? "创始人口吻" : "founder-voice"}</p>
          </div>
        </div>
        <span className="tag tag-success">
          <Check className="h-3 w-3" />
          {zh ? "已同步" : "synced"}
        </span>
      </header>
      <dl className="space-y-3.5">
        <div>
          <dt className="eyebrow mb-1.5">{zh ? "语气" : "Voice"}</dt>
          <dd className="flex flex-wrap gap-1.5">
            {(zh ? ["直接", "温和", "不夸大"] : ["direct", "warm", "no hype"]).map((t) => (
              <span key={t} className="tag tag-brand">{t}</span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="eyebrow mb-1.5">{zh ? "受众" : "Audience"}</dt>
          <dd className="text-[13px] leading-5 text-fg">
            {zh ? "正在做产品的独立创始人和小团队" : "Indie founders and small teams shipping in public"}
          </dd>
        </div>
        <div>
          <dt className="eyebrow mb-1.5">{zh ? "不想出现的词" : "Banned words"}</dt>
          <dd className="flex flex-wrap gap-1.5">
            {(zh ? ["行业领先", "顶级", "绝对"] : ["revolutionary", "game-changing", "no.1"]).map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-md border border-risk/25 bg-risk/10 px-2 py-0.5 text-[11px] font-medium text-risk line-through decoration-risk/70"
              >
                {t}
              </span>
            ))}
          </dd>
        </div>
        <div className="panel-inset rounded-lg p-3">
          <dt className="eyebrow mb-1.5">{zh ? "喜欢的范文" : "Approved example"}</dt>
          <dd className="text-[13px] italic leading-relaxed text-fg">
            {zh ? "“写给凌晨两点还在改产品的创始人。”" : "“Built for the 2am founder.”"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/* Skeleton building blocks for the platform figure */
function TextBar({ w = "w-full", tone = "bg-fg/15" }: { w?: string; tone?: string }) {
  return <span className={`block h-1.5 rounded-full ${tone} ${w}`} aria-hidden />;
}

function FigPlatforms({ locale }: FigureProps) {
  const zh = locale === "zh";
  return (
    <div className="panel rounded-2xl p-5 shadow-raised sm:p-6" aria-hidden>
      {/* The single source update */}
      <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface/70 px-3.5 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand">
          <ClipboardPaste className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-fg">
            {zh ? "v0.9 上线 账号诊断更快了" : "v0.9 shipped — faster account diagnosis"}
          </p>
          <p className="mt-0.5 text-[11px] text-fg-muted">{zh ? "一条更新 同时变成三个平台的内容" : "One update, three platform-ready pieces"}</p>
        </div>
      </div>
      <div className="my-3 flex justify-center text-fg-muted">
        <ArrowDown className="h-4 w-4" />
      </div>
      {/* Two upright cards — different native ratios */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface/70">
          <div className="relative aspect-[3/4] p-3">
            <div className="h-full w-full rounded-lg bg-gradient-to-br from-brand/25 via-accent/15 to-brand/5 p-3">
              <div className="space-y-1.5 pt-16">
                <TextBar w="w-4/5" tone="bg-fg/25" />
                <TextBar w="w-3/5" />
                <TextBar w="w-2/3" />
              </div>
            </div>
            <span className="absolute right-2 top-2 rounded bg-bg/85 px-1.5 py-0.5 font-mono text-[9px] font-bold text-brand backdrop-blur">3:4</span>
          </div>
          <div className="flex items-center gap-1.5 border-t border-hairline px-2.5 py-2">
            <PlatformGlyph platform="xiaohongshu" className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold text-fg">{zh ? "小红书笔记" : "RED note"}</span>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface/70">
          <div className="relative aspect-square p-3">
            <div className="flex gap-2">
              <span className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-accent to-brand" />
              <div className="flex-1 space-y-1.5 pt-0.5">
                <TextBar w="w-1/2" tone="bg-fg/25" />
                <TextBar w="w-full" />
                <TextBar w="w-5/6" />
                <TextBar w="w-2/3" />
              </div>
            </div>
            <div className="mt-3 h-14 rounded-lg bg-gradient-to-br from-accent/20 to-brand/10" />
            <span className="absolute right-2 top-2 rounded bg-bg/85 px-1.5 py-0.5 font-mono text-[9px] font-bold text-brand backdrop-blur">1:1</span>
          </div>
          <div className="flex items-center gap-1.5 border-t border-hairline px-2.5 py-2">
            <PlatformGlyph platform="x" className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold text-fg">{zh ? "X 长推" : "X post"}</span>
          </div>
        </div>
      </div>
      {/* A wide editorial cover */}
      <div className="mt-2.5 overflow-hidden rounded-xl border border-hairline bg-surface/70">
        <div className="relative aspect-[2.35/1] bg-gradient-to-r from-brand/20 via-surface-2 to-accent/15 p-3.5">
          <div className="flex h-full flex-col justify-between">
            <TextBar w="w-1/4" tone="bg-fg/20" />
            <div className="space-y-1.5">
              <TextBar w="w-3/5" tone="bg-fg/25" />
              <TextBar w="w-2/5" />
            </div>
          </div>
          <span className="absolute right-2 top-2 rounded bg-bg/85 px-1.5 py-0.5 font-mono text-[9px] font-bold text-brand backdrop-blur">2.35:1</span>
        </div>
        <div className="flex items-center gap-1.5 border-t border-hairline px-2.5 py-2">
          <PlatformGlyph platform="wechat" className="h-3.5 w-3.5" />
          <span className="text-[11px] font-semibold text-fg">{zh ? "公众号封面" : "WeChat cover"}</span>
        </div>
      </div>
    </div>
  );
}

function FigReview({ locale }: FigureProps) {
  const zh = locale === "zh";
  return (
    <div className="panel rounded-2xl p-5 shadow-raised sm:p-6">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-action/12 text-action">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-fg">{zh ? "发布前审核" : "Pre-publish review"}</p>
            <p className="text-[11px] text-fg-muted">{zh ? "小红书 · 初稿 2/3" : "RED · draft 2/3"}</p>
          </div>
        </div>
        <span className="rounded-full border border-action/25 bg-action/[0.08] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-action">
          {zh ? "等你审核" : "AWAITING YOU"}
        </span>
      </header>
      <div className="rounded-xl border border-hairline bg-surface/70 p-3.5" aria-hidden>
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-fg-muted">{zh ? "初稿原文" : "DRAFT"}</p>
        <p className="mt-1.5 text-[13px] leading-5 text-fg-muted line-through decoration-risk/70">
          {zh ? "市面上最强大的 AI 增长工具" : "the most powerful AI growth tool on the market"}
        </p>
        <p className="mt-3 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-fg-muted">{zh ? "建议表达" : "SUGGESTED"}</p>
        <p className="mt-1.5 text-[13px] font-semibold leading-5 text-fg">
          {zh ? "把发布时间从 3 小时缩到 30 分钟的做法" : "the workflow that cuts publishing from 3 hours to 30 minutes"}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2.5" aria-hidden>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3.5 py-2 text-xs font-semibold text-fg-muted">
          <PenLine className="h-3.5 w-3.5" />
          {zh ? "再改一版" : "Another version"}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-xs font-bold text-on-brand">
          <Check className="h-3.5 w-3.5" />
          {zh ? "就按这版发" : "Ship this version"}
        </span>
      </div>
      <p className="mt-3.5 text-[11px] leading-4 text-fg-muted">
        {zh ? "你确认之前 内容不会进入发布准备" : "Nothing moves toward publishing until you approve"}
      </p>
    </div>
  );
}

function FigRecord({ locale }: FigureProps) {
  const zh = locale === "zh";
  const rows = [
    { platform: "x" as const, label: zh ? "X · 发布记录复盘" : "X · repurposed launch note", pct: 72, verdict: zh ? "继续加码" : "Double down", tone: "positive" },
    { platform: "xiaohongshu" as const, label: zh ? "小红书 · 新号起笔记" : "RED · cold-start note", pct: 34, verdict: zh ? "先观察" : "Watch", tone: "muted" },
    { platform: "wechat" as const, label: zh ? "公众号 · 深度长文" : "WeChat · deep dive", pct: 51, verdict: zh ? "继续加码" : "Double down", tone: "positive" }
  ];
  return (
    <div className="panel rounded-2xl p-5 shadow-raised sm:p-6">
      <header className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-positive/12 text-positive">
          <Database className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-fg">{zh ? "发布记录" : "Publishing log"}</p>
          <p className="text-[11px] text-fg-muted">{zh ? "9 月 · 12 条已发布" : "September · 12 shipped"}</p>
        </div>
      </header>
      <ul className="space-y-2.5" aria-hidden>
        {rows.map((r) => (
          <li key={r.label} className="rounded-xl border border-hairline bg-surface/70 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <PlatformGlyph platform={r.platform} className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate text-[12px] font-semibold text-fg">{r.label}</span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                  r.tone === "positive" ? "bg-positive/12 text-positive" : "bg-surface-2 text-fg-muted"
                }`}
              >
                {r.verdict}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full ${r.tone === "positive" ? "bg-positive/70" : "bg-fg-muted/40"}`}
                style={{ width: `${r.pct}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-xl border border-hairline bg-surface/60 px-3 py-2.5 text-[11px] leading-4 text-fg-muted" aria-hidden>
        {zh
          ? "月度总结：实测类内容互动稳定 下月多写 2 篇"
          : "Monthly summary: tested-workflow posts hold engagement — write two more next month"}
      </p>
    </div>
  );
}

function FigAgents({ locale }: FigureProps) {
  const zh = locale === "zh";
  const nodes = [
    {
      key: "agent",
      icon: <Bot className="h-4 w-4" />,
      ring: "bg-accent/12 text-accent",
      title: zh ? "你的智能体" : "Your agent",
      sub: zh ? "已在 GitHub 上运行" : "already running on GitHub"
    },
    {
      key: "finfold",
      icon: <span className="flex h-4 w-4 items-center justify-center overflow-hidden"><FishLogo variant="app-icon" className="h-5 w-5 object-cover" /></span>,
      ring: "bg-brand/12 text-brand",
      title: "Finfold",
      sub: zh ? "接收任务 准备内容" : "takes the mission, prepares content"
    },
    {
      key: "review",
      icon: <ShieldCheck className="h-4 w-4" />,
      ring: "bg-action/12 text-action",
      title: zh ? "回到你面前" : "Back to you",
      sub: zh ? "审核后才算完成" : "done only after your review"
    }
  ];
  return (
    <div className="panel rounded-2xl p-5 shadow-raised sm:p-6">
      <ul className="grid items-stretch gap-2.5 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:gap-0" aria-hidden>
        {nodes.map((n, i) => (
          <React.Fragment key={n.key}>
            <li className="flex flex-col justify-center rounded-xl border border-hairline bg-surface/70 px-3.5 py-4 text-center sm:px-3">
              <span className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${n.ring}`}>{n.icon}</span>
              <p className="mt-2.5 text-[12.5px] font-bold text-fg">{n.title}</p>
              <p className="mt-1 text-[11px] leading-4 text-fg-muted">{n.sub}</p>
            </li>
            {i < nodes.length - 1 ? (
              <li className="hidden items-center px-1.5 text-fg-muted sm:flex" aria-hidden>
                <ArrowRight className="h-4 w-4" />
              </li>
            ) : null}
          </React.Fragment>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-3.5">
        <p className="text-[11px] font-semibold text-fg-muted">{zh ? "支持 Agents 和 GitHub" : "Works with Agents & GitHub"}</p>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand">
          {zh ? "接入说明" : "Access guide"} <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Copy — bilingual, organized as manual chapters                     */
/* ------------------------------------------------------------------ */

type Chapter = {
  id: string;
  icon: ComponentType<{ className?: string }>;
  nav: string;
  kicker: string;
  title: string;
  body: string;
  steps: string[];
  when: string[];
  whenLabel: string;
  Fig: ComponentType<FigureProps>;
  figCaption: string;
  link?: { href: string; label: string };
};

const GUIDE: Record<Locale, {
  mastheadLeft: string;
  mastheadRight: string;
  eyebrow: string;
  title: string;
  sub: string;
  contentsLabel: string;
  chapters: Chapter[];
  endTitle: string;
  endNote: string;
  cta: string;
}> = {
  zh: {
    mastheadLeft: "FINFOLD FIELD GUIDE",
    mastheadRight: "2026.09 版 · 共六章",
    eyebrow: "使用手册 · MANUAL",
    title: "六件最值钱的本事 一章一件",
    sub: "不用从头读。你最头疼哪件事 就先翻哪一章——每章一张示意图、三个步骤 看完就能上手",
    contentsLabel: "目录",
    chapters: [
      {
        id: "platforms",
        icon: ClipboardPaste,
        nav: "多平台内容",
        kicker: "CH.01 · 一次输入 多平台就绪",
        title: "每个平台 用它自己的写法",
        body: "同一条更新 小红书拿到笔记 公众号拿到文章 X 拿到帖子。文案、封面、配图和尺寸一次备齐 9 种常用尺寸直接能发——找设计师排期的钱和时间 都省下来。",
        steps: ["把要发的更新发给它", "勾选要发的平台", "拿到每个平台直接能发的内容"],
        when: ["一个人管好几个号", "没有专职设计师", "改尺寸改到眼花"],
        whenLabel: "何时翻开这一章",
        Fig: FigPlatforms,
        figCaption: "多平台尺寸示意"
      },
      {
        id: "diagnose",
        icon: Radar,
        nav: "账号诊断",
        kicker: "CH.02 · 流量急诊室",
        title: "先查清楚问题 再决定怎么改",
        body: "阅读量掉了 先别急着换方向。把账号链接或后台数据给它 它同时看账号状态、分发数据、内容转化和平台规则 逐句指出哪句话可能卡审核 哪些有平台证据 哪些只是猜测。",
        steps: ["上传账号链接、Post 或后台数据", "读报告 分清「有证据」和「有风险」", "按建议改下一篇 对比前后数据"],
        when: ["阅读量突然下滑", "新号冷启动", "怀疑被限流"],
        whenLabel: "何时翻开这一章",
        Fig: FigDiagnose,
        figCaption: "账号诊断报告示意",
        link: { href: "/signup?next=%2Foperations%2Faccount-health", label: "从一次诊断开始" }
      },
      {
        id: "brand",
        icon: Sparkles,
        nav: "品牌资料",
        kicker: "CH.03 · 品牌资料",
        title: "告诉它一次 之后都按你的方式写",
        body: "品牌名、受众、语气、不想出现的词 填一次就行。你改过的每一处它也记得——第二个月的稿子 会比第一个月更像你写的。",
        steps: ["填一次品牌资料 受众和语气", "放上你喜欢的范文", "之后每份初稿自动对照检查"],
        when: ["同样的修改意见说了十遍", "团队里谁写都行 口径要对齐"],
        whenLabel: "何时翻开这一章",
        Fig: FigBrandProfile,
        figCaption: "品牌资料示意"
      },
      {
        id: "review",
        icon: ShieldCheck,
        nav: "审核把关",
        kicker: "CH.04 · 你说了算",
        title: "它先准备 发不发由你决定",
        body: "Finfold智能体自己找机会 备好任务和初稿 然后停下来等你。不满意的地方直接在稿子上改 或让它重写一版——你点头之前 什么都不会发出去。",
        steps: ["看初稿和这样写的理由", "直接改 或让它再写一版", "你确认之后 才进入发布准备"],
        when: ["品牌口径严格", "发布前必须人工把关"],
        whenLabel: "何时翻开这一章",
        Fig: FigReview,
        figCaption: "发布前审核示意"
      },
      {
        id: "record",
        icon: Database,
        nav: "发布与记录",
        kicker: "CH.05 · 每次发布都有下文",
        title: "发出去之后 数据和结论不散落",
        body: "链接、表现、结论 归在同一个地方 每月还有一份简短总结。下个月写稿 从上个月验证过的结论接着写 不用从零猜。",
        steps: ["发布后把链接记回来", "看每月的内容总结", "从有效的内容继续加码"],
        when: ["不知道哪类内容有效", "复盘全靠翻聊天记录"],
        whenLabel: "何时翻开这一章",
        Fig: FigRecord,
        figCaption: "发布记录示意"
      },
      {
        id: "agents",
        icon: Bot,
        nav: "智能体接入",
        kicker: "CH.06 · 让现有智能体直接用",
        title: "你的智能体 可以直接调用 Finfold",
        body: "支持 Agents 和 GitHub。已经在跑的智能体加一步就能用 它准备的内容会回到这里 等你审核。",
        steps: ["查看接入说明", "给你的智能体加一步", "在 Finfold 里审核它的产出"],
        when: ["已有自己的智能体工作流"],
        whenLabel: "何时翻开这一章",
        Fig: FigAgents,
        figCaption: "智能体接入示意",
        link: { href: "/for-agents", label: "查看接入说明" }
      }
    ],
    endTitle: "手册读完 就差你的一条更新",
    endNote: "免费注册 · 数据全程加密",
    cta: "免费开始"
  },
  en: {
    mastheadLeft: "FINFOLD FIELD GUIDE",
    mastheadRight: "EDITION 2026.09 · 6 CHAPTERS",
    eyebrow: "PRODUCT MANUAL",
    title: "Six chapters, six ways it pays for itself",
    sub: "Don't read it cover to cover. Open the chapter for whatever's hurting most — one diagram, three steps, and you're ready to try it.",
    contentsLabel: "Contents",
    chapters: [
      {
        id: "platforms",
        icon: ClipboardPaste,
        nav: "Platform-native content",
        kicker: "CH.01 · ONE INPUT, EVERY PLATFORM",
        title: "Each platform, written its own way",
        body: "One update becomes a RED note, a WeChat article and an X post — copy, covers, images and sizes prepared together, nine common ratios ready to publish. The designer queue you used to wait in? Gone.",
        steps: ["Send it the update you want out", "Pick the platforms", "Get post-ready content for each"],
        when: ["One person, several accounts", "No designer on the team", "Sick of resizing by hand"],
        whenLabel: "When to open this chapter",
        Fig: FigPlatforms,
        figCaption: "Native sizes, illustrated"
      },
      {
        id: "diagnose",
        icon: Radar,
        nav: "Account diagnosis",
        kicker: "CH.02 · TRAFFIC FIRST AID",
        title: "Find out what's wrong before you change anything",
        body: "Reach dropped? Don't rewrite your whole strategy yet. Give it an account link or a dashboard export — it reads account status, distribution, conversion and platform rules at once, flags the exact lines that could hurt review or reach, and tells proven issues from guesses.",
        steps: ["Upload a link, a post, or dashboard data", "Read the report — evidence vs. risk", "Fix the next post, compare the numbers"],
        when: ["Reach suddenly dropped", "New account cold start", "Suspect you're throttled"],
        whenLabel: "When to open this chapter",
        Fig: FigDiagnose,
        figCaption: "Diagnosis report, illustrated",
        link: { href: "/signup?next=%2Foperations%2Faccount-health", label: "Start with a diagnosis" }
      },
      {
        id: "brand",
        icon: Sparkles,
        nav: "Brand profile",
        kicker: "CH.03 · BRAND PROFILE",
        title: "Tell it once — every draft follows your voice",
        body: "Brand name, audience, tone, banned words — fill them in once. It remembers your edits too, so month two's drafts sound closer to you than month one's.",
        steps: ["Fill in the profile once", "Add writing you like", "Every draft is checked against it"],
        when: ["Same edits, every round", "Anyone can write, the voice can't drift"],
        whenLabel: "When to open this chapter",
        Fig: FigBrandProfile,
        figCaption: "Brand profile, illustrated"
      },
      {
        id: "review",
        icon: ShieldCheck,
        nav: "Human review",
        kicker: "CH.04 · YOU DECIDE",
        title: "It prepares — you decide what ships",
        body: "The Finfold agent finds opportunities, readies missions and drafts, then stops and waits. Edit inline, or ask for another version — nothing moves until you nod.",
        steps: ["Read the draft and its reasoning", "Edit inline or ask for a rewrite", "Only your OK moves it forward"],
        when: ["Strict brand voice", "Nothing ships without a human"],
        whenLabel: "When to open this chapter",
        Fig: FigReview,
        figCaption: "Pre-publish review, illustrated"
      },
      {
        id: "record",
        icon: Database,
        nav: "Publishing log",
        kicker: "CH.05 · EVERY POST HAS A NEXT STEP",
        title: "After it ships, data and verdicts stay together",
        body: "Links, results and conclusions live in one place, summed up monthly in plain language. Next month's drafts start from what last month proved — not from zero.",
        steps: ["Log the link after publishing", "Read the monthly summary", "Double down on what worked"],
        when: ["No idea which content works", "Reviews live in chat history"],
        whenLabel: "When to open this chapter",
        Fig: FigRecord,
        figCaption: "Publishing log, illustrated"
      },
      {
        id: "agents",
        icon: Bot,
        nav: "Agent access",
        kicker: "CH.06 · FOR YOUR EXISTING AGENTS",
        title: "Your agents can call Finfold directly",
        body: "Agents and GitHub supported. Add one step to a running agent and its output comes back here for your review.",
        steps: ["Read the access guide", "Add one step to your agent", "Review its output in Finfold"],
        when: ["You already run an agent workflow"],
        whenLabel: "When to open this chapter",
        Fig: FigAgents,
        figCaption: "Agent access, illustrated",
        link: { href: "/for-agents", label: "Read the access guide" }
      }
    ],
    endTitle: "End of guide — one update is all it takes",
    endNote: "Free to start · data encrypted",
    cta: "Start free"
  }
};

/* ------------------------------------------------------------------ */
/*  Section                                                            */
/* ------------------------------------------------------------------ */

export function FieldGuide({ locale, headingLevel = "h2" }: { locale: Locale; headingLevel?: "h1" | "h2" }) {
  const g = GUIDE[locale];
  const Heading = headingLevel;
  const [activeChapter, setActiveChapter] = useState<string>(g.chapters[0].id);

  /* Scroll-spy: highlight the chapter crossing the upper third of the
     viewport, the way documentation sidebars do. */
  useEffect(() => {
    const sections = g.chapters
      .map((ch) => document.getElementById(`guide-${ch.id}`))
      .filter((node): node is HTMLElement => Boolean(node));
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveChapter(entry.target.id.replace(/^guide-/, ""));
          }
        }
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 }
    );
    sections.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [g.chapters]);

  return (
    <section id="guide" className="relative border-t border-hairline bg-bg">
      <div className="mx-auto max-w-6xl px-5 pt-20 sm:pt-28">
        {/* Masthead — manual metadata rule, like a printed field guide */}
        <Reveal>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-hairline pb-4 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-fg-muted">
            <span>{g.mastheadLeft}</span>
            <span className="text-brand">{g.mastheadRight}</span>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="eyebrow-mono mt-10">{g.eyebrow}</p>
          <Heading className="text-pretty mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.025em] text-fg sm:text-5xl">
            {g.title}
          </Heading>
          <p className="mt-5 max-w-2xl text-base leading-7 text-fg-muted">{g.sub}</p>
        </Reveal>

        {/* Manual body: sticky table of contents + numbered chapters */}
        <div className="mt-14 grid gap-10 lg:grid-cols-[230px_1fr] lg:gap-16">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <p className="eyebrow-mono hidden lg:block">{g.contentsLabel}</p>
            <nav
              aria-label={locale === "en" ? "Field guide contents" : "使用手册目录"}
              className="-mx-5 overflow-x-auto px-5 pb-1 lg:mx-0 lg:px-0"
            >
              <ul className="flex gap-2 lg:flex-col lg:gap-1">
                {g.chapters.map((ch, index) => {
                  const active = ch.id === activeChapter;
                  return (
                    <li key={ch.id} className="shrink-0 lg:shrink">
                      <a
                        href={`#guide-${ch.id}`}
                        className={`focus-ring group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                          active ? "bg-brand/10 text-fg" : "text-fg-muted hover:bg-fg/5 hover:text-fg"
                        }`}
                      >
                        <span
                          className={`font-mono text-[10px] font-bold tracking-widest transition-colors ${
                            active ? "text-brand" : "text-fg-muted/70 group-hover:text-fg-muted"
                          }`}
                        >
                          0{index + 1}
                        </span>
                        <span className="whitespace-nowrap font-semibold">{ch.nav}</span>
                        <span
                          className={`ml-auto hidden h-1 w-1 rounded-full transition-colors lg:block ${
                            active ? "bg-brand" : "bg-transparent"
                          }`}
                          aria-hidden
                        />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <div>
            {g.chapters.map((ch, index) => {
              const flip = index % 2 === 1;
              const { Fig } = ch;
              return (
                <article
                  key={ch.id}
                  id={`guide-${ch.id}`}
                  className="scroll-mt-28 border-t border-hairline py-14 first:border-t-0 first:pt-0 sm:py-16 lg:py-20"
                >
                  <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
                    <Reveal className={flip ? "lg:order-2" : ""}>
                      <div className="flex items-center gap-4">
                        <span className="font-display text-4xl font-semibold tabular leading-none text-brand/25 sm:text-5xl">
                          0{index + 1}
                        </span>
                        <span className="eyebrow-mono">{ch.kicker}</span>
                      </div>
                      <h3 className="text-pretty mt-5 text-2xl font-semibold leading-tight tracking-tight text-fg sm:text-[2rem]">
                        {ch.title}
                      </h3>
                      <p className="mt-4 max-w-xl text-[15px] leading-7 text-fg-muted">{ch.body}</p>
                      <Stagger className="mt-7 space-y-4" gap={0.1}>
                        {ch.steps.map((step, stepIndex) => (
                          <StaggerItem key={step} y={14}>
                            <div className="flex items-start gap-3.5">
                              <span className="mt-0.5 font-mono text-[11px] font-bold tabular text-brand">
                                {stepIndex + 1}
                              </span>
                              <p className="text-sm leading-6 text-fg">{step}</p>
                            </div>
                          </StaggerItem>
                        ))}
                      </Stagger>
                      <div className="mt-7 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-fg-muted">
                          {ch.whenLabel}
                        </span>
                        {ch.when.map((w) => (
                          <span key={w} className="tag tag-brand">
                            {w}
                          </span>
                        ))}
                      </div>
                      {ch.link ? (
                        <Link
                          href={ch.link.href}
                          className="focus-ring mt-7 inline-flex items-center gap-2 text-sm font-semibold text-brand transition-colors hover:underline"
                        >
                          {ch.link.label} <ArrowRight className="h-4 w-4" />
                        </Link>
                      ) : null}
                    </Reveal>
                    <Reveal delay={0.14} y={30} className={flip ? "lg:order-1" : ""}>
                      <figure>
                        <Fig locale={locale} />
                        <figcaption className="mt-3 flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-muted">
                          <span className="text-brand">FIG. 0{index + 1}</span>
                          <span aria-hidden className="h-px w-5 bg-hairline-strong/60" />
                          {ch.figCaption}
                        </figcaption>
                      </figure>
                    </Reveal>
                  </div>
                </article>
              );
            })}

            {/* End-of-guide colophon */}
            <Reveal className="border-t border-hairline pt-12">
              <div className="panel rounded-2xl p-6 sm:p-8">
                <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
                  <div>
                    <p className="eyebrow-mono">— {locale === "en" ? "END OF GUIDE" : "手册完"}</p>
                    <h3 className="mt-3 text-xl font-semibold leading-tight tracking-tight text-fg sm:text-2xl">
                      {g.endTitle}
                    </h3>
                    <p className="mt-2 text-sm text-fg-muted">{g.endNote}</p>
                  </div>
                  <TrackedCtaLink
                    href={SIGNUP_HREF}
                    sourceType="landing"
                    sourceSlug="home"
                    sourceSurface="field_guide"
                    ctaId="landing_field_guide_end"
                    destination="signup"
                    locale={locale}
                    className="btn-primary focus-ring shrink-0 px-6 py-3 text-sm"
                  >
                    {g.cta} <ArrowRight className="h-4 w-4" />
                  </TrackedCtaLink>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
