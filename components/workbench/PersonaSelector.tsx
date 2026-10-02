"use client";

import { UsersRound } from "@/components/ui/icons";
import { personas, type PersonaGroup, type PersonaId } from "@/lib/personas";
import { dashboardCopy, type Locale } from "@/lib/i18n";

type PersonaSelectorProps = {
  value: PersonaId;
  onChange: (value: PersonaId) => void;
  locale: Locale;
  disabled?: boolean;
};

const englishPersonaLabels: Record<PersonaId, string> = {
  "indie-builder": "Indie builder",
  "ai-saas": "AI SaaS",
  consultant: "Consultant",
  "design-service": "Design service",
  "global-team": "Small global team",
  "general-office": "Office workers",
  "young-women": "Beauty & lifestyle",
  moms: "Moms & parents",
  students: "Students",
  foodies: "Foodies",
  fitness: "Fitness enthusiasts",
  travel: "Travel lovers",
  "consumer-tech": "Consumer tech fans",
  gamers: "Gamers",
  "home-life": "Home & lifestyle"
};

const groupLabels: Record<PersonaGroup, { zh: string; en: string }> = {
  professional: { zh: "专业人群", en: "Professional" },
  consumer: { zh: "大众人群", en: "General consumers" }
};

const groupOrder: PersonaGroup[] = ["professional", "consumer"];

export function PersonaSelector({ value, onChange, locale, disabled = false }: PersonaSelectorProps) {
  const copy = dashboardCopy[locale];
  const selected = personas.find((persona) => persona.id === value);

  return (
    <section className="panel rounded-md p-4">
      <div className="mb-3 flex items-center gap-2">
        <UsersRound className="h-4 w-4 text-fg" />
        <h2 className="text-sm font-black">{copy.personaTitle}</h2>
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as PersonaId)}
        disabled={disabled}
        className="focus-ring w-full rounded-sm border border-hairline bg-surface px-3 py-3 text-sm font-black shadow-panel disabled:cursor-not-allowed disabled:opacity-50"
      >
        {groupOrder.map((group) => (
          <optgroup key={group} label={locale === "zh" ? groupLabels[group].zh : groupLabels[group].en}>
            {personas
              .filter((persona) => persona.group === group)
              .map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {locale === "zh" ? persona.label : englishPersonaLabels[persona.id]}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {selected ? (
        <p className="mt-2 text-xs leading-5 text-fg-muted">
          {locale === "zh" ? selected.descriptionZh : selected.description}
        </p>
      ) : null}
    </section>
  );
}
