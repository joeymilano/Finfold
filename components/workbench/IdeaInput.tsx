"use client";

import { Lightbulb } from "lucide-react";
import { dashboardCopy, type Locale } from "@/lib/i18n";

type IdeaInputProps = {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
};

export function IdeaInput({ value, onChange, locale }: IdeaInputProps) {
  const copy = dashboardCopy[locale];

  return (
    <section className="panel min-w-0 rounded-md p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-brand text-xs font-black text-white">1</span>
          <Lightbulb className="h-4 w-4 text-fg" />
          <h2 className="min-w-0 break-words text-sm font-black">{copy.inputStep}</h2>
        </div>
        <span className="shrink-0 text-xs text-fg-muted">{value.length} chars</span>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring min-h-[260px] w-full min-w-0 resize-none rounded-sm border border-hairline bg-surface p-4 text-sm font-medium leading-6 text-fg shadow-panel placeholder:text-fg-muted/60"
        placeholder={copy.ideaHint}
      />
    </section>
  );
}
