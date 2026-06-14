"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

/* ------------------------------------------------------------------ */
/*  Global dispatch — fire from anywhere                              */
/* ------------------------------------------------------------------ */

export function addToast(type: ToastType, message: string, duration = 4000) {
  window.dispatchEvent(
    new CustomEvent("finfold-toast", {
      detail: { type, message, duration } as Omit<ToastItem, "id">,
    }),
  );
}

/* ------------------------------------------------------------------ */
/*  Icon & color mapping                                              */
/* ------------------------------------------------------------------ */

const ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const COLORS: Record<ToastType, string> = {
  success: "text-positive border-positive/30 bg-surface",
  error: "text-risk border-risk/30 bg-surface",
  info: "text-accent border-accent/30 bg-surface",
  warning: "text-warn border-warn/30 bg-surface",
};

const ICON_COLORS: Record<ToastType, string> = {
  success: "text-positive",
  error: "text-risk",
  info: "text-accent",
  warning: "text-warn",
};

/* ------------------------------------------------------------------ */
/*  Container component                                               */
/* ------------------------------------------------------------------ */

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<Omit<ToastItem, "id">>).detail;
      const id = crypto.randomUUID();
      const toast: ToastItem = { ...detail, id };
      setToasts((prev) => {
        const next = [...prev, toast];
        // Keep max 3 visible
        return next.length > 3 ? next.slice(next.length - 3) : next;
      });
      setTimeout(() => remove(id), detail.duration);
    }
    window.addEventListener("finfold-toast", handler);
    return () => window.removeEventListener("finfold-toast", handler);
  }, [remove]);

  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[9999] -translate-x-1/2 flex w-full max-w-sm flex-col items-center gap-2 px-4 lg:bottom-8 lg:left-auto lg:right-8 lg:translate-x-0 lg:items-end">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg w-full",
                COLORS[toast.type],
              )}
            >
              <Icon className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", ICON_COLORS[toast.type])} />
              <p className="flex-1 text-sm leading-snug text-fg">{toast.message}</p>
              <button
                type="button"
                onClick={() => remove(toast.id)}
                className="shrink-0 rounded-md p-0.5 text-fg-muted hover:text-fg transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
