import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OperationsSectionNav } from "@/components/app-shell/OperationsSectionNav";
import { xPipelineVisibleForNav } from "@/lib/x-pipeline/settings";
import { GrowthLoopOverview } from "@/components/growth-loop/GrowthLoopOverview";
import { growthLoopVisibleForNav } from "@/lib/growth-loop/contracts";

export const metadata: Metadata = {
  title: "Growth Loop | Finfold",
  description: "Define one growth goal, run one honest experiment per round, and let reviewed results shape the next round."
};

export default function GrowthLoopPage() {
  if (!growthLoopVisibleForNav()) notFound();
  return <><OperationsSectionNav growthLoop xPipeline={xPipelineVisibleForNav()} /><GrowthLoopOverview /></>;
}
