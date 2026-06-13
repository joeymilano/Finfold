"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon: LucideIcon;
  title?: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}

const DEFAULT_COPY = {
  zh: { title: "暂无数据", description: "还没有内容，试试创建第一个吧。" },
  en: { title: "Nothing here yet", description: "No content found. Try creating your first item." },
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  const locale = useLocale();
  const defaults = DEFAULT_COPY[locale];

  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2">
        <Icon className="h-7 w-7 text-fg-muted" />
      </div>
      <h3 className="mt-5 text-base font-semibold text-fg">
        {title || defaults.title}
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-fg-muted">
        {description || defaults.description}
      </p>
      {action && (
        action.href ? (
          <Link href={action.href} className="btn-primary mt-5">
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className="btn-primary mt-5">
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
