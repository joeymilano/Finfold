"use client";

import React, { useEffect, useState } from "react";
import { Sparkles } from "@/components/ui/icons";
import { Switch } from "@/components/ui/Switch";
import { useLocale } from "@/hooks/useLocale";
import { isCompletionSoundMuted, playTaskCompleteSound, setCompletionSoundMuted } from "@/lib/completion-sound";

/**
 * CompletionSoundCard — preference card for the completion chime that plays
 * when an agent reply or a content generation task finishes. The choice is
 * remembered on this device. Turning the sound on previews it immediately.
 */
export function CompletionSoundCard() {
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);
  const [soundOn, setSoundOn] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSoundOn(!isCompletionSoundMuted());
  }, []);

  function handleToggle(next: boolean) {
    setSoundOn(next);
    setCompletionSoundMuted(!next);
    if (next) playTaskCompleteSound();
  }

  return (
    <section className="panel p-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Sparkles className="h-4 w-4 text-action-strong dark:text-action" />
        {locale === "en" ? "Completion Sound" : "完成提示音"}
      </div>
      <p className="text-xs text-fg-muted">
        {locale === "en"
          ? "Play a short chime when an agent reply or a content generation task finishes. Your choice is saved on this device."
          : "智能体回复或内容生成完成时，播放一声轻快提示。选择会保存在本设备。"}
      </p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-fg">
          {locale === "en" ? "Play the completion chime" : "播放完成提示音"}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => playTaskCompleteSound()}
            disabled={!mounted || !soundOn}
            className="focus-ring inline-flex min-h-10 items-center rounded-lg border border-hairline px-3.5 py-2 text-sm font-semibold text-fg-muted transition hover:bg-surface hover:text-fg disabled:opacity-50"
          >
            {locale === "en" ? "Preview" : "试听"}
          </button>
          <Switch
            checked={mounted && soundOn}
            onCheckedChange={handleToggle}
            label={locale === "en" ? "Play the completion chime" : "播放完成提示音"}
          />
        </div>
      </div>
    </section>
  );
}
