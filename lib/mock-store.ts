import type { ContentKit, IterationReport, PerformanceMetrics } from "@/lib/content-schema";

const kits = new Map<string, ContentKit>();
const performance = new Map<string, PerformanceMetrics[]>();
const iterationReports = new Map<string, IterationReport[]>();

export function saveMockKit(kit: ContentKit): ContentKit {
  kits.set(kit.id, kit);
  return kit;
}

export function listMockKits(): ContentKit[] {
  return Array.from(kits.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getMockKit(kitId: string): ContentKit | null {
  return kits.get(kitId) ?? null;
}

export function saveMockPerformance(kitId: string, metrics: PerformanceMetrics): PerformanceMetrics[] {
  const current = performance.get(kitId) ?? [];
  const next = [...current.filter((item) => item.platform !== metrics.platform), metrics];
  performance.set(kitId, next);
  return next;
}

export function listMockPerformance(kitId: string): PerformanceMetrics[] {
  return performance.get(kitId) ?? [];
}

export function saveMockIterationReport(report: IterationReport): IterationReport {
  const current = iterationReports.get(report.kitId) ?? [];
  iterationReports.set(report.kitId, [report, ...current]);
  return report;
}

export function listMockIterationReports(kitId: string): IterationReport[] {
  return iterationReports.get(kitId) ?? [];
}
