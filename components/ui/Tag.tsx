import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TagTone = "neutral" | "success" | "warn" | "risk" | "brand" | "accent";

const toneClass: Record<TagTone, string> = {
  neutral: "tag-neutral",
  success: "tag-success",
  warn: "tag-warn",
  risk: "tag-risk",
  brand: "tag-brand",
  accent: "tag-accent"
};

export function Tag({
  tone = "neutral",
  children,
  className,
  dot
}: {
  tone?: TagTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span className={cn("tag", toneClass[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
