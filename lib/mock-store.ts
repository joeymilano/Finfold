import type { ContentKit, IterationReport, PerformanceMetrics } from "@/lib/content-schema";

// Back the in-memory store with a globalThis singleton. Edge route bundles are
// isolated per-route and HMR resets module-level state, so plain module-level
// Maps would not be shared between /api/generate (write) and /api/kits (read).
// Pinning them to globalThis keeps a single shared instance across both.
type MockStore = {
  kits: Map<string, ContentKit>;
  performance: Map<string, PerformanceMetrics[]>;
  iterationReports: Map<string, IterationReport[]>;
};

const globalRef = globalThis as typeof globalThis & { __finfoldMockStore?: MockStore };

const store: MockStore =
  globalRef.__finfoldMockStore ??
  (globalRef.__finfoldMockStore = {
    kits: new Map<string, ContentKit>(),
    performance: new Map<string, PerformanceMetrics[]>(),
    iterationReports: new Map<string, IterationReport[]>()
  });

const { kits, performance, iterationReports } = store;

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
