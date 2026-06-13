"use client";

import Link from "next/link";
import { Clock3 } from "lucide-react";
import type { ContentKit } from "@/lib/content-schema";
import { getGoal } from "@/lib/goals";

type KitHistoryProps = {
  kits: ContentKit[];
};

export function KitHistory({ kits }: KitHistoryProps) {
  return (
    <section id="history" className="panel rounded-md p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-fg" />
        <h2 className="text-sm font-black">Recent kits</h2>
      </div>
      {kits.length === 0 ? (
        <p className="rounded-sm border border-dashed border-hairline bg-surface p-4 text-sm font-semibold text-fg-muted">
          Generate your first content kit to build a reusable launch library.
        </p>
      ) : (
        <div className="grid gap-2">
          {kits.slice(0, 6).map((kit) => (
            <Link
              href={`/kits/${kit.id}`}
              key={kit.id}
              className="focus-ring rounded-sm border border-hairline bg-surface p-3 text-sm shadow-panel transition hover:-translate-y-0.5 hover:border-brand/50 hover:bg-surface-2"
            >
              <span className="block truncate font-semibold">{kit.ideaText}</span>
              <span className="mt-1 block text-xs text-fg-muted">
                {getGoal(kit.goal).label} · {kit.outputs.length} outputs ·{" "}
                {new Date(kit.createdAt).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
