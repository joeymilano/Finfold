import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SectionHeader({
  eyebrow,
  title,
  icon: Icon,
  action,
  className
}: {
  eyebrow?: string;
  title: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="mt-1 text-lg font-semibold text-fg">{title}</h2>
      </div>
      {action ? (
        <div className="shrink-0">{action}</div>
      ) : Icon ? (
        <Icon className="h-5 w-5 shrink-0 text-fg-muted" />
      ) : null}
    </div>
  );
}
