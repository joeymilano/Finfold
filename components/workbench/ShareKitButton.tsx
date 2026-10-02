"use client";

import { Check, Loader2, Share2 } from "@/components/ui/icons";
import { useState } from "react";
import { addToast } from "@/components/ui/Toast";
import type { Locale } from "@/lib/i18n";
import { captureEvent } from "@/lib/posthog";

/** Creates (or reuses) a /share/[slug] public link for a kit and copies it.
 * On mobile, prefers the native share sheet (navigator.share) so the link can
 * go straight into WeChat / Weibo / X / etc.; falls back to clipboard on
 * desktop or when the API is unavailable. */
export function ShareKitButton({ kitId, locale }: { kitId: string; locale: Locale }) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function share() {
    setLoading(true);
    try {
      const response = await fetch(`/api/kits/${kitId}/share`, { method: "POST" });
      const data = (await response.json()) as { slug?: string; error?: string };

      if (!response.ok || !data.slug) {
        throw new Error(data.error ?? "Failed to create share link.");
      }

      const url = `${window.location.origin}/share/${data.slug}`;

      // Prefer the native share sheet when available — on mobile this opens
      // the OS picker (WeChat / Weibo / X / system apps), far better than a
      // silent clipboard copy. Not available on desktop browsers.
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
      let method: "share" | "clipboard" = "clipboard";
      if (typeof nav.share === "function") {
        try {
          await nav.share({
            title: locale === "en" ? "My content kit on Finfold" : "我在 Finfold 的内容包",
            text: locale === "en" ? "Check out this content kit" : "看看这个内容包",
            url
          });
          method = "share";
        } catch {
          // User dismissed the sheet, or share failed — fall through to clipboard.
        }
      }

      if (method !== "share") {
        // Either navigator.share was unavailable or was dismissed — still copy
        // the link so the user ends up with something actionable.
        await navigator.clipboard.writeText(url);
      }

      captureEvent("kit_shared", { kitId, method });
      setCopied(true);
      addToast(
        "success",
        method === "share"
          ? (locale === "en" ? "Share sheet opened!" : "已打开分享面板！")
          : (locale === "en" ? "Share link copied!" : "分享链接已复制！")
      );
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Failed to create share link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" onClick={() => void share()} disabled={loading} className="btn-ghost focus-ring px-3 py-1.5 text-xs disabled:opacity-50">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : copied ? <Check className="h-3.5 w-3.5 text-brand" /> : <Share2 className="h-3.5 w-3.5" />}
      {copied ? (locale === "en" ? "Link copied" : "已复制链接") : locale === "en" ? "Share" : "分享"}
    </button>
  );
}
