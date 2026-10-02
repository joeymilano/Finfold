import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OperationsSectionNav } from "@/components/app-shell/OperationsSectionNav";
import { xPipelineVisibleForNav } from "@/lib/x-pipeline/settings";
import { growthLoopVisibleForNav } from "@/lib/growth-loop/contracts";
import { XPipelineConsole } from "@/components/x-pipeline/XPipelineConsole";
import { xPipelineEnabled } from "@/lib/x-pipeline/settings";

export const metadata: Metadata = {
  title: "X Pipeline | Finfold",
  description: "Daily X drafts, one illustration, and engagement replies — every item reviewed before it goes out."
};

export default function XPipelinePage() {
  if (!xPipelineEnabled()) notFound();
  return (
    <>
      <OperationsSectionNav growthLoop={growthLoopVisibleForNav()} xPipeline={xPipelineVisibleForNav()} />
      <XPipelineConsole />
    </>
  );
}
