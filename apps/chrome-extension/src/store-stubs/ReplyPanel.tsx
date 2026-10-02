import type { ReactNode } from "react";

// Store-build replacement for src/ReplyPanel.tsx (aliased in vite.config.ts).
// The reply assistant ships only in the self-hosted pilot build; the store
// build renders posts only and never mounts this component.
export function ReplyPanel(_props: { navigation?: ReactNode; onBusy?: (busy: boolean) => void }) {
  return null;
}
