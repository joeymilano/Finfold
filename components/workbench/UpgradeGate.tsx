"use client";

import Link from "next/link";
import { ArrowRight, LockKeyhole, X, Sparkles } from "lucide-react";
import type { Locale } from "@/lib/i18n";

type UpgradeGateProps = {
  open: boolean;
  locale: Locale;
  reason: "copy" | "export" | "save" | "analyze" | "iterate";
  onClose: () => void;
  authenticated?: boolean;
};

const copy = {
  zh: {
    title: "升级 Starter 后查看完整内容",
    body: "您已生成并预览了多渠道原生增长资产！升级至 Starter 即可解锁：全平台一键复制、Markdown 一键导出、历史记录保存、自动化排期同步及多渠道转化诊断。",
    login: "注册登录",
    upgrade: "升级查看套餐",
    close: "关闭"
  },
  en: {
    title: "Upgrade to Starter for full access",
    body: "You've successfully previewed the platform-native growth assets! Upgrade to Starter to unlock: copy-all with one click, Markdown batch export, saved history, automated scheduling, and multi-channel performance diagnostics.",
    login: "Sign up / Log in",
    upgrade: "View upgrade plans",
    close: "Close"
  }
} as const;

export function UpgradeGate({ open, locale, onClose, authenticated = false }: UpgradeGateProps) {
  if (!open) return null;
  const c = copy[locale];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface p-6 shadow-panel rk-enter relative overflow-hidden">
        {/* Subtle decorative background gradient */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-36 h-36 rounded-full bg-brand/10 blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fg text-bg shadow-panel relative">
              <LockKeyhole className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand"></span>
              </span>
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold leading-snug text-fg">{c.title}</h2>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-strong dark:text-brand mt-0.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> PREMIUM UPGRADE
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">{c.close}</span>
          </button>
        </div>

        <p className="mt-4 text-xs sm:text-sm leading-relaxed text-fg-muted">{c.body}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {!authenticated && (
            <Link
              href="/login"
              className="focus-ring btn-ghost inline-flex items-center justify-center gap-1.5 text-sm transition-colors"
            >
              {c.login} <ArrowRight className="h-4 w-4 text-fg-muted" />
            </Link>
          )}
          <Link
            href="/billing"
            className={["focus-ring btn-primary inline-flex items-center justify-center gap-1.5 text-sm transition-colors", authenticated ? "sm:col-span-2" : ""].join(" ")}
          >
            {c.upgrade} <ArrowRight className="h-4 w-4 text-white" />
          </Link>
        </div>
      </div>
    </div>
  );
}