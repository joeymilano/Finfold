"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Gift, Sparkles, X } from "@/components/ui/icons";
import { captureEvent } from "@/lib/posthog";
import type { Locale } from "@/lib/i18n";

const PROMPT_KEY = "finfold-referral-share-prompt-v1";
const PROMPT_EVENT = "finfold-referral-share-prompt";
const ACTIVATED_EVENT = "finfold-referral-activated";

type IncomingReferral = {
  status: "pending" | "completed" | "ineligible";
  rewardCredits: number;
  rewardedAt: string | null;
};

export function WorkbenchReferralPrompts({
  authenticated,
  locale
}: {
  authenticated: boolean;
  locale: Locale;
}) {
  const [incoming, setIncoming] = useState<IncomingReferral | null>(null);
  const [showSharePrompt, setShowSharePrompt] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    fetch("/api/referrals/incoming", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { referral?: IncomingReferral | null }) => {
        if (data.referral?.status === "pending") {
          setIncoming(data.referral);
          captureEvent("referral_activation_prompt_viewed");
        }
      })
      .catch(() => undefined);
  }, [authenticated]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowSharePrompt(window.localStorage.getItem(PROMPT_KEY) === "visible");
    const onPrompt = () => {
      setShowSharePrompt(true);
      captureEvent("referral_entry_viewed", { surface: "first_kit" });
    };
    window.addEventListener(PROMPT_EVENT, onPrompt);
    return () => window.removeEventListener(PROMPT_EVENT, onPrompt);
  }, []);

  useEffect(() => {
    const onActivated = () => setIncoming(null);
    window.addEventListener(ACTIVATED_EVENT, onActivated);
    return () => window.removeEventListener(ACTIVATED_EVENT, onActivated);
  }, []);

  function dismiss() {
    setShowSharePrompt(false);
    window.localStorage.setItem(PROMPT_KEY, "dismissed");
  }

  if (!incoming && !showSharePrompt) return null;

  return (
    <div className="grid gap-3">
      {incoming ? (
        <div className="relative overflow-hidden rounded-xl border border-brand/30 bg-brand/8 p-4">
          <div className="pointer-events-none absolute -right-8 -top-12 h-28 w-28 rounded-full bg-brand/20 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
              <Gift className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-black text-fg">
                {locale === "en"
                  ? `${incoming.rewardCredits} invite Credits are waiting`
                  : `${incoming.rewardCredits} 邀请创作点数正在等你领取`}
              </p>
              <p className="mt-1 text-xs leading-5 text-fg-muted">
                {locale === "en"
                  ? "Complete and save your first creation. The reward will land automatically."
                  : "完成并保存第一次创作，奖励会自动到账。"}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {showSharePrompt ? (
        <div className="relative overflow-hidden rounded-xl border border-accent/30 bg-accent/8 p-4">
          <button
            type="button"
            onClick={dismiss}
            className="focus-ring absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted hover:bg-surface"
            aria-label={locale === "en" ? "Dismiss referral prompt" : "关闭邀请提示"}
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="flex flex-col gap-3 pr-7 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-black text-fg">
                  {locale === "en" ? "Know another builder who needs to get the word out?" : "认识同样需要把产品讲出去的朋友？"}
                </p>
                <p className="mt-1 text-xs leading-5 text-fg-muted">
                  {locale === "en" ? "Invite them to Finfold. You both earn 100 Credits after their first creation." : "邀请 TA 来 Finfold，完成首次创作后双方各得 100 创作点数。"}
                </p>
              </div>
            </div>
            <Link
              href="/invite"
              onClick={() => captureEvent("referral_entry_clicked", { surface: "first_kit" })}
              className="btn-ghost focus-ring shrink-0 justify-center text-xs"
            >
              {locale === "en" ? "Invite a friend" : "邀请好友"} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const REFERRAL_SHARE_PROMPT_EVENT = PROMPT_EVENT;
export const REFERRAL_SHARE_PROMPT_STORAGE_KEY = PROMPT_KEY;
export const REFERRAL_ACTIVATED_EVENT = ACTIVATED_EVENT;
