"use client";

import React from "react";
import { Check, ChevronDown, Globe2, Plus } from "@/components/ui/icons";
import { useState } from "react";
import { dashboardCopy, type Locale } from "@/lib/i18n";
import { MAX_PLATFORMS_PER_GENERATION, platforms, type PlatformId } from "@/lib/platforms";
import { PlatformBrandIcon } from "./PlatformBrandIcon";

type PlatformSelectorProps = {
  value: PlatformId[];
  onChange: (value: PlatformId[]) => void;
  locale: Locale;
  disabled?: boolean;
  maxSelection?: number;
};

const englishPlatformLabels: Record<PlatformId, string> = {
  wechat: "WeChat Official Account",
  xiaohongshu: "Xiaohongshu / RED",
  zhihu: "Zhihu",
  moments: "WeChat Moments",
  x: "X / Twitter",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  reddit: "Reddit",
  "product-hunt": "Product Hunt",
  threads: "Threads",
  "hacker-news": "Hacker News",
  "indie-hackers": "Indie Hackers",
  "medium-substack": "Newsletter / Substack"
};

const localizedDescriptions: Record<Locale, Record<PlatformId, string>> = {
  zh: {
    wechat: "长文叙事、信任建设、深度价值解释，适合沉淀为私域资产。",
    xiaohongshu: "痛点发现、情绪钩子、收藏驱动，适合获得关注和私信。",
    zhihu: "专业解释、经验复盘、搜索沉淀，适合建立可信观点。",
    moments: "创始人人设、项目进展、熟人信任，适合轻量转化。",
    x: "强观点、创始人叙事、发布动能，适合公开迭代和传播。",
    linkedin: "B2B 可信度、专业故事、精准分发，适合获客和预约。",
    instagram: "视觉叙事、品牌建设、Reels/Explore 拉新、强种草转化。",
    facebook: "社群运营、本地受众、Groups 私域、原生视频与直播拉新。",
    reddit: "社区讨论、用户调研、问题验证，适合真实反馈。",
    "product-hunt": "新产品首发、early adopter 获取、初期品牌曝光。",
    threads: "轻量公开更新、创作者受众、平易近人的创始人表达。",
    "hacker-news": "开发者注意力、技术可信度、Show HN 首发、克制反馈。",
    "indie-hackers": "公开建设、收入学习、创始人社区、早期用户。",
    "medium-substack": "常青文章、SEO 流量、Newsletter 增长、思想领导力。"
  },
  en: {
    wechat: "Long-form trust building, deeper value explanation, and durable private-domain assets.",
    xiaohongshu: "Pain-point hooks, emotional proof, save-worthy notes, and inbound curiosity.",
    zhihu: "Credible explanations, experience-led answers, search discovery, and durable expertise.",
    moments: "Founder credibility, project progress, warm trust, and lightweight conversion.",
    x: "Sharp opinions, founder narrative, launch momentum, and public iteration.",
    linkedin: "B2B credibility, professional story, precise distribution, and booked calls.",
    instagram: "Visual storytelling, brand building, Reels/Explore discovery, and high-intent consideration.",
    facebook: "Community building, local reach, Groups, native video, and live engagement.",
    reddit: "Community discussion, customer research, problem validation, and honest feedback.",
    "product-hunt": "Launch positioning, early adopter acquisition, and first-wave brand exposure.",
    threads: "Lightweight updates, creator audience fit, and approachable founder voice.",
    "hacker-news": "Developer attention, technical credibility, Show HN launches, and restrained feedback.",
    "indie-hackers": "Build-in-public learning, revenue notes, founder community, and early users.",
    "medium-substack": "Evergreen essays, SEO reach, newsletter growth, and thought leadership."
  }
};

function joinClasses(...classes: Array<string | false>) {
  return classes.filter(Boolean).join(" ");
}

function localizedRegionLabel(region: "China" | "Global", locale: Locale): string {
  if (locale === "en") return region;
  return region === "China" ? "国内" : "海外";
}

export function PlatformSelector({
  value,
  onChange,
  locale,
  disabled = false,
  maxSelection = MAX_PLATFORMS_PER_GENERATION
}: PlatformSelectorProps) {
  const copy = dashboardCopy[locale];
  const [mobileFilter, setMobileFilter] = useState<"recommended" | "china" | "global">("recommended");
  const [showAllMobile, setShowAllMobile] = useState(false);

  function togglePlatform(platformId: PlatformId) {
    if (value.includes(platformId)) {
      onChange(value.filter((item) => item !== platformId));
      return;
    }

    if (value.length >= maxSelection) return;
    onChange([...value, platformId]);
  }

  // Suggested picks lead each region group; the region split below decides
  // which group comes first. English users see Global platforms before China
  // platforms; Chinese users see the reverse — matching the agent question
  // card ordering in lib/agent/ask-user.ts.
  const recommendedIds: PlatformId[] = locale === "en"
    ? ["x", "linkedin", "instagram", "reddit", "xiaohongshu", "zhihu"]
    : ["xiaohongshu", "zhihu", "wechat", "moments", "linkedin", "x"];
  const restOrder = [
    ...recommendedIds,
    ...platforms.map((platform) => platform.id)
  ]
    .filter((id, index, list) => list.indexOf(id) === index)
    .filter((id) => !value.includes(id));
  const preferredRegion = locale === "en" ? "Global" : "China";
  const regionOf = (id: PlatformId) =>
    platforms.find((platform) => platform.id === id)?.region;
  const recommendedOrder: PlatformId[] = [
    ...value,
    ...restOrder.filter((id) => regionOf(id) === preferredRegion),
    ...restOrder.filter((id) => regionOf(id) !== preferredRegion)
  ];
  const orderedPlatforms = recommendedOrder
    .map((id) => platforms.find((platform) => platform.id === id))
    .filter((platform): platform is (typeof platforms)[number] => Boolean(platform));
  const mobilePlatforms = orderedPlatforms.filter((platform) => {
    if (mobileFilter === "china") return platform.region === "China";
    if (mobileFilter === "global") return platform.region === "Global";
    return true;
  });
  const visibleMobilePlatforms = showAllMobile ? mobilePlatforms : mobilePlatforms.slice(0, 4);

  return (
    <>
      <section className="grid gap-3 lg:hidden">
        <div
          id="platform-selection-limit-mobile"
          aria-live="polite"
          className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface px-3 py-2 text-[11px]"
        >
          <span className="font-semibold text-fg">
            {locale === "en" ? `${value.length} / ${maxSelection} selected` : `已选 ${value.length} / ${maxSelection}`}
          </span>
          <span className="text-right text-fg-muted">
            {locale === "en" ? `Up to ${maxSelection} per generation` : `单次最多 ${maxSelection} 个，生成更快更稳`}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2" aria-label={locale === "en" ? "Platform filters" : "平台筛选"}>
          {([
            ["recommended", locale === "en" ? "Suggested" : "推荐"],
            ["china", locale === "en" ? "China" : "中国"],
            ["global", locale === "en" ? "Global" : "全球"]
          ] as const).map(([id, label]) => {
            const active = mobileFilter === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setMobileFilter(id);
                  setShowAllMobile(false);
                }}
                className={joinClasses(
                  "focus-ring rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  active
                    ? "border-action bg-action text-on-action shadow-glow-action"
                    : "border-hairline bg-surface-2 text-fg-muted hover:text-fg"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-2">
          {visibleMobilePlatforms.map((platform) => {
            const selected = value.includes(platform.id);
            const selectionBlocked = !selected && value.length >= maxSelection;
            const title = locale === "zh" ? platform.label : englishPlatformLabels[platform.id];
            const description = localizedDescriptions[locale][platform.id].split(locale === "zh" ? "，" : ",")[0];

            return (
              <button
                type="button"
                key={platform.id}
                data-testid={`platform-${platform.id}`}
                data-platform={platform.id}
                onClick={() => togglePlatform(platform.id)}
                disabled={disabled || selectionBlocked}
                aria-pressed={selected}
                aria-describedby="platform-selection-limit-mobile"
                title={selectionBlocked ? (locale === "en" ? `Choose up to ${maxSelection} platforms per generation.` : `单次最多选择 ${maxSelection} 个平台。`) : undefined}
                className={joinClasses(
                  "focus-ring flex min-w-0 items-center gap-2.5 rounded-lg border p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                  selected
                    ? "border-action/55 bg-action/[0.08] shadow-[inset_3px_0_0_rgb(var(--action))]"
                    : "border-hairline bg-surface hover:border-action/40 hover:bg-action/[0.035]"
                )}
              >
                <PlatformBrandIcon platform={platform.id} className="h-8 w-8 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">{title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-fg-muted">
                    {description} · {localizedRegionLabel(platform.region, locale)}
                  </span>
                </span>
                <span
                  className={joinClasses(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                    selected
                      ? "border-action bg-action text-on-action"
                      : "border-hairline bg-surface-2 text-fg-muted"
                  )}
                >
                  {selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}
        </div>

        {mobilePlatforms.length > 4 ? (
          <button
            type="button"
            onClick={() => setShowAllMobile((current) => !current)}
            className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          >
            {showAllMobile
              ? (locale === "en" ? "Show fewer platforms" : "收起平台")
              : (locale === "en" ? `View all ${mobilePlatforms.length} platforms` : `查看全部 ${mobilePlatforms.length} 个平台`)}
            <ChevronDown className={joinClasses("h-3.5 w-3.5 transition", showAllMobile && "rotate-180")} />
          </button>
        ) : null}
      </section>

      <section className="panel hidden rounded-md p-4 lg:block">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-fg" />
          <h2 className="text-sm font-black">{copy.platformsTitle}</h2>
        </div>
        <span className="text-xs font-semibold text-fg-muted">{value.length} / {maxSelection} {copy.selected}</span>
      </div>
      <p id="platform-selection-limit-desktop" aria-live="polite" className="mb-3 rounded-sm border border-hairline bg-surface-2 px-3 py-2 text-[11px] leading-4 text-fg-muted">
        {locale === "en"
          ? `Choose up to ${maxSelection} platforms per generation to keep results fast and reliable.`
          : `单次最多选择 ${maxSelection} 个平台，控制等待时间，也能减少部分平台生成失败。`}
      </p>
      <div className="grid gap-2">
        {orderedPlatforms.map((platform) => {
          const selected = value.includes(platform.id);
          const selectionBlocked = !selected && value.length >= maxSelection;
          const title = locale === "zh" ? platform.label : englishPlatformLabels[platform.id];
          const description = localizedDescriptions[locale][platform.id];

          return (
            <button
              type="button"
              key={platform.id}
              data-testid={`platform-${platform.id}`}
              data-platform={platform.id}
              onClick={() => togglePlatform(platform.id)}
              disabled={disabled || selectionBlocked}
              aria-pressed={selected}
              aria-describedby="platform-selection-limit-desktop"
              title={selectionBlocked ? (locale === "en" ? `Choose up to ${maxSelection} platforms per generation.` : `单次最多选择 ${maxSelection} 个平台。`) : undefined}
              className={joinClasses(
                "focus-ring group rounded-sm border p-3 text-left transition duration-200 disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-action/60 bg-action/[0.075] text-fg shadow-glow-action"
                  : "border-hairline bg-surface hover:-translate-y-0.5 hover:border-action/45 hover:bg-action/[0.035]"
              )}
            >
              <div className="flex items-start gap-3">
                <PlatformBrandIcon platform={platform.id} selected={selected} className="h-10 w-10 shrink-0 text-[12px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 text-sm font-semibold leading-5">{title}</span>
                    <span
                      className={joinClasses(
                        "ml-auto shrink-0 rounded-sm border border-current px-2 py-0.5 text-[10px] font-black",
                        selected ? "border-action/35 bg-action/[0.08] text-action-strong dark:text-action" : "border-hairline bg-surface text-fg-muted"
                      )}
                    >
                      {localizedRegionLabel(platform.region, locale)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-fg-muted">
                    {description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      </section>
    </>
  );
}
