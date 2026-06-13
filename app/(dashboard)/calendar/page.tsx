"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, Layers3, X, Sparkles, CheckCircle2, Edit2, Loader2 } from "lucide-react";
import { useState } from "react";
import { weeklySchedule as initialWeeklySchedule } from "@/lib/ops-data";
import { useLocale } from "@/hooks/useLocale";
import type { CampaignPlan } from "@/lib/campaign";
import { growthGoals, type GoalId } from "@/lib/goals";
import { personas, type PersonaId } from "@/lib/personas";
import { platforms, type PlatformId } from "@/lib/platforms";

type ScheduleItem = {
  day: string;
  count: number;
  focus: string;
  focusEn: string;
  platforms: readonly string[];
};

export default function CalendarPage() {
  const locale = useLocale();
  const [schedule, setSchedule] = useState<ScheduleItem[]>([...initialWeeklySchedule]);
  const [selectedItem, setSelectedItem] = useState<ScheduleItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editFocus, setEditFocus] = useState("");
  const [editCount, setEditCount] = useState(1);
  const [campaignIdea, setCampaignIdea] = useState("Finfold / Finfold帮助中国独立开发者和 AI SaaS 小团队把一个产品卖点拆成多平台原生内容，用于出海获客和产品发布。");
  const [campaignGoal, setCampaignGoal] = useState<GoalId>("product-launch");
  const [campaignPersona, setCampaignPersona] = useState<PersonaId>("ai-saas");
  const [campaignDuration, setCampaignDuration] = useState<7 | 14 | 30>(7);
  const [campaignPlatforms, setCampaignPlatforms] = useState<PlatformId[]>(["wechat", "xiaohongshu", "x", "linkedin", "reddit", "product-hunt"]);
  const [campaign, setCampaign] = useState<CampaignPlan | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [isGeneratingCampaign, setIsGeneratingCampaign] = useState(false);

  const t = locale === "en" ? {
    title: "This Week's Schedule",
    subtitle: "Plan content asset releases across channels, predict schedule gaps, and avoid topic conflicts.",
    viewPackages: "View Growth Packages",
    campaignEyebrow: "Campaign Mode",
    campaignTitle: "Generate a campaign plan",
    campaignSubtitle: "Turn one positioning idea into a 7/14/30-day platform-native publishing plan.",
    campaignIdea: "Campaign idea",
    campaignGoal: "Goal",
    campaignPersona: "Audience",
    campaignDuration: "Duration",
    campaignPlatforms: "Platforms",
    generateCampaign: "Generate campaign",
    campaignStrategy: "Strategy",
    campaignDay: "Day",
    campaignPhase: "Phase",
    campaignDeliverable: "Deliverable",
    campaignCta: "CTA",
    plannedPosts: "Planned posts",
    scheduleDetail: "Schedule details",
    channels: "Channels",
    plannedCount: "Planned count",
    scheduleTopic: "Schedule topic",
    editSchedule: "Edit",
    close: "Close",
    back: "Back",
    save: "Save changes",
    plannedCountLabel: "Planned count",
    topicLabel: "Topic",
    systemMonitoring: "System monitoring live",
    diagnostics: [
      { title: "Schedule gap detected", detail: "Bilibili and Instagram each have only 1 scheduled asset this week. Consider adding long-form video and visual carousels.", type: "warning" },
      { title: "Topic conflict avoidance", detail: "Wednesday short videos are heavily conversion-focused. Adding a founder long-form post (Moments / X) would balance brand trust with conversion.", type: "info" },
      { title: "Review bottleneck risk", detail: "Pending Xiaohongshu scripts may block the Thursday peak window. Follow up on review status immediately.", type: "danger" }
    ]
  } : {
    title: "本周发布排期",
    subtitle: "按多渠道发布节奏科学安排内容资产，智能预测排期发布空窗，规避主题重复及发布延迟阻塞。",
    viewPackages: "查看增长资产包",
    campaignEyebrow: "Campaign Mode",
    campaignTitle: "生成内容战役计划",
    campaignSubtitle: "把一个定位或卖点拆成 7/14/30 天平台原生发布节奏。",
    campaignIdea: "战役主题",
    campaignGoal: "增长目标",
    campaignPersona: "目标人群",
    campaignDuration: "战役周期",
    campaignPlatforms: "平台组合",
    generateCampaign: "生成战役",
    campaignStrategy: "战役策略",
    campaignDay: "第几天",
    campaignPhase: "阶段",
    campaignDeliverable: "交付物",
    campaignCta: "CTA",
    plannedPosts: "计划发布条数",
    scheduleDetail: "详细排期",
    channels: "发布渠道",
    plannedCount: "日历发布计划数",
    scheduleTopic: "排期发布主题",
    editSchedule: "编辑排期",
    close: "关闭",
    back: "返回详情",
    save: "保存修改",
    plannedCountLabel: "计划发布数",
    topicLabel: "排期发布主题",
    systemMonitoring: "系统已实时监控",
    diagnostics: [
      { title: "发现发布空窗", detail: "B站和 Instagram 本周仅有 1 个资产处于排期状态，建议补齐深度视频及视觉轮播图笔记。", type: "warning" },
      { title: "规避主题冲突", detail: "周三短视频多集中在促销转化，建议补充一条独立创始人长文（Moments / X）平衡内容体验与品牌信任度。", type: "info" },
      { title: "规避审核阻塞", detail: "小红书待审核脚本可能会影响周四的黄金窗口期发布，请及时跟进审核状态。", type: "danger" }
    ]
  };

  function openDetails(item: ScheduleItem) {
    setSelectedItem(item);
    setEditFocus(locale === "en" ? item.focusEn : item.focus);
    setEditCount(item.count);
    setIsEditing(false);
  }

  function saveChanges(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItem) return;
    setSchedule((current) =>
      current.map((item) =>
        item.day === selectedItem.day
          ? { ...item, focus: editFocus, focusEn: editFocus }
          : item
      )
    );
    setSelectedItem(null);
  }

  function toggleCampaignPlatform(platformId: PlatformId) {
    setCampaignPlatforms((current) => {
      if (current.includes(platformId)) {
        return current.length > 1 ? current.filter((item) => item !== platformId) : current;
      }
      return [...current, platformId];
    });
  }

  async function generateCampaign() {
    setCampaignError(null);
    setIsGeneratingCampaign(true);
    try {
      const response = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ideaText: campaignIdea,
          goal: campaignGoal,
          persona: campaignPersona,
          platforms: campaignPlatforms,
          durationDays: campaignDuration,
          language: locale
        })
      });
      const data = (await response.json()) as { campaign?: CampaignPlan; error?: string };
      if (!response.ok || !data.campaign) {
        throw new Error(data.error ?? "Failed to generate campaign.");
      }
      setCampaign(data.campaign);
    } catch (error) {
      setCampaignError(error instanceof Error ? error.message : "Failed to generate campaign.");
    } finally {
      setIsGeneratingCampaign(false);
    }
  }

  return (
    <div className="grid gap-6 pb-10 max-w-[1400px] mx-auto">
      <section className="panel p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Publishing Calendar</p>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold text-fg leading-tight">{t.title}</h1>
            <p className="mt-2.5 max-w-2xl text-xs sm:text-sm leading-6 text-fg-muted">{t.subtitle}</p>
          </div>
          <Link href="/packages" className="btn-primary">
            {t.viewPackages} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="panel p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(320px,0.9fr)_minmax(420px,1.1fr)]">
          <div>
            <span className="tag tag-brand">{t.campaignEyebrow}</span>
            <h2 className="mt-3 text-2xl font-bold text-fg">{t.campaignTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-fg-muted">{t.campaignSubtitle}</p>

            <div className="mt-5 grid gap-3">
              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-fg">
                {t.campaignIdea}
                <textarea
                  value={campaignIdea}
                  onChange={(event) => setCampaignIdea(event.target.value)}
                  rows={4}
                  className="focus-ring rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm font-medium normal-case leading-6 text-fg"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-fg">
                  {t.campaignGoal}
                  <select value={campaignGoal} onChange={(event) => setCampaignGoal(event.target.value as GoalId)} className="focus-ring rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm normal-case text-fg">
                    {growthGoals.map((goal) => (
                      <option key={goal.id} value={goal.id}>{locale === "en" ? goal.labelEn : goal.label}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-fg">
                  {t.campaignPersona}
                  <select value={campaignPersona} onChange={(event) => setCampaignPersona(event.target.value as PersonaId)} className="focus-ring rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm normal-case text-fg">
                    {personas.map((persona) => (
                      <option key={persona.id} value={persona.id}>{locale === "en" ? persona.labelEn : persona.label}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-fg">
                  {t.campaignDuration}
                  <select value={campaignDuration} onChange={(event) => setCampaignDuration(Number(event.target.value) as 7 | 14 | 30)} className="focus-ring rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm normal-case text-fg">
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                  </select>
                </label>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-fg">{t.campaignPlatforms}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {platforms.slice(0, 11).map((platform) => {
                    const selected = campaignPlatforms.includes(platform.id);
                    return (
                      <button
                        key={platform.id}
                        type="button"
                        onClick={() => toggleCampaignPlatform(platform.id)}
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

              {campaignError ? <p className="rounded-lg border border-risk/30 bg-risk/10 p-3 text-xs font-semibold text-risk">{campaignError}</p> : null}

              <button
                type="button"
                onClick={() => void generateCampaign()}
                disabled={isGeneratingCampaign || campaignIdea.trim().length < 20}
                className="btn-primary w-fit disabled:opacity-50"
              >
                {isGeneratingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {t.generateCampaign}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-hairline bg-surface-2 p-4">
            {campaign ? (
              <div>
                <div className="flex flex-col gap-2 border-b border-hairline pb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-fg">{campaign.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-fg-muted">{campaign.strategy}</p>
                  </div>
                  <span className="tag tag-accent w-fit">{campaign.durationDays} days</span>
                </div>
                <div className="mt-3 max-h-[520px] overflow-y-auto pr-1">
                  <div className="grid gap-2">
                    {campaign.days.map((day) => {
                      const platform = platforms.find((item) => item.id === day.primaryPlatform);
                      return (
                        <article key={day.day} className="rounded-lg border border-hairline bg-surface p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{t.campaignDay} {day.day}</p>
                              <h4 className="mt-1 text-sm font-bold text-fg">{day.theme}</h4>
                            </div>
                            {platform ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[11px] font-bold text-fg">
                                <platform.icon className="h-3 w-3" />
                                {platform.shortLabel}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-fg-muted">{day.angle}</p>
                          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                            <div className="rounded-md bg-surface-2 p-2">
                              <span className="font-bold text-fg-muted">{t.campaignPhase}</span>
                              <p className="mt-1 font-semibold text-fg">{day.phase}</p>
                            </div>
                            <div className="rounded-md bg-surface-2 p-2">
                              <span className="font-bold text-fg-muted">{t.campaignDeliverable}</span>
                              <p className="mt-1 font-semibold text-fg">{day.deliverable}</p>
                            </div>
                          </div>
                          <p className="mt-2 rounded-md bg-brand/10 p-2 text-xs font-semibold text-brand">{t.campaignCta}: {day.cta}</p>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <CalendarDays className="h-8 w-8 text-brand" />
                <p className="mt-3 text-sm font-bold text-fg">{t.campaignTitle}</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-fg-muted">{t.campaignSubtitle}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {schedule.map((day) => (
          <article
            key={day.day}
            onClick={() => openDetails(day)}
            className="panel panel-hover p-5 cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-fg">{day.day}</span>
                <CalendarDays className="h-4.5 w-4.5 text-fg-muted" />
              </div>
              <p className="mt-5 text-4xl font-extrabold text-fg tabular">{day.count}</p>
              <p className="mt-1.5 text-xs font-medium text-fg-muted uppercase tracking-wide">{t.plannedPosts}</p>
            </div>
            <div className="mt-5 panel-inset p-3 transition-colors">
              <p className="text-xs font-bold text-fg line-clamp-2">{locale === "en" ? day.focusEn : day.focus}</p>
              <p className="mt-1 text-[10px] text-fg-muted font-medium line-clamp-1">{day.platforms.join(" / ")}</p>
            </div>
          </article>
        ))}
      </section>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md panel p-5 rk-enter">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand" />
                <h3 className="font-semibold text-fg text-base">{selectedItem.day} — {t.scheduleDetail}</h3>
              </div>
              <button type="button" onClick={() => setSelectedItem(null)} className="rounded-lg p-1 text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!isEditing ? (
              <div className="mt-4 space-y-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-fg-muted uppercase tracking-wide">{t.channels}</span>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedItem.platforms.map((p) => (
                      <span key={p} className="rounded bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg">{p}</span>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-fg-muted uppercase tracking-wide">{t.plannedCount}</span>
                  <p className="text-lg font-bold text-fg tabular">{selectedItem.count}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-fg-muted uppercase tracking-wide">{t.scheduleTopic}</span>
                  <p className="text-sm text-fg leading-relaxed panel-inset p-3">
                    {locale === "en" ? selectedItem.focusEn : selectedItem.focus}
                  </p>
                </div>
                <div className="flex gap-2 pt-2 border-t border-hairline">
                  <button type="button" onClick={() => setIsEditing(true)} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-hairline py-2 text-sm font-semibold text-fg hover:bg-surface-2 transition-colors">
                    {t.editSchedule} <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setSelectedItem(null)} className="flex-1 rounded-lg bg-fg py-2 text-sm font-semibold text-bg transition-colors">
                    {t.close}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={saveChanges} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-fg uppercase tracking-wide">{t.plannedCountLabel}</label>
                  <input
                    type="number" min={1} max={10} required value={editCount}
                    onChange={(e) => setEditCount(parseInt(e.target.value) || 1)}
                    className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-fg focus:border-brand focus:bg-surface focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-fg uppercase tracking-wide">{t.topicLabel}</label>
                  <textarea required rows={3} value={editFocus} onChange={(e) => setEditFocus(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-fg focus:border-brand focus:bg-surface focus:outline-none transition-all resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-2 border-t border-hairline">
                  <button type="button" onClick={() => setIsEditing(false)} className="flex-1 rounded-lg border border-hairline py-2 text-sm font-semibold text-fg hover:bg-surface-2 transition-colors">
                    {t.back}
                  </button>
                  <button type="submit" className="flex-1 rounded-lg bg-fg py-2 text-sm font-semibold text-bg transition-colors">
                    {t.save}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        {t.diagnostics.map((item) => (
          <article key={item.title} className="panel p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={`p-1.5 rounded-lg ${item.type === "danger" ? "tag tag-risk" : item.type === "warning" ? "tag tag-warn" : "tag tag-accent"}`}>
                  {item.type === "warning" ? <Clock3 className="h-4 w-4" /> : item.type === "info" ? <Layers3 className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
                </span>
                <h2 className="text-base font-bold text-fg">{item.title}</h2>
              </div>
              <p className="mt-3 text-xs sm:text-sm leading-6 text-fg-muted">{item.detail}</p>
            </div>
            <div className="mt-4 pt-3 border-t border-hairline flex justify-end">
              <span className="text-xs font-semibold text-fg-muted flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-brand" /> {t.systemMonitoring}
              </span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
