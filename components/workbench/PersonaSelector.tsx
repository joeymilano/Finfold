"use client";

import { UsersRound } from "lucide-react";
import { personas, type PersonaId } from "@/lib/personas";
import { dashboardCopy, type Locale } from "@/lib/i18n";

type PersonaSelectorProps = {
  value: PersonaId;
  onChange: (value: PersonaId) => void;
  locale: Locale;
};

const englishPersonaLabels: Record<PersonaId, string> = {
  "indie-builder": "Indie builder",
  "ai-saas": "AI SaaS",
  consultant: "Consultant",
  "design-service": "Design service",
  "global-team": "Small global team"
};

export function PersonaSelector({ value, onChange, locale }: PersonaSelectorProps) {
  const copy = dashboardCopy[locale];

  return (
    <section className="panel rounded-md p-4">
      <div className="mb-3 flex items-center gap-2">
        <UsersRound className="h-4 w-4 text-fg" />
        <h2 className="text-sm font-black">{copy.personaTitle}</h2>
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as PersonaId)}
        className="focus-ring w-full rounded-sm border border-hairline bg-surface px-3 py-3 text-sm font-black shadow-panel"
      >
        {personas.map((persona) => (
          <option key={persona.id} value={persona.id}>
            {locale === "zh" ? persona.label : englishPersonaLabels[persona.id]} — {locale === "zh" ? persona.descriptionZh : persona.description}
          </option>
        ))}
      </select>
    </section>
  );
}
