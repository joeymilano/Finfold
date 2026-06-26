"use client";

import { Lightbulb } from "lucide-react";
import { dashboardCopy, type Locale } from "@/lib/i18n";

type IdeaInputProps = {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  disabled?: boolean;
};

export function IdeaInput({ value, onChange, locale, disabled = false }: IdeaInputProps) {
  const copy = dashboardCopy[locale];

  return (
    <section className="panel rounded-md p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-brand text-xs font-black text-white">1</span>
          <Lightbulb className="h-4 w-4 text-fg" />
          <h2 className="text-sm font-black">{copy.inputStep}</h2>
        </div>
        <span className="text-xs text-fg-muted">{locale === "zh" ? `${value.length} 字符` : `${value.length} chars`}</span>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="focus-ring min-h-[260px] w-full resize-none rounded-sm border border-hairline bg-surface p-4 text-sm font-medium leading-6 shadow-panel text-fg placeholder:text-fg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
        placeholder={copy.ideaHint}
      />
    </section>
  );
}
