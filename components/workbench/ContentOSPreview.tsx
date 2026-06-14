"use client";

import { ArrowRight, BarChart3, Database, Layers3, Radar, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";

const copy = {
  zh: {
    title: "内容增长飞轮",
    subtitle: "一次输入，持续学习。每个平台不是一段文案，而是一个可复用的增长资产。",
    stages: ["输入想法", "策略加工", "平台适配", "效果学习"],
    channels: ["小红书收藏", "LinkedIn 预约", "Reddit 反馈", "Product Hunt 首发"],
    memory: "品牌语气记忆",
    experiment: "内容实验分数",
    conversion: "收入线索",
    signal: "学习回路已开启"
  },
  en: {
    title: "Content growth loop",
    subtitle: "One input, continuous learning. Every platform output becomes a reusable growth asset.",
    stages: ["Idea input", "Strategy layer", "Platform fit", "Learning loop"],
    channels: ["RED saves", "LinkedIn calls", "Reddit feedback", "PH launch"],
    memory: "Brand voice memory",
    experiment: "Experiment score",
    conversion: "Revenue signal",
    signal: "Learning loop active"
  }
} as const;

const stageIcons = [Layers3, Workflow, Radar, Database] as const;

export function ContentOSPreview({ locale }: { locale: Locale }) {
  const [activeStage, setActiveStage] = useState(0);
  const c = copy[locale];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveStage((current) => (current + 1) % c.stages.length);
    }, 1400);
    return () => window.clearInterval(timer);
  }, [c.stages.length]);

  return (
    <aside className="panel rk-enter relative isolate overflow-hidden rounded-md p-4 md:p-5">
      <div className="absolute right-3 top-3 rounded-sm bg-brand px-2 py-1 text-[10px] font-black uppercase text-white shadow-glow-brand">
        {c.signal}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-16 h-12 rk-scan bg-[linear-gradient(90deg,transparent,rgb(var(--brand)/0.45),transparent)] opacity-70" />

      <div className="max-w-[80%]">
        <p className="text-xs font-black uppercase text-fg-muted">{locale === "zh" ? "系统预览" : "System preview"}</p>
        <h2 className="mt-1 text-2xl font-black leading-none">{c.title}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-fg-muted">{c.subtitle}</p>
      </div>

      <div className="mt-5 grid gap-3">
        {c.stages.map((stage, index) => {
          const Icon = stageIcons[index];
          const active = index === activeStage;
          return (
            <div key={stage} className="grid grid-cols-[42px_1fr_24px] items-center gap-3">
              <div
                className={[
                  "flex h-10 w-10 items-center justify-center rounded-sm border border-hairline transition duration-300",
                  active ? "border-brand bg-brand text-white shadow-glow-brand" : "bg-surface"
                ].join(" ")}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="h-3 rounded-sm border border-hairline bg-surface-2">
                <div
                  className={[
                    "h-full bg-brand transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    active ? "w-full" : index < activeStage ? "w-[72%]" : "w-[24%]"
                  ].join(" ")}
                />
              </div>
              <ArrowRight className={[
                "h-4 w-4 transition",
                active ? "translate-x-1 text-fg" : "text-fg-muted"
              ].join(" ")} />
              <p className={[
                "col-start-2 text-xs font-black uppercase",
                active ? "text-fg" : "text-fg-muted"
              ].join(" ")}>{stage}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <MetricPill label={c.memory} value="94%" active={activeStage === 1} />
        <MetricPill label={c.experiment} value="A/B 12" active={activeStage === 3} />
        <MetricPill label={c.conversion} value="+18 leads" active={activeStage === 2} />
        <MetricPill label="Channel fit" value="11/11" active={activeStage === 2} />
      </div>

      <div className="mt-4 overflow-hidden rounded-sm py-2 panel-command">
        <div className="flex w-max gap-2 px-2 rk-marquee">
          {[...c.channels, ...c.channels].map((channel, index) => (
            <span key={channel + index} className="rounded-sm border border-white/20 bg-white/10 px-3 py-1 text-xs font-black">
              {channel}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}

function MetricPill({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className={[
      "rounded-sm border border-hairline p-3 transition duration-300",
      active ? "border-brand bg-brand text-white shadow-glow-brand" : "bg-surface"
    ].join(" ")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase text-fg-muted">{label}</p>
        <BarChart3 className={active ? "h-4 w-4 rk-pop" : "h-4 w-4"} />
      </div>
      <p className="mt-2 text-xl font-black leading-none">{value}</p>
    </div>
  );
}
