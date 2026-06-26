"use client";

import { Globe2 } from "lucide-react";
import { dashboardCopy, type Locale } from "@/lib/i18n";
import { platforms, type PlatformId } from "@/lib/platforms";
import { PlatformBrandIcon } from "./PlatformBrandIcon";

type PlatformSelectorProps = {
  value: PlatformId[];
  onChange: (value: PlatformId[]) => void;
  locale: Locale;
  disabled?: boolean;
};

const englishPlatformLabels: Record<PlatformId, string> = {
  wechat: "WeChat Official Account",
  xiaohongshu: "Xiaohongshu / RED",
  moments: "WeChat Moments",
  x: "X / Twitter",
  linkedin: "LinkedIn",
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
    moments: "创始人人设、项目进展、熟人信任，适合轻量转化。",
    x: "强观点、创始人叙事、发布动能，适合公开迭代和传播。",
    linkedin: "B2B 可信度、专业故事、精准分发，适合获客和预约。",
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
    moments: "Founder credibility, project progress, warm trust, and lightweight conversion.",
    x: "Sharp opinions, founder narrative, launch momentum, and public iteration.",
    linkedin: "B2B credibility, professional story, precise distribution, and booked calls.",
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

export function PlatformSelector({ value, onChange, locale, disabled = false }: PlatformSelectorProps) {
  const copy = dashboardCopy[locale];

  function togglePlatform(platformId: PlatformId) {
    if (value.includes(platformId)) {
      onChange(value.filter((item) => item !== platformId));
      return;
    }

    onChange([...value, platformId]);
  }

  return (
    <section className="panel rounded-md p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-fg" />
          <h2 className="text-sm font-black">{copy.platformsTitle}</h2>
        </div>
        <span className="text-xs text-fg-muted">{value.length} {copy.selected}</span>
      </div>
      <div className="grid gap-2">
        {platforms.map((platform) => {
          const selected = value.includes(platform.id);
          const title = locale === "zh" ? platform.label : englishPlatformLabels[platform.id];
          const description = localizedDescriptions[locale][platform.id];

          return (
            <button
              type="button"
              key={platform.id}
              onClick={() => togglePlatform(platform.id)}
              disabled={disabled}
              className={joinClasses(
                "focus-ring group rounded-sm border p-3 text-left transition duration-200 disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-brand bg-brand text-white shadow-glow-brand"
                  : "border-hairline bg-surface hover:-translate-y-0.5 hover:border-brand/50 hover:bg-surface-2"
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
                        selected ? "border-white/50 bg-white/10 text-white/70" : "border-hairline bg-surface text-fg-muted"
                      )}
                    >
                      {platform.region}
                    </span>
                  </div>
                  <p className={joinClasses("mt-1.5 text-xs leading-5", selected ? "text-white/70" : "text-fg-muted")}>
                    {description}
                  </p>
                </div>
              </div>
              <div
                className={joinClasses(
                  "mt-3 flex items-center justify-between border-t pt-2 text-[10px] uppercase tracking-[0.14em]",
                  selected ? "border-white/10 text-white/50" : "border-hairline text-fg-muted/70"
                )}
              >
                <span>{locale === "zh" ? "平台语感" : "Platform voice"}</span>
                <span>{platform.region}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
