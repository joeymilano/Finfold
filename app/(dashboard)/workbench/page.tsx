import { DashboardWorkbench } from "@/components/workbench/DashboardWorkbench";
import { FirstTaskWorkbench } from "@/components/workbench/FirstTaskWorkbench";

export default async function WorkbenchPage({ searchParams }: { searchParams: Promise<{ start?: string; draft?: string }> }) {
  const params = await searchParams;
  return params.start === "1" ? <FirstTaskWorkbench draftId={params.draft} /> : <DashboardWorkbench />;
}
