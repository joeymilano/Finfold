"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { OutputBoard } from "@/components/workbench/OutputBoard";
import type { ContentKit } from "@/lib/content-schema";
import { getGoal } from "@/lib/goals";

export default function KitDetailClient({ params }: { params: Promise<{ kitId: string }> }) {
  const [kitId, setKitId] = useState<string | null>(null);
  const [kit, setKit] = useState<ContentKit | null>(null);

  useEffect(() => {
    void params.then((value) => setKitId(value.kitId));
  }, [params]);

  useEffect(() => {
    if (!kitId) {
      return;
    }

    async function loadKit() {
      const response = await fetch("/api/kits", { cache: "no-store" });
      const data = (await response.json()) as { kits?: ContentKit[] };
      setKit(data.kits?.find((item) => item.id === kitId) ?? null);
    }

    void loadKit();
  }, [kitId]);

  return (
    <div className="grid gap-5">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-graphite">
        <ArrowLeft className="h-4 w-4" />
        Back to workbench
      </Link>
      {kit ? (
        <>
          <div className="rounded-lg border border-line bg-white p-5">
            <p className="text-xs font-semibold uppercase text-graphite">{getGoal(kit.goal).label}</p>
            <h1 className="mt-2 text-2xl font-semibold">{kit.ideaText}</h1>
            <p className="mt-3 text-sm text-graphite">
              {kit.outputs.length} outputs · {new Date(kit.createdAt).toLocaleString()}
            </p>
          </div>
          <OutputBoard outputs={kit.outputs} isLoading={false} error={null} locale="zh" />
        </>
      ) : (
        <div className="rounded-lg border border-line bg-white p-6 text-sm text-graphite">
          Content kit not found. It may belong to another account or was not saved.
        </div>
      )}
    </div>
  );
}
