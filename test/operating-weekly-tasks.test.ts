import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOperatingWeekSlots,
  deriveOperatingTaskState,
  getNextOperatingWeekStart,
  getOperatingWeekStart,
  planInitialOperatingWeek
} from "@/lib/operations/weekly-tasks";

describe("operating weekly queue", () => {
  it("spreads cadence across weekdays without inventing best-time claims", () => {
    const slots = buildOperatingWeekSlots(3, "2026-08-24");

    expect(slots).toEqual([
      { slotIndex: 0, dueAt: "2026-08-24T10:00:00.000Z" },
      { slotIndex: 1, dueAt: "2026-08-26T10:00:00.000Z" },
      { slotIndex: 2, dueAt: "2026-08-28T10:00:00.000Z" }
    ]);
    expect(() => buildOperatingWeekSlots(1, "2026-08-24")).toThrow(/between 2 and 5/);
  });

  it("uses the Xiaohongshu operating week deterministically", () => {
    expect(getOperatingWeekStart(new Date("2026-08-23T17:00:00.000Z"))).toBe("2026-08-24");
    expect(getNextOperatingWeekStart("2026-08-24")).toBe("2026-08-31");
  });

  it("does not manufacture overdue work when activated midweek", () => {
    const tasks = planInitialOperatingWeek(
      3,
      "2026-08-24",
      [],
      new Date("2026-08-26T12:00:00.000Z")
    );

    expect(tasks).toEqual([expect.objectContaining({
      slotIndex: 2,
      status: "open",
      dueAt: "2026-08-28T10:00:00.000Z"
    })]);
  });

  it("closes slots only from real publication evidence", () => {
    const tasks = planInitialOperatingWeek(
      3,
      "2026-08-24",
      [{ id: "output-real", publishedAt: "2026-08-25T03:00:00.000Z" }],
      new Date("2026-08-26T12:00:00.000Z")
    );

    expect(tasks).toEqual([
      expect.objectContaining({
        slotIndex: 0,
        status: "done",
        completedOutputId: "output-real",
        completedAt: "2026-08-25T03:00:00.000Z"
      }),
      expect.objectContaining({ slotIndex: 2, status: "open" })
    ]);
  });

  it("distinguishes execution overdue from completed evidence", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    expect(deriveOperatingTaskState({ status: "open", dueAt: "2026-08-26T10:00:00.000Z" }, now)).toBe("overdue");
    expect(deriveOperatingTaskState({ status: "open", dueAt: "2026-08-28T10:00:00.000Z" }, now)).toBe("scheduled");
    expect(deriveOperatingTaskState({ status: "done", dueAt: "2026-08-24T10:00:00.000Z" }, now)).toBe("completed");
  });
});

describe("operating weekly queue database boundary", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/088_operating_program_weekly_tasks.sql"),
    "utf8"
  );

  it("enforces tenant ownership, idempotency, and evidence-backed completion", () => {
    expect(migration).toContain("FOREIGN KEY (operating_program_id, user_id)");
    expect(migration).toContain("REFERENCES public.operating_programs(id, user_id)");
    expect(migration).toContain("FOREIGN KEY (completed_output_id, user_id)");
    expect(migration).toContain("REFERENCES public.kit_outputs(id, user_id)");
    expect(migration).toContain("ON DELETE SET NULL (completed_output_id)");
    expect(migration).toContain("UNIQUE (operating_program_id, week_start, slot_index)");
    expect(migration).toContain("operating_program_weekly_tasks_output_unique");
    expect(migration).toContain("completed_output_id IS NOT NULL");
    expect(migration).toContain("completion_source = 'output_posted'");
    expect(migration).toContain("'missed'");
  });

  it("lets users inspect the queue without forging completion writes", () => {
    expect(migration).toContain("ALTER TABLE public.operating_program_weekly_tasks ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain('CREATE POLICY "operating weekly tasks: select own"');
    expect(migration).not.toContain('CREATE POLICY "operating weekly tasks: insert own"');
    expect(migration).not.toContain('CREATE POLICY "operating weekly tasks: update own"');
    expect(migration).toContain("'operating_publish'");
  });
});
