import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OperationsSectionNav } from "@/components/app-shell/OperationsSectionNav";
import { DailyPipelineConsole } from "@/components/content-pipeline/DailyPipelineConsole";
import { contentPipelineKillSwitchOn, contentPipelineVisibleForNav } from "@/lib/content-pipeline/settings";
import { growthLoopVisibleForNav } from "@/lib/growth-loop/contracts";
import { xPipelineVisibleForNav } from "@/lib/x-pipeline/settings";

export const metadata: Metadata = {
  title: "Daily Pipeline | Finfold",
  description: "One Official Account article a day — picked, written, and quality-checked automatically, sent to your WeChat draft box for the final click."
};

export default function DailyPipelinePage() {
  if (!contentPipelineKillSwitchOn()) notFound();
  return (
    <>
      <OperationsSectionNav
        growthLoop={growthLoopVisibleForNav()}
        xPipeline={xPipelineVisibleForNav()}
        dailyPipeline={contentPipelineVisibleForNav()}
      />
      <DailyPipelineConsole />
    </>
  );
}
