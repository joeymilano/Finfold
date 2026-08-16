import { Check, Circle, Sparkles } from "@/components/ui/icons";
import type { ContentKit } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import { getKitLifecycle } from "@/lib/kit-lifecycle";

type KitLifecycleProps = {
  kit: Pick<ContentKit, "outputs">;
  locale: Locale;
  compact?: boolean;
};

export function KitLifecycle({ kit, locale, compact = false }: KitLifecycleProps) {
  const lifecycle = getKitLifecycle(kit, locale);

  return (
    <section
      aria-label={locale === "en" ? "Content lifecycle" : "内容生命周期"}
      className={`rounded-lg border border-hairline bg-surface-2/55 ${compact ? "p-3" : "p-4"}`}
    >
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {lifecycle.stages.map((stage) => (
          <div key={stage.id} className="min-w-0">
            <div
              className={`mb-2 h-1 rounded-full ${
                stage.state === "complete"
                  ? "bg-positive"
                  : stage.state === "current"
                    ? "bg-brand"
                    : "bg-hairline"
              }`}
            />
            <div className="flex min-w-0 items-center gap-1.5">
              {stage.state === "complete" ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-positive" aria-hidden="true" />
              ) : (
                <Circle className={`h-3 w-3 shrink-0 ${stage.state === "current" ? "fill-brand text-brand" : "text-fg-muted"}`} aria-hidden="true" />
              )}
              <span className={`truncate text-xs font-semibold ${stage.state === "upcoming" ? "text-fg-muted" : "text-fg"}`}>
                {stage.label}
              </span>
            </div>
            {!compact ? <p className="mt-1 truncate text-[10px] text-fg-muted">{stage.detail}</p> : null}
          </div>
        ))}
      </div>
      <div className={`flex items-start gap-2 border-t border-hairline ${compact ? "mt-2.5 pt-2.5" : "mt-3 pt-3"}`}>
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
        <p className="text-xs font-medium leading-5 text-fg-muted">
          <span className="font-semibold text-fg">{locale === "en" ? "Next: " : "下一步："}</span>
          {lifecycle.nextAction}
        </p>
      </div>
    </section>
  );
}
