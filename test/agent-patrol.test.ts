import { describe, expect, it } from "vitest";
import {
  derivePatrolCandidate,
  derivePatrolCandidates,
  isPatrolItemSatisfiedByState,
  patrolItemMatchesEvent,
  type AgentPatrolItem,
  type PatrolState
} from "@/lib/agent/patrol";
import type { GrowthMission } from "@/lib/agent/growth-missions";
import { buildWeeklyGrowthReport } from "@/lib/agent/weekly-growth-report";

const now = new Date("2026-07-28T08:00:00.000Z");

function mission(overrides: Partial<GrowthMission> = {}): GrowthMission {
  return {
    id: "9cc86165-4795-4e78-ac2e-692f51fdbba7",
    platform: "xiaohongshu",
    status: "accepted",
    stage: "conversion",
    title: "下一轮：建立关注理由",
    hypothesis: "只改变关注承诺。",
    primaryMetric: "每千次观看新增关注",
    primaryMetricKey: "followers_per_thousand",
    baselineValue: -2,
    targetValue: 0.5,
    variants: [],
    workbenchIdea: "制作一篇可测量的小红书轮播。",
    kitId: null,
    missionKind: "content_experiment",
    objectiveType: null,
    executionState: "planned",
    trackingEnabled: false,
    measurementWindowDays: null,
    measurementStartedAt: null,
    measurementDueAt: null,
    reviewDecision: null,
    reviewBottleneck: null,
    reviewEvidenceNote: null,
    reviewedAt: null,
    verdict: null,
    outcome: null,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    completedAt: null,
    ...overrides
  };
}

function state(overrides: Partial<PatrolState> = {}): PatrolState {
  return {
    missions: [],
    outputs: [],
    latestMetric: null,
    hasAnyKit: false,
    ...overrides
  };
}

function patrolItem(overrides: Partial<AgentPatrolItem> = {}): AgentPatrolItem {
  return {
    id: "patrol-1",
    status: "open",
    actionKind: "mission_generate",
    urgency: "today",
    title: { zh: "任务", en: "Task" },
    detail: { zh: "详情", en: "Detail" },
    evidence: { zh: "证据", en: "Evidence" },
    actionHref: "/workbench",
    fingerprint: "mission_generate:mission-1",
    missionId: "mission-1",
    sourceState: {},
    dueAt: null,
    firstSeenAt: "2026-07-28T01:00:00.000Z",
    lastSeenAt: "2026-07-28T01:00:00.000Z",
    completedAt: null,
    createdAt: "2026-07-28T01:00:00.000Z",
    updatedAt: "2026-07-28T01:00:00.000Z",
    ...overrides
  };
}

describe("Agent patrol prioritization", () => {
  it("puts an accepted Growth Mission ahead of unrelated drafts", () => {
    const candidate = derivePatrolCandidate(state({
      missions: [mission()],
      outputs: [{
        id: "output-1",
        kitId: "kit-old",
        publishStatus: "draft",
        publishedAt: null,
        updatedAt: "2026-07-27T00:00:00.000Z"
      }]
    }), now);

    expect(candidate.actionKind).toBe("mission_generate");
    expect(candidate.actionHref).toBe(`/operations/missions/${mission().id}`);
    expect(candidate.missionId).toBe(mission().id);
  });

  it("promotes an overdue operating slot ahead of generic drafts without interrupting an active mission", () => {
    const operatingTask = {
      id: "operating-task-1",
      operatingProgramId: "program-1",
      platform: "xiaohongshu" as const,
      weekStart: "2026-07-27",
      slotIndex: 0,
      cadenceSnapshot: 3,
      status: "open" as const,
      state: "overdue" as const,
      dueAt: "2026-07-28T07:00:00.000Z",
      completedAt: null,
      completedOutputId: null,
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-28T07:00:00.000Z"
    };
    const idle = derivePatrolCandidate(state({
      operatingTask,
      outputs: [{
        id: "output-draft",
        kitId: "kit-draft",
        platform: "xiaohongshu",
        publishStatus: "draft",
        publishedAt: null,
        updatedAt: "2026-07-28T07:00:00.000Z"
      }]
    }), now);
    expect(idle.actionKind).toBe("operating_publish");
    expect(idle.urgency).toBe("overdue");
    expect(idle.detail.zh).toContain("真实发布记录");

    const executing = derivePatrolCandidate(state({
      missions: [mission()],
      operatingTask
    }), now);
    expect(executing.actionKind).toBe("mission_generate");
  });

  it("uses the active coaching task as the single Xiaohongshu duty item", () => {
    const candidate = derivePatrolCandidate(state({
      missions: [mission()],
      xhsCoaching: {
        programId: "program-1",
        currentDay: 2,
        task: {
          id: "task-2",
          dayNumber: 2,
          kind: "create",
          title: "完成第一轮实验稿",
          reason: "让诊断进入真实创作。",
          targetMetric: "封面点击率",
          singleVariable: "标题与封面承诺",
          workbenchHref: "/workbench?coachingTaskId=task-2",
          status: "todo",
          dueAt: "2026-07-28T15:59:59.000Z",
          updatedAt: "2026-07-28T01:00:00.000Z"
        }
      }
    }), now);

    expect(candidate.actionKind).toBe("xhs_draft");
    expect(candidate.actionHref).toContain("coachingTaskId=task-2");
    expect(candidate.fingerprint).toContain("xhs-coaching:program-1:task-2");
    expect(candidate.evidence.zh).toContain("唯一变量");
  });

  it("closes a coaching duty item when the active task advances", () => {
    const item = patrolItem({
      actionKind: "xhs_publish",
      sourceState: { kind: "coaching", taskId: "task-3" }
    });
    expect(isPatrolItemSatisfiedByState(item, state({
      xhsCoaching: {
        programId: "program-1",
        currentDay: 4,
        task: {
          id: "task-4",
          dayNumber: 4,
          kind: "observe",
          title: "记录早期信号",
          reason: "只观察。",
          targetMetric: "曝光",
          singleVariable: "只观察，不追加变量",
          workbenchHref: "/operations/xiaohongshu",
          status: "todo",
          dueAt: "2026-07-30T15:59:59.000Z",
          updatedAt: "2026-07-28T02:00:00.000Z"
        }
      }
    }))).toBe(true);
  });

  it("marks unmeasured mission results overdue after 48 hours", () => {
    const candidate = derivePatrolCandidate(state({
      missions: [mission({
        status: "posted",
        kitId: "kit-1",
        updatedAt: "2026-07-25T00:00:00.000Z"
      })]
    }), now);

    expect(candidate.actionKind).toBe("mission_measure");
    expect(candidate.urgency).toBe("overdue");
    expect(candidate.actionHref).toBe(`/operations/missions/${mission().id}`);
  });

  it("asks a published commercial mission to confirm an explicit window", () => {
    const candidate = derivePatrolCandidate(state({
      missions: [mission({
        status: "posted",
        missionKind: "growth_opportunity",
        objectiveType: "leads",
        primaryMetric: "有效线索",
        primaryMetricKey: "leads",
        baselineValue: 0,
        targetValue: 1,
        executionState: "measuring"
      })]
    }), now);

    expect(candidate.actionKind).toBe("mission_measure");
    expect(candidate.title.zh).toContain("确认衡量周期");
    expect(candidate.detail.zh).toContain("不会把没有数据自动判成失败");
  });

  it("turns an expired commercial window into a due-review patrol item", () => {
    const dueAt = "2026-07-28T07:00:00.000Z";
    const candidate = derivePatrolCandidate(state({
      missions: [mission({
        status: "posted",
        missionKind: "growth_opportunity",
        objectiveType: "signups",
        primaryMetric: "注册",
        primaryMetricKey: "signups",
        baselineValue: 0,
        targetValue: 2,
        executionState: "review_due",
        measurementWindowDays: 7,
        measurementStartedAt: "2026-07-21T07:00:00.000Z",
        measurementDueAt: dueAt,
        outcome: { actualValue: 0, targetValue: 2 }
      })]
    }), now);

    expect(candidate.actionKind).toBe("mission_review");
    expect(candidate.urgency).toBe("overdue");
    expect(candidate.dueAt).toBe(dueAt);
    expect(candidate.detail.zh).toContain("证据不足继续取证");
  });

  it("asks for a verdict review before starting another experiment", () => {
    const candidate = derivePatrolCandidate(state({
      missions: [mission({
        status: "completed",
        kitId: "kit-1",
        verdict: "won",
        outcome: { actualValue: 0.8 },
        completedAt: "2026-07-28T06:00:00.000Z"
      })],
      latestMetric: {
        kitId: "kit-1",
        measuredAt: "2026-07-28T06:00:00.000Z"
      }
    }), now);

    expect(candidate.actionKind).toBe("mission_review");
    expect(candidate.evidence.zh).toContain("实际 0.8");
  });

  it("falls back to the newest draft, then to a measurable first post", () => {
    const draftCandidate = derivePatrolCandidate(state({
      hasAnyKit: true,
      outputs: [{
        id: "output-1",
        kitId: "kit-1",
        publishStatus: "draft",
        publishedAt: null,
        updatedAt: "2026-07-28T07:00:00.000Z"
      }]
    }), now);
    expect(draftCandidate.actionKind).toBe("review_drafts");

    const coldStart = derivePatrolCandidate(state(), now);
    expect(coldStart.actionKind).toBe("first_measured_post");
    expect(coldStart.actionHref).toBe("/workbench");
  });

  it("keeps lower-priority actions available after the first item is acknowledged", () => {
    const candidates = derivePatrolCandidates(state({
      missions: [mission({
        status: "completed",
        kitId: "kit-complete",
        completedAt: "2026-07-28T06:00:00.000Z"
      })],
      outputs: [{
        id: "output-2",
        kitId: "kit-draft",
        platform: "xiaohongshu",
        publishStatus: "draft",
        publishedAt: null,
        updatedAt: "2026-07-28T07:00:00.000Z"
      }]
    }), now);

    expect(candidates.map((candidate) => candidate.actionKind).slice(0, 2))
      .toEqual(["mission_review", "review_drafts"]);
  });

  it("matches real lifecycle events to the duty item they actually complete", () => {
    const publishItem = patrolItem({
      actionKind: "review_drafts",
      missionId: null,
      sourceState: { outputId: "output-1", kitId: "kit-1", platform: "xiaohongshu" }
    });
    expect(patrolItemMatchesEvent(publishItem, {
      type: "output_posted",
      outputId: "output-1",
      kitId: "kit-1"
    })).toBe(true);

    const measureItem = patrolItem({
      actionKind: "measure_results",
      missionId: null,
      sourceState: { outputId: "output-1", kitId: "kit-1", platform: "xiaohongshu" }
    });
    expect(patrolItemMatchesEvent(measureItem, {
      type: "metrics_saved",
      kitId: "kit-1",
      platform: "x"
    })).toBe(false);
    expect(patrolItemMatchesEvent(measureItem, {
      type: "metrics_saved",
      kitId: "kit-1",
      platform: "xiaohongshu"
    })).toBe(true);

    const cadenceItem = patrolItem({
      actionKind: "operating_publish",
      missionId: null,
      sourceState: { taskId: "operating-task-1", platform: "xiaohongshu", weekStart: "2026-07-27" }
    });
    expect(patrolItemMatchesEvent(cadenceItem, {
      type: "output_posted",
      outputId: "output-2",
      kitId: "kit-2",
      platform: "linkedin",
      publishedAt: "2026-07-28T08:30:00.000Z"
    })).toBe(false);
    expect(patrolItemMatchesEvent(cadenceItem, {
      type: "output_posted",
      outputId: "output-2",
      kitId: "kit-2",
      platform: "xiaohongshu",
      publishedAt: "2026-07-28T08:30:00.000Z"
    })).toBe(true);
    expect(patrolItemMatchesEvent(cadenceItem, {
      type: "output_posted",
      outputId: "output-3",
      kitId: "kit-3",
      platform: "xiaohongshu",
      publishedAt: "2026-08-03T08:30:00.000Z"
    })).toBe(false);
  });

  it("distinguishes completed work from a task that was merely reprioritized", () => {
    const generated = patrolItem({ missionId: mission().id });
    expect(isPatrolItemSatisfiedByState(generated, state({
      missions: [mission({ status: "draft_ready", kitId: "kit-1" })]
    }))).toBe(true);

    const stillDraft = patrolItem({
      actionKind: "review_drafts",
      missionId: null,
      sourceState: { outputId: "output-1" }
    });
    expect(isPatrolItemSatisfiedByState(stillDraft, state({
      outputs: [{
        id: "output-1",
        kitId: "kit-1",
        publishStatus: "draft",
        publishedAt: null,
        updatedAt: now.toISOString()
      }]
    }))).toBe(false);

    const cadenceItem = patrolItem({
      actionKind: "operating_publish",
      missionId: null,
      sourceState: { taskId: "operating-task-1" }
    });
    expect(isPatrolItemSatisfiedByState(cadenceItem, state({
      operatingTask: null,
      operatingTasks: [{
        id: "operating-task-1",
        operatingProgramId: "program-1",
        platform: "xiaohongshu",
        weekStart: "2026-07-27",
        slotIndex: 0,
        cadenceSnapshot: 3,
        status: "done",
        state: "completed",
        dueAt: "2026-07-28T07:00:00.000Z",
        completedAt: "2026-07-28T07:30:00.000Z",
        completedOutputId: "output-real",
        createdAt: "2026-07-27T00:00:00.000Z",
        updatedAt: "2026-07-28T07:30:00.000Z"
      }]
    }))).toBe(true);
    expect(isPatrolItemSatisfiedByState(cadenceItem, state({
      operatingTask: null,
      operatingTasks: []
    }))).toBe(false);
  });

  it("turns a material weekly anomaly into the top idle task without interrupting an active mission", () => {
    const weeklyReport = buildWeeklyGrowthReport({
      platform: "xiaohongshu",
      mode: "account_snapshots",
      current: {
        samples: 1,
        impressions: 4771,
        views: 984,
        coverClickRate: 20.6,
        averageViewSeconds: 0,
        likes: 8,
        comments: 2,
        saves: 1,
        shares: 5,
        followerGrowth: -2,
        profileVisits: 45
      },
      previous: {
        samples: 1,
        impressions: 5200,
        views: 900,
        coverClickRate: 22,
        averageViewSeconds: 0,
        likes: 10,
        comments: 2,
        saves: 4,
        shares: 6,
        followerGrowth: 3,
        profileVisits: 50
      },
      currentKey: "2026-07-28",
      previousKey: "2026-07-21"
    }, "zh", now);

    const idleCandidate = derivePatrolCandidate(state({ weeklyReport }), now);
    expect(idleCandidate.actionKind).toBe("new_experiment");
    expect(idleCandidate.fingerprint).toContain("weekly_anomaly");
    expect(idleCandidate.urgency).toBe("overdue");

    const activeCandidate = derivePatrolCandidate(state({
      weeklyReport,
      missions: [mission()]
    }), now);
    expect(activeCandidate.actionKind).toBe("mission_generate");
  });
});
