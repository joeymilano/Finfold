import { describe, expect, it } from "vitest";
import {
  createAgentWorkRecord,
  parseAgentWorkRecord,
  workRecordRunMeta,
  workRecordStatusEvents
} from "@/lib/agent/work-record";

describe("agent work records", () => {
  it("persists only concise, public execution stages and timing", () => {
    const record = createAgentWorkRecord({
      stages: [
        "understanding_request",
        "preparing_context",
        "choosing_capabilities",
        "reviewing_results",
        "composing_response"
      ],
      outcome: "completed",
      startedAtMs: Date.parse("2026-08-14T02:00:00.000Z"),
      completedAtMs: Date.parse("2026-08-14T02:00:12.400Z")
    });

    expect(record).toMatchObject({
      // V3 became the write format (per-run usage summary); V1/V2 rows
      // stay readable via parseAgentWorkRecord.
      version: 3,
      outcome: "completed",
      durationMs: 12_400
    });
    expect(workRecordStatusEvents(record)).toEqual(record.stages.map((stage) => ({ stage, completed: true })));
  });

  it("ignores old or malformed history instead of inventing steps", () => {
    expect(parseAgentWorkRecord({ version: 1, stages: ["private_reasoning"] })).toBeNull();
    expect(workRecordStatusEvents(undefined)).toEqual([]);
  });

  it("restores the per-run credits hint from a V3 usage summary", () => {
    const record = createAgentWorkRecord({
      stages: ["understanding_request", "composing_response"],
      outcome: "completed",
      startedAtMs: Date.parse("2026-08-18T12:00:00.000Z"),
      completedAtMs: Date.parse("2026-08-18T12:00:09.000Z"),
      usage: { credits: 3, steps: 3, refunded: 0, available: 17 }
    });

    const meta = workRecordRunMeta(JSON.parse(JSON.stringify(record)));
    expect(meta).toMatchObject({
      usage: { credits: 3, steps: 3, refunded: 0, available: 17 },
      startedAtMs: Date.parse("2026-08-18T12:00:00.000Z"),
      durationMs: 9000
    });
  });

  it("returns no run meta for legacy V1/V2 rows or runs without usage", () => {
    const legacy = {
      version: 2,
      stages: ["composing_response"],
      outcome: "completed",
      startedAt: "2026-08-17T10:00:00.000Z",
      completedAt: "2026-08-17T10:00:05.000Z",
      durationMs: 5000
    };
    expect(workRecordRunMeta(legacy)).toBeNull();
    expect(workRecordRunMeta(undefined)).toBeNull();

    const withoutUsage = createAgentWorkRecord({
      stages: ["composing_response"],
      outcome: "completed",
      startedAtMs: Date.now() - 10
    });
    expect(workRecordRunMeta(withoutUsage)).toBeNull();
  });

  it("persists a truthful waiting-for-choice outcome instead of marking the task complete", () => {
    const record = createAgentWorkRecord({
      stages: ["understanding_request", "reviewing_results"],
      outcome: "awaiting_input",
      startedAtMs: Date.parse("2026-08-24T01:00:00.000Z"),
      completedAtMs: Date.parse("2026-08-24T01:00:05.000Z")
    });

    expect(parseAgentWorkRecord(JSON.parse(JSON.stringify(record)))?.outcome).toBe("awaiting_input");
  });
});
