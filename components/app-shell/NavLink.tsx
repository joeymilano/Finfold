"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import type { LucideIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * Sidebar navigation link with a physics-based active indicator.
 * The pill + rail are shared-layout elements (layoutId), so when the user
 * moves between sections the indicator slides to its new home instead of
 * blinking out and back in — one continuous object, like a cursor on an
 * instrument panel.
 */
export function NavLink({
  href,
  label,
  description,
  icon: Icon
}: {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}) {
  const pathname = usePathname();
  const active = pathname === href || (
    href !== "/dashboard"
    && href !== "/operations"
    && pathname?.startsWith(href)
  );

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-ring group relative flex min-w-[168px] shrink-0 items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors lg:min-w-0",
        active ? "" : "hover:bg-surface-2/80"
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active-pill"
          layoutCrossfade={false}
          aria-hidden
          className="absolute inset-0 rounded-md border border-action/35 bg-action/[0.08]"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      {active && (
        <motion.span
          layoutId="sidebar-active-rail"
          layoutCrossfade={false}
          aria-hidden
          className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-action shadow-[0_0_10px_rgb(var(--action)/0.4)]"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      {/* 色块必须瞬时换色：若加 CSS 渐变，滑块飞行期间新旧两项会同时点亮，
          看起来像双选中。即时亮/暗 + 滑块滑入即 Material 的 destination 指示模式。 */}
      <span
        className={cn(
          "relative z-10 flex h-8 w-8 items-center justify-center rounded-sm",
          active
            ? "bg-action text-on-action shadow-[0_8px_20px_-12px_rgb(var(--action)/0.75)]"
            : "bg-surface-2 text-fg-muted group-hover:bg-action-soft group-hover:text-action-strong dark:group-hover:text-action"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="relative z-10">
        <span className="block font-semibold text-fg">{label}</span>
        <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>
      </span>
    </Link>
  );
}
