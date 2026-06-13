"use client";

import Link from "next/link";
import { ArrowRight, Download, FileStack, Filter, Loader2, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import type { AtomizedKit } from "@/lib/atomizer";
import { growthGoals, type GoalId } from "@/lib/goals";
import { packages, packageStatusLabels } from "@/lib/ops-data";
import { personas, type PersonaId } from "@/lib/personas";
import { platforms, type PlatformId } from "@/lib/platforms";
import { useLocale } from "@/hooks/useLocale";

const statusToneClass: Record<string, string> = {
  待审核: "tag tag-warn",
  已批准: "tag tag-success",
  排期中: "tag tag-accent",
  需补齐: "tag tag-risk"
};

export default function PackagesPage() {
  const locale = useLocale();
  const [sourceText, setSourceText] = useState("Finfold / Finfold把一个产品卖点拆成小红书、公众号、X、LinkedIn、Reddit、Product Hunt 等平台原生内容，帮助中国独立开发者和 AI SaaS 小团队更快完成出海获客。");
  const [goal, setGoal] = useState<GoalId>("lead-gen");
  const [persona, setPersona] = useState<PersonaId>("ai-saas");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(["xiaohongshu", "wechat", "x", "linkedin", "reddit"]);
  const [atomizedKit, setAtomizedKit] = useState<AtomizedKit | null>(null);
  const [atomizerError, setAtomizerError] = useState<string | null>(null);
  const [isAtomizing, setIsAtomizing] = useState(false);

  function togglePlatform(platformId: PlatformId) {
    setSelectedPlatforms((current) => {
      if (current.includes(platformId)) {
        return current.length > 1 ? current.filter((item) => item !== platformId) : current;
      }
      return [...current, platformId];
    });
  }

  async function runAtomizer() {
    setIsAtomizing(true);
    setAtomizerError(null);
    try {
      const response = await fetch("/api/atomize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText,
          goal,
          persona,
          platforms: selectedPlatforms,
          language: locale
        })
      });
      const data = (await response.json()) as { kit?: AtomizedKit; error?: string };
      if (!response.ok || !data.kit) {
        throw new Error(data.error ?? "Failed to atomize content.");
      }
      setAtomizedKit(data.kit);
    } catch (error) {
      setAtomizerError(error instanceof Error ? error.message : "Failed to atomize content.");
    } finally {
      setIsAtomizing(false);
    }
  }

  return (
    <div className="grid gap-6 pb-10">
      <section className="panel p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-fg-muted">Growth packages</p>
            <h1 className="mt-2 text-3xl font-semibold text-fg">
              {locale === "en" ? "Growth Packages" : "增长资产包"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-muted">
              {locale === "en"
                ? "One product asset maps to a set of platform-native content. Manage review status, owners, platform coverage, and delivery exports here."
                : "一个产品资产对应一组平台原生内容。这里负责审核状态、负责人、平台覆盖和交付导出。"}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost">
              {locale === "en" ? "Filter" : "筛选"} <Filter className="h-4 w-4" />
            </button>
            <Link href="/workbench" className="btn-primary">
              {locale === "en" ? "Generate Kit" : "生成资产包"} <FileStack className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.82fr)_minmax(520px,1.18fr)]">
          <div>
            <span className="tag tag-brand">Content Atomizer</span>
            <h2 className="mt-3 text-2xl font-semibold text-fg">
              {locale === "en" ? "Turn one source into ten assets" : "一篇内容拆成十个资产"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-fg-muted">
              {locale === "en"
                ? "Paste one product idea, essay, launch note, or customer insight. Finfold splits it into reusable posts, FAQ, scripts, email, and founder notes."
                : "粘贴一个产品卖点、文章、发布说明或客户洞察，系统会拆成短帖、长文、FAQ、脚本、邮件和创始人笔记。"}
            </p>

            <div className="mt-5 grid gap-3">
              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-fg">
                {locale === "en" ? "Source content" : "源内容"}
                <textarea
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  rows={5}
                  className="focus-ring rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm font-medium normal-case leading-6 text-fg"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-fg">
                  {locale === "en" ? "Goal" : "增长目标"}
                  <select value={goal} onChange={(event) => setGoal(event.target.value as GoalId)} className="focus-ring rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm normal-case text-fg">
                    {growthGoals.map((item) => (
                      <option key={item.id} value={item.id}>{locale === "en" ? item.labelEn : item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-fg">
                  {locale === "en" ? "Audience" : "目标人群"}
                  <select value={persona} onChange={(event) => setPersona(event.target.value as PersonaId)} className="focus-ring rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm normal-case text-fg">
                    {personas.map((item) => (
                      <option key={item.id} value={item.id}>{locale === "en" ? item.labelEn : item.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-fg">{locale === "en" ? "Platforms" : "平台组合"}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {platforms.slice(0, 11).map((platform) => {
                    const selected = selectedPlatforms.includes(platform.id);
                    return (
                      <button
                        key={platform.id}
                        type="button"
                        onClick={() => togglePlatform(platform.id)}
                        className={`focus-ring inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                          selected ? "border-brand bg-brand/10 text-brand" : "border-hairline bg-surface-2 text-fg-muted hover:text-fg"
                        }`}
                      >
                        <platform.icon className="h-3.5 w-3.5" />
                        {platform.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {atomizerError ? <p className="rounded-lg border border-risk/30 bg-risk/10 p-3 text-xs font-semibold text-risk">{atomizerError}</p> : null}

              <button
                type="button"
                onClick={() => void runAtomizer()}
                disabled={isAtomizing || sourceText.trim().length < 50}
                className="btn-primary w-fit disabled:opacity-50"
              >
                {isAtomizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {locale === "en" ? "Atomize content" : "拆解内容"}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-hairline bg-surface-2 p-4">
            {atomizedKit ? (
              <div>
                <div className="border-b border-hairline pb-3">
                  <h3 className="text-lg font-semibold text-fg">{locale === "en" ? "Atomized assets" : "拆解资产"}</h3>
                  <p className="mt-1 text-xs leading-5 text-fg-muted">{atomizedKit.strategy}</p>
                </div>
                <div className="mt-3 max-h-[560px] overflow-y-auto pr-1">
                  <div className="grid gap-3 lg:grid-cols-2">
                    {atomizedKit.assets.map((asset) => {
                      const platform = platforms.find((item) => item.id === asset.platform);
                      return (
                        <article key={asset.id} className="rounded-lg border border-hairline bg-surface p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className="tag tag-neutral text-[10px]">{asset.format}</span>
                              <h4 className="mt-2 text-sm font-semibold leading-5 text-fg">{asset.title}</h4>
                            </div>
                            {platform ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[11px] font-bold text-fg">
                                <platform.icon className="h-3 w-3" />
                                {platform.shortLabel}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 whitespace-pre-line text-xs leading-5 text-fg-muted">{asset.body}</p>
                          <p className="mt-2 rounded-md bg-brand/10 p-2 text-xs font-semibold text-brand">{asset.cta}</p>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <FileStack className="h-8 w-8 text-brand" />
                <p className="mt-3 text-sm font-semibold text-fg">
                  {locale === "en" ? "Your ten assets will appear here" : "拆解出的十个资产会显示在这里"}
                </p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-fg-muted">
                  {locale === "en" ? "Use it to turn one strong idea into a launch package." : "适合把一个强观点变成可发布的增长资产包。"}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="grid grid-cols-[1fr_160px_180px_180px] gap-4 border-b border-hairline bg-surface-2 px-5 py-3 text-xs font-semibold uppercase text-fg-muted max-lg:hidden">
          <span>{locale === "en" ? "Package" : "资产包"}</span>
          <span>{locale === "en" ? "Status" : "状态"}</span>
          <span>{locale === "en" ? "Owner" : "负责人"}</span>
          <span>{locale === "en" ? "Actions" : "动作"}</span>
        </div>
        {packages.map((item) => (
          <article key={item.id} className="grid gap-4 border-b border-hairline px-5 py-4 last:border-b-0 lg:grid-cols-[1fr_160px_180px_180px] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-fg">{item.product}</h2>
                <span className="text-xs text-fg-muted">{item.id}</span>
              </div>
              <p className="mt-2 text-sm leading-5 text-fg-muted">
                {locale === "en" ? item.impactEn : item.impact}
              </p>
              <p className="mt-2 text-xs text-fg-muted">{item.platforms.join(" / ")} · {item.updatedAt}</p>
            </div>
            <span className={`w-fit ${statusToneClass[item.status]}`}>
              {packageStatusLabels[item.status][locale]}
            </span>
            <span className="text-sm font-medium text-fg">{item.owner}</span>
            <div className="flex gap-2">
              <button className="inline-flex items-center gap-1 rounded-md border border-hairline px-3 py-2 text-sm font-semibold text-fg">
                {locale === "en" ? "Export" : "导出"} <Download className="h-4 w-4" />
              </button>
              <button className="inline-flex items-center gap-1 rounded-md bg-fg px-3 py-2 text-sm font-semibold text-bg">
                {locale === "en" ? "Submit" : "送审"} <Send className="h-4 w-4" />
              </button>
            </div>
          </article>
        ))}
      </section>

      <Link href="/calendar" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-fg-muted">
        {locale === "en" ? "View schedule" : "查看排期承接"} <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
