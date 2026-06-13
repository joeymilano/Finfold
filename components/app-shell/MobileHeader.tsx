"use client";

import Link from "next/link";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { LocaleToggle } from "@/components/theme/LocaleToggle";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { brand } from "@/lib/brand";

export function MobileHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-hairline bg-surface/95 px-4 backdrop-blur-sm lg:hidden">
      <Link href="/dashboard" className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-brand shadow-glow-brand">
          <FishLogo variant="app-icon" className="h-8 w-8 object-cover" />
        </span>
        <span className="leading-none">
          <span className="block text-sm font-semibold text-fg">{brand.name}</span>
          <span className="brand-cn block text-[10px] text-fg-muted">{brand.chineseName}</span>
        </span>
      </Link>
      <div className="flex items-center gap-1.5">
        <LocaleToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}
