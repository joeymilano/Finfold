"use client";

import Link from "next/link";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { UserMenu } from "@/components/app-shell/UserMenu";
import { LocaleToggle } from "@/components/theme/LocaleToggle";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { brand } from "@/lib/brand";
import { useLocale } from "@/hooks/useLocale";

export function MobileHeader() {
  const locale = useLocale();

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-hairline bg-surface/95 px-3 backdrop-blur-sm lg:hidden">
      {/* ?stay=1 tells AuthenticatedRedirect to actually show the landing
          page instead of bouncing this signed-in user back to /workbench —
          see that component's doc. */}
      <Link href={locale === "en" ? "/en?stay=1" : "/?stay=1"} className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg">
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
