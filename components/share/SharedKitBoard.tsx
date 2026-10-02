"use client";

import { Check, Copy } from "@/components/ui/icons";
import { useState } from "react";
import type { KitOutput } from "@/lib/content-schema";
import { getPlatform } from "@/lib/platforms";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import { SocialMockup } from "@/components/workbench/mockups/SocialMockup";
import { formatOutput } from "@/lib/kit-export";
import { displayContentTitle } from "@/lib/content-title";

/**
 * Read-only public rendering of a kit's outputs for /share/[slug] — a
 * stripped-down sibling of workbench/OutputBoard without any of the
 * editing/gating/cover-studio chrome that doesn't belong on a page
 * strangers are viewing without an account.
 */
export function SharedKitBoard({ outputs }: { outputs: KitOutput[] }) {
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);

  async function copyOutput(output: KitOutput) {
    const platform = getPlatform(output.platform);
    await navigator.clipboard.writeText(formatOutput(output, platform.label, "en"));
    setCopiedPlatform(output.platform);
    window.setTimeout(() => setCopiedPlatform(null), 1600);
  }

  return (
    <div className="grid gap-5">
      {outputs.map((output) => {
        const platform = getPlatform(output.platform);
        const copied = copiedPlatform === output.platform;
        const title = displayContentTitle(output.title, "en");

        return (
          <article key={output.platform} className="panel panel-hover p-4">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-hairline pb-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-fg-muted">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-surface-2 text-fg">
                  <PlatformGlyph platform={output.platform} className="h-3.5 w-3.5" />
                </span>
                {platform.label}
              </div>
              <button
                type="button"
                onClick={() => void copyOutput(output)}
                className="btn-ghost focus-ring px-3 py-1.5 text-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-brand" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="flex justify-center rounded-xl border border-hairline bg-surface-2 p-4">
              <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-hairline bg-white font-sans shadow-raised">
                <SocialMockup
                  platform={output.platform}
                  title={title}
                  body={output.body}
                  cta={output.cta}
                  notes={output.notes}
                  locked={false}
                  imageUrl={output.imageUrl}
                  locale="en"
                />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
