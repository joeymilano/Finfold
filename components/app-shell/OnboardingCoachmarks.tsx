"use client";

import { useEffect, useState } from "react";
import { ArrowRight, X } from "@/components/ui/icons";
import { useLocale } from "@/hooks/useLocale";

// 首次访问的 3 步引导：只讲"粘贴 → 选平台 → 生成"三个动作，不引入任何概念。
// 用 localStorage 标记，只出现一次；随时可跳过。挂载在 DashboardShell，覆盖整个工作区。
const STORAGE_KEY = "finfold-onboarding-v1";

type Step = { icon: string; zh: { title: string; body: string }; en: { title: string; body: string } };

const STEPS: Step[] = [
  {
    icon: "📋",
    zh: { title: "粘贴你要发的东西", body: "产品更新、新功能上线、一条用户反馈，或你脑子里的想法——随便贴一段，不用润色。" },
    en: { title: "Paste what you want to post", body: "A product update, a new feature, customer feedback, or just a thought — drop it in raw, no polishing needed." }
  },
  {
    icon: "🌐",
    zh: { title: "选平台", body: "勾选要发到的平台。默认已帮你选好小红书、X、LinkedIn，随时可增减。" },
    en: { title: "Pick your platforms", body: "Choose where to post. Xiaohongshu, X, and LinkedIn are pre-selected — add or remove anytime." }
  },
  {
    icon: "✨",
    zh: { title: "一键生成", body: "约 30 秒出各平台能直接发的文案，可复制、导出，或让 AI 再润色一遍。" },
    en: { title: "Generate", body: "Get platform-ready copy in about 30 seconds. Copy, export, or have the AI polish it further." }
  },
];

export function OnboardingCoachmarks() {
  const locale = useLocale();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (window.localStorage.getItem(STORAGE_KEY)) return;
      // 延迟一拍，让首屏先渲染完再叠引导，避免突兀。
      const timer = window.setTimeout(() => setVisible(true), 700);
      return () => window.clearTimeout(timer);
    } catch {
      // localStorage 不可用时静默跳过，绝不阻塞首屏。
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // 标记失败也不影响关闭。
    }
    setVisible(false);
  }

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const c = locale === "en" ? current.en : current.zh;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-hairline bg-surface shadow-raised">
        <div className="relative bg-gradient-to-br from-brand/15 to-accent/10 p-6 text-center">
          <button
            type="button"
            onClick={dismiss}
            aria-label={locale === "en" ? "Close" : "关闭"}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-3xl shadow-panel">
            {current.icon}
          </div>
          <p className="eyebrow">
            {locale === "en" ? "30-second tour" : "30 秒上手"} · {step + 1}/{STEPS.length}
          </p>
          <h3 className="mt-2 text-xl font-black text-fg">{c.title}</h3>
        </div>

        <div className="p-5">
          <p className="text-sm leading-6 text-fg-muted">{c.body}</p>

          <div className="mt-5 flex items-center justify-between">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-brand" : "w-1.5 bg-surface-2"}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={dismiss} className="text-xs font-bold text-fg-muted hover:text-fg">
                {locale === "en" ? "Skip" : "跳过"}
              </button>
              {isLast ? (
                <button type="button" onClick={dismiss} className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm">
                  {locale === "en" ? "Start" : "开始用"} <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
                  className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm"
                >
                  {locale === "en" ? "Next" : "下一步"} <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
