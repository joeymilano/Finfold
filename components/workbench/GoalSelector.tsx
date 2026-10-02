"use client";

import { Target } from "@/components/ui/icons";
import { growthGoals, type GoalId } from "@/lib/goals";
import { dashboardCopy, type Locale } from "@/lib/i18n";

type GoalSelectorProps = {
  value: GoalId;
  onChange: (value: GoalId) => void;
  locale: Locale;
  disabled?: boolean;
};

const englishGoalLabels: Record<GoalId, string> = {
  "lead-gen": "Lead generation",
  "audience-growth": "Audience growth",
  "product-launch": "Product launch",
  "event-promo": "Event promotion"
};

export function GoalSelector({ value, onChange, locale, disabled = false }: GoalSelectorProps) {
  const copy = dashboardCopy[locale];

  return (
    <section className="panel rounded-md p-4">
      <div className="mb-3 flex items-center gap-2">
        <Target className="h-4 w-4 text-fg" />
        <h2 className="text-sm font-black">{copy.goalTitle}</h2>
      </div>
      <div className="grid gap-2">
        {growthGoals.map((goal) => {
          const selected = goal.id === value;

          return (
            <button
              key={goal.id}
              type="button"
              onClick={() => onChange(goal.id)}
              disabled={disabled}
              className={`focus-ring rounded-sm border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                selected ? "border-action/60 bg-action/[0.075] text-fg shadow-glow-action" : "border-hairline bg-surface hover:-translate-y-0.5 hover:border-action/45 hover:bg-action/[0.035]"
              }`}
            >
              <span className="block text-sm font-semibold">{locale === "zh" ? goal.label : englishGoalLabels[goal.id]}</span>
              <span className="mt-1 block text-xs leading-5 text-fg-muted">
                {locale === "zh" ? goal.descriptionZh : goal.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
