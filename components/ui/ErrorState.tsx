"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/cn";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

const DEFAULT_COPY = {
  zh: { title: "出了点问题", description: "加载失败，请稍后再试。", retry: "重试" },
  en: { title: "Something went wrong", description: "Failed to load. Please try again later.", retry: "Retry" },
};

export function ErrorState({ title, description, onRetry, className }: ErrorStateProps) {
  const locale = useLocale();
  const defaults = DEFAULT_COPY[locale];

  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-risk/10">
        <AlertTriangle className="h-7 w-7 text-risk" />
      </div>
      <h3 className="mt-5 text-base font-semibold text-fg">
        {title || defaults.title}
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-fg-muted">
        {description || defaults.description}
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-ghost mt-5 flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          {defaults.retry}
        </button>
      )}
    </div>
  );
}
