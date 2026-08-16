"use client";

import Link from "next/link";
import React from "react";
import { usePathname } from "next/navigation";
import { Activity, ClipboardList } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useLocale } from "@/hooks/useLocale";

export function OperationsSectionNav() {
  const pathname = usePathname();
  const locale = useLocale();
  const items = [
    { href: "/operations", zh: "运营目标", en: "Operating brief", icon: ClipboardList },
    { href: "/operations/xiaohongshu", zh: "小红书陪跑", en: "XHS Coaching", icon: Activity }
  ];
  return <nav aria-label={locale === "en" ? "Operations" : "运营系统"} className="mx-auto mb-4 flex max-w-[1240px] gap-2 overflow-x-auto rounded-xl border border-hairline bg-surface p-1.5">
    {items.map(({ href, zh, en, icon: Icon }) => {
      const active = pathname === href;
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("focus-ring inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-xs font-black transition", active ? "bg-action text-on-action" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}><Icon className="h-4 w-4" />{locale === "en" ? en : zh}</Link>;
    })}
  </nav>;
}
