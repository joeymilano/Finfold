import { z } from "zod";
import type { BrandBrain } from "@/lib/brand-brain";
import { mapBrandBrainFromRow, type BrandBrainRow } from "@/lib/brand-brain-persistence";

const versionRowSchema = z.object({
  id: z.string().uuid(),
  snapshot: z.unknown(),
  created_at: z.string().datetime()
});

export type BrandMemoryVersion = {
  id: string;
  brain: BrandBrain;
  createdAt: string;
};

export function mapBrandMemoryVersion(value: unknown): BrandMemoryVersion {
  const row = versionRowSchema.parse(value);
  return {
    id: row.id,
    brain: mapBrandBrainFromRow(snapshotRow(row.snapshot)),
    createdAt: row.created_at
  };
}

/** Converts a database-row snapshot into the same durable BrandBrain shape
 * every reader already uses. Unknown historic fields are intentionally ignored. */
function snapshotRow(value: unknown): BrandBrainRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as BrandBrainRow
    : {};
}

export function summarizeBrandMemoryVersion(brain: BrandBrain): string {
  const parts = [brain.brandName, brain.positioningStatement, brain.targetAudience]
    .map((value) => value.trim())
    .filter(Boolean);
  return parts.join(" · ").slice(0, 180) || "Empty Brand Memory";
}

export function parseBrandMemoryVersionSnapshot(value: unknown): BrandBrain {
  return mapBrandBrainFromRow(snapshotRow(value));
}