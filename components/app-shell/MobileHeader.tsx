"use client";

import Link from "next/link";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { UserMenu } from "@/components/app-shell/UserMenu";
import { LocaleToggle } from "@/components/theme/LocaleToggle";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { brand } from "@/lib/brand";

export function MobileHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-hairline bg-surface/95 px-3 backdrop-blur-sm lg:hidden">
      <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-brand shadow-glow-brand">
          <FishLogo variant="app-icon" className="h-8 w-8 object-cover" />
        </span>
        <span className="min-w-0 leading-none">
          <span className="block truncate text-sm font-semibold text-fg">{brand.name}</span>
          <span className="brand-cn block truncate text-[10px] text-fg-muted">{brand.chineseName}</span>
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        <UserMenu />
        <LocaleToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}
