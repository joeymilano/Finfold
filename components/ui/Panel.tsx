import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

type PanelProps = {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  hover?: boolean;
  inset?: boolean;
  /** dark command surface that stays dark in both themes */
  command?: boolean;
};

export function Panel({ as, children, className, hover, inset, command }: PanelProps) {
  const Tag = as ?? "div";
  return (
    <Tag
      className={cn(
        command ? "panel-command" : inset ? "panel-inset" : "panel",
        hover && "panel-hover",
        className
      )}
    >
      {children}
    </Tag>
  );
}
