"use client";

import React, { useCallback, useEffect, useState } from "react";
import { X } from "@/components/ui/icons";

type UseDismissableOptions = {
  /**
   * 若设置，N 天后自动允许重显（适用于会更新的待办类提示）。
   * 不设则视为永久关闭——直到 storageKey 版本号变化才会重新触达。
   */
  expireDays?: number;
};

/**
 * 记住“用户已关闭某提示”。SSR 安全：服务端默认 dismissed=false，
 * 挂载后读 localStorage 决定是否隐藏。
 *
 * storageKey 建议带版本号（-v1）；文案 / 语义变更时换版本号即可重新触达用户。
 * 对于会随数据变化的待办卡，把数据指纹拼进 storageKey，可做到“同一批建议不重复打扰、
 * 新建议自然浮现”。
 */
export function useDismissable(storageKey: string, options: UseDismissableOptions = {}) {
  const { expireDays } = options;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw == null) return;
      if (expireDays) {
        const dismissedAt = Number(raw);
        if (Number.isFinite(dismissedAt) && dismissedAt > 0) {
          const ageDays = (Date.now() - dismissedAt) / 86_400_000;
          if (ageDays < expireDays) {
            setDismissed(true);
          } else {
            window.localStorage.removeItem(storageKey);
          }
        } else {
          // 旧值（无时间戳）视为已关闭
          setDismissed(true);
        }
      } else {
        setDismissed(true);
      }
    } catch {
      /* localStorage 不可用时静默，提示照常展示 */
    }
  }, [storageKey, expireDays]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, expireDays ? String(Date.now()) : "1");
    } catch {
      /* noop */
    }
  }, [storageKey, expireDays]);

  return { dismissed, dismiss };
}

/**
 * 统一的关闭按钮，绝对定位在父容器右上角。父容器需自带 `relative`，
 * 并预留右侧内边距（建议 pr-12）避免与内容重叠。
 */
export function DismissButton({
  onClick,
  label,
  className
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`focus-ring absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted transition hover:bg-surface hover:text-fg ${className ?? ""}`}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
