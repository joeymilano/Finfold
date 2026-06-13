"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

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
  const active = pathname === href || (href !== "/dashboard" && pathname?.startsWith(href));

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-ring group flex min-w-[168px] shrink-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition lg:min-w-0",
        active
          ? "border-brand/30 bg-brand/10"
          : "border-transparent hover:border-hairline hover:bg-surface-2"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md transition",
          active
            ? "bg-brand text-white"
            : "bg-surface-2 text-fg-muted group-hover:bg-brand group-hover:text-white"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span>
        <span className={cn("block font-semibold", active ? "text-brand-strong dark:text-brand" : "text-fg")}>
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>
      </span>
    </Link>
  );
}
