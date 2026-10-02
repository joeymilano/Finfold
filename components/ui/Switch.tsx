"use client";

import React, { type ButtonHTMLAttributes } from "react";

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
};

export function Switch({ checked, onCheckedChange, label, className = "", disabled, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`focus-ring relative inline-flex h-8 w-12 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-brand/70 bg-brand shadow-[inset_0_1px_1px_rgb(0_0_0/0.12)]"
          : "border-hairline bg-surface-2 hover:border-fg-muted/45"
      } ${className}`}
      {...props}
    >
      <span
        aria-hidden="true"
        className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.32)] transition-transform duration-200 ease-out ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
