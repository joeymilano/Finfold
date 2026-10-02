import { describe, expect, it } from "vitest";
import {
  assertOperatingProgramCanActivate,
  EMPTY_OPERATING_PROGRAM,
  getOperatingProgramMissingRequirements,
  mapOperatingProgram,
  normalizeOperatingProgramInput
} from "@/lib/operations/program";

describe("operating program contract", () => {
  it("keeps an incomplete program as a draft and reports exact missing sections", () => {
    const draft = normalizeOperatingProgramInput(EMPTY_OPERATING_PROGRAM);

    expect(getOperatingProgramMissingRequirements(draft)).toEqual([
      "offer",
      "audience",
      "objective",
      "watchlist"
    ]);
    expect(() => assertOperatingProgramCanActivate(draft)).not.toThrow();
  });

  it("rejects activation until the business brief is complete", () => {
    expect(() => assertOperatingProgramCanActivate({ ...EMPTY_OPERATING_PROGRAM, status: "active" }))
      .toThrow(/offer, audience, objective, watchlist/);
  });

  it("normalizes watchlists before persistence", () => {
    const input = normalizeOperatingProgramInput({
      ...EMPTY_OPERATING_PROGRAM,
      watchlist: {
        competitors: [" 对标账号 ", "对标账号", "Another account"],
        keywords: ["本地获客", " 本地获客 "]
      }
    });

    expect(input.watchlist).toEqual({
      competitors: ["对标账号", "Another account"],
      keywords: ["本地获客"]
    });
  });

  it("enforces the combined watchlist limit", () => {
    expect(() => normalizeOperatingProgramInput({
      ...EMPTY_OPERATING_PROGRAM,
      watchlist: {
        competitors: ["a", "b", "c", "d", "e", "f"],
        keywords: ["g", "h", "i", "j", "k"]
      }
    })).toThrow(/at most 10 items/);
  });

  it("maps database fields into the public program type", () => {
    const now = "2026-08-11T10:00:00.000Z";
    const program = mapOperatingProgram({
      id: "program-1",
      platform: "xiaohongshu",
      status: "draft",
      offer: EMPTY_OPERATING_PROGRAM.offer,
      audience: EMPTY_OPERATING_PROGRAM.audience,
      objective: EMPTY_OPERATING_PROGRAM.objective,
      qualified_lead_rule: EMPTY_OPERATING_PROGRAM.qualifiedLeadRule,
      watchlist: EMPTY_OPERATING_PROGRAM.watchlist,
      cadence_per_week: 3,
      baseline: EMPTY_OPERATING_PROGRAM.baseline,
      created_at: now,
      updated_at: now
    });

    expect(program).toMatchObject({
      id: "program-1",
      platform: "xiaohongshu",
      cadencePerWeek: 3,
      createdAt: now
    });
  });
});
