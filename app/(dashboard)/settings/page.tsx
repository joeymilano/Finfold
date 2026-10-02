"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { useAuthUser } from "@/components/auth/AuthUserProvider";
import { AccountSecurityTab } from "@/components/settings/AccountSecurityTab";
import { AgentAccessTab } from "@/components/settings/AgentAccessTab";
import { LocalDevicesTab } from "@/components/settings/LocalDevicesTab";
import { PlanRedemptionTab } from "@/components/settings/PlanRedemptionTab";
import { SocialAccountsTab } from "@/components/settings/SocialAccountsTab";
import { Loader2 } from "@/components/ui/icons";
import { useLocale } from "@/hooks/useLocale";

type SettingsTabKey = "profile" | "plan" | "social" | "agent" | "local";

const SETTINGS_TABS: Array<{ key: SettingsTabKey; labelZh: string; labelEn: string }> = [
  { key: "profile", labelZh: "账号与安全", labelEn: "Account & Security" },
  { key: "plan", labelZh: "套餐与兑换", labelEn: "Plan & Redemption" },
  { key: "social", labelZh: "社交账号", labelEn: "Social Accounts" },
  { key: "agent", labelZh: "智能体接入", labelEn: "Agent Access" },
  { key: "local", labelZh: "本地设备", labelEn: "Local Device" },
];

/**
 * SettingsPage — categorized settings shell with a vertical section nav
 * (horizontal tabs on mobile). The active section is mirrored to the URL
 * (?tab=profile|plan|social|agent) so each section is deep-linkable, and
 * social OAuth callbacks (?social_connection=…) land directly on the
 * social section. Section contents live in components/settings/*.
 */
export default function SettingsPage() {
  const router = useRouter();
  const locale = useLocale();
  const { ready: authReady, user: authUser } = useAuthUser();
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<SettingsTabKey>("profile");

  useEffect(() => {
    setMounted(true);
    const query = new URLSearchParams(window.location.search);
    const requested = query.get("tab");
    if (requested === "social" || query.get("social_connection")) {
      // Social OAuth callbacks always land on the social section.
      setTab("social");
    } else if (requested && SETTINGS_TABS.some((entry) => entry.key === requested)) {
      setTab(requested as SettingsTabKey);
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!authUser) {
      router.replace("/login");
    }
  }, [authReady, authUser, router]);

  function switchTab(next: SettingsTabKey) {
    setTab(next);
    // Keep unrelated query params (e.g. OAuth callback status) intact.
    const query = new URLSearchParams(window.location.search);
    if (next === "profile") {
      query.delete("tab");
    } else {
      query.set("tab", next);
    }
    const qs = query.toString();
    window.history.replaceState(null, "", qs ? `/settings?${qs}` : "/settings");
  }

  if (!mounted || !authReady || !authUser) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-fg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] pb-10 xl:max-w-[1440px] 2xl:max-w-[1640px]">
      <div className="border-b border-hairline pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{locale === "en" ? "Account" : "账号"}</p>
        <h1 className="mt-1.5 text-3xl font-bold text-fg">{locale === "en" ? "Account Settings" : "账号设置"}</h1>
        <p className="mt-2 text-sm text-fg-muted">
          {locale === "en"
            ? "Manage your account security, plan, social accounts, and agent access"
            : "管理账号安全、套餐、社交账号与智能体接入"}
        </p>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label={locale === "en" ? "Settings sections" : "设置分类"} className="min-w-0">
          <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-6 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
            {SETTINGS_TABS.map((entry) => {
              const active = tab === entry.key;
              return (
                <li key={entry.key} className="shrink-0 lg:w-full">
                  <button
                    type="button"
                    onClick={() => switchTab(entry.key)}
                    aria-current={active ? "true" : undefined}
                    className={`focus-ring inline-flex min-h-10 w-full items-center whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${
                      active
                        ? "border-action/45 bg-action/[0.08] text-action-strong dark:text-action"
                        : "border-transparent text-fg-muted hover:bg-surface hover:text-fg"
                    }`}
                  >
                    {locale === "en" ? entry.labelEn : entry.labelZh}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          {tab === "profile" ? <AccountSecurityTab /> : null}
          {tab === "plan" ? <PlanRedemptionTab /> : null}
          {tab === "social" ? <SocialAccountsTab /> : null}
          {tab === "agent" ? <AgentAccessTab /> : null}
          {tab === "local" ? <LocalDevicesTab /> : null}
        </div>
      </div>
    </div>
  );
}
