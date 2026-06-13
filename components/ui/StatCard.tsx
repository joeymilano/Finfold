import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Sparkline } from "@/components/ui/Sparkline";
import { cn } from "@/lib/cn";

export type StatTone = "neutral" | "good" | "warn" | "risk";

export function StatCard({
  label,
  value,
  detail,
  delta,
  trend,
  icon: Icon,
  tone = "neutral",
  className
}: {
  label: string;
  value: string;
  detail?: string;
  /** e.g. "+12%" — sign drives arrow + color */
  delta?: string;
  /** sparkline series */
  trend?: number[];
  icon?: LucideIcon;
  tone?: StatTone;
  className?: string;
}) {
  const isNegative = delta?.trim().startsWith("-");
  const accentClass =
    tone === "warn"
      ? "text-warn"
      : tone === "risk"
        ? "text-risk"
        : "text-brand-strong dark:text-brand";

  return (
    <article className={cn("panel panel-hover flex flex-col p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {Icon ? <Icon className={cn("h-4 w-4", accentClass)} /> : null}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="tabular text-3xl font-semibold leading-none text-fg">{value}</p>
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular",
              isNegative ? "tag-risk" : "tag-success"
            )}
          >
            {isNegative ? (
              <ArrowDownRight className="h-3 w-3" />
            ) : (
              <ArrowUpRight className="h-3 w-3" />
            )}
            {delta.replace(/^[+-]/, "")}
          </span>
        ) : null}
      </div>

      {trend && trend.length > 1 ? (
        <Sparkline
          values={trend}
          tone={tone === "warn" || tone === "risk" ? "accent" : "brand"}
          className="mt-3 h-9 w-full"
          height={36}
          width={200}
        />
      ) : null}

      {detail ? <p className="mt-2 text-sm leading-5 text-fg-muted">{detail}</p> : null}
    </article>
  );
}
