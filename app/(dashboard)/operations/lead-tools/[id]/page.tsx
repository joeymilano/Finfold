import type { Metadata } from "next";
import { OperationsSectionNav } from "@/components/app-shell/OperationsSectionNav";
import { xPipelineVisibleForNav } from "@/lib/x-pipeline/settings";
import { growthLoopVisibleForNav } from "@/lib/growth-loop/contracts";
import { LeadToolWorkspace } from "@/components/lead-tools/LeadToolWorkspace";

export const metadata: Metadata = {
  title: "获客工具 | Finfold"
};

export default async function LeadToolWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <OperationsSectionNav growthLoop={growthLoopVisibleForNav()} xPipeline={xPipelineVisibleForNav()} />
      <LeadToolWorkspace toolId={id} />
    </>
  );
}
