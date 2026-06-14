"use client";

import { Target } from "lucide-react";
import { growthGoals, type GoalId } from "@/lib/goals";
import { dashboardCopy, type Locale } from "@/lib/i18n";

type GoalSelectorProps = {
  value: GoalId;
  onChange: (value: GoalId) => void;
  locale: Locale;
};

const englishGoalLabels: Record<GoalId, string> = {
  "lead-gen": "Lead generation",
  "audience-growth": "Audience growth",
  "product-launch": "Product launch",
  "event-promo": "Event promotion"
};

export function GoalSelector({ value, onChange, locale }: GoalSelectorProps) {
  const copy = dashboardCopy[locale];

  return (
    <section className="panel min-w-0 rounded-md p-4">
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <Target className="h-4 w-4 text-fg" />
        <h2 className="min-w-0 break-words text-sm font-black">{copy.goalTitle}</h2>
      </div>
      <div className="grid gap-2">
        {growthGoals.map((goal) => {
          const selected = goal.id === value;

          return (
            <button
              key={goal.id}
              type="button"
              onClick={() => onChange(goal.id)}
              className={`focus-ring min-w-0 rounded-sm border px-3 py-3 text-left transition ${
                selected ? "border-brand bg-brand text-white shadow-glow-brand" : "border-hairline bg-surface hover:-translate-y-0.5 hover:border-brand/50 hover:bg-surface-2"
              }`}
            >
              <span className="block break-words text-sm font-semibold">{locale === "zh" ? goal.label : englishGoalLabels[goal.id]}</span>
              <span className={`mt-1 block text-xs leading-5 ${selected ? "text-white/70" : "text-fg-muted"}`}>
                {goal.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
