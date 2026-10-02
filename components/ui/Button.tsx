import React, { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "border-brand/65 bg-brand text-on-brand shadow-[0_12px_28px_-18px_rgb(var(--brand)/0.72)] hover:-translate-y-px hover:brightness-[0.98] hover:shadow-[0_16px_34px_-18px_rgb(var(--brand)/0.78)]",
  secondary:
    "border-action/45 bg-action/[0.07] text-action-strong shadow-[0_10px_28px_-22px_rgb(var(--action)/0.5)] hover:-translate-y-px hover:border-action/65 hover:bg-action/[0.13] dark:text-action",
  tertiary:
    "border-hairline bg-surface/82 text-fg hover:-translate-y-px hover:border-action/35 hover:bg-surface-2",
  danger:
    "border-risk/35 bg-risk/10 text-risk hover:-translate-y-px hover:border-risk/55 hover:bg-risk/15"
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "min-h-8 rounded-md px-3 py-1.5 text-xs",
  md: "min-h-10 rounded-lg px-4 py-2.5 text-sm",
  lg: "min-h-11 rounded-lg px-5 py-3 text-sm",
  icon: "h-10 w-10 rounded-lg p-0"
};

export function buttonStyles({
  variant = "tertiary",
  size = "md",
  fullWidth = false
}: ButtonStyleOptions = {}): string {
  return cn(
    "focus-ring inline-flex items-center justify-center gap-2 border font-semibold transition duration-150 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-45",
    variantClass[variant],
    sizeClass[size],
    fullWidth && "w-full"
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyleOptions & {
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "tertiary",
    size = "md",
    fullWidth = false,
    loading = false,
    disabled,
    className,
    children,
    type = "button",
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonStyles({ variant, size, fullWidth }), className)}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
});
