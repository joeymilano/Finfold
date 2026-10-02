import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OperationsSectionNav } from "@/components/app-shell/OperationsSectionNav";
import { xPipelineVisibleForNav } from "@/lib/x-pipeline/settings";
import { GrowthGoalWorkspace } from "@/components/growth-loop/GrowthGoalWorkspace";
import { growthLoopVisibleForNav } from "@/lib/growth-loop/contracts";

export const metadata: Metadata = {
  title: "Growth Goal | Finfold",
  description: "Goal, experiment, actions, evidence, results, and learnings in one auditable timeline."
};

export default async function GrowthGoalPage({ params }: { params: Promise<{ goalId: string }> }) {
  if (!growthLoopVisibleForNav()) notFound();
  const { goalId } = await params;
  return <><OperationsSectionNav growthLoop xPipeline={xPipelineVisibleForNav()} /><GrowthGoalWorkspace goalId={goalId} /></>;
}
