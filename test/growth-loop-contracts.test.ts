import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  experimentPlanModelSchema,
  growthGoalInputSchema,
  growthLoopEnabled,
  growthLoopVisibleForNav,
  growthLoopPilotMode
} from "@/lib/growth-loop/contracts";

const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("growth loop feature gate (T15: fails closed)", () => {
  it("stays off when the kill switch is off, regardless of mode or whitelist", () => {
    vi.stubEnv("FINFOLD_GROWTH_LOOP_ENABLED", "false");
    vi.stubEnv("FINFOLD_GROWTH_LOOP_PILOT_MODE", "open");
    vi.stubEnv("FINFOLD_GROWTH_LOOP_PILOT_USER_IDS", userId);
    expect(growthLoopEnabled(userId)).toBe(false);
    expect(growthLoopVisibleForNav()).toBe(false);
  });

  it("treats unknown mode values as whitelist, not open", () => {
    vi.stubEnv("FINFOLD_GROWTH_LOOP_ENABLED", "true");
    vi.stubEnv("FINFOLD_GROWTH_LOOP_PILOT_MODE", "everyone");
    expect(growthLoopPilotMode()).toBe("whitelist");
  });

  it("default state (no env at all) is fully off", () => {
    expect(growthLoopEnabled(userId)).toBe(false);
    expect(growthLoopVisibleForNav()).toBe(false);
  });

  it("admits only whitelisted users in whitelist mode", () => {
    vi.stubEnv("FINFOLD_GROWTH_LOOP_ENABLED", "true");
    vi.stubEnv("FINFOLD_GROWTH_LOOP_PILOT_MODE", "whitelist");
    vi.stubEnv("FINFOLD_GROWTH_LOOP_PILOT_USER_IDS", ` ${userId} ,${otherId} `);
    expect(growthLoopEnabled(userId)).toBe(true);
    expect(growthLoopEnabled("99999999-9999-4999-8999-999999999999")).toBe(false);
  });

  it("off mode rejects even whitelisted users", () => {
    vi.stubEnv("FINFOLD_GROWTH_LOOP_ENABLED", "true");
    vi.stubEnv("FINFOLD_GROWTH_LOOP_PILOT_MODE", "off");
    vi.stubEnv("FINFOLD_GROWTH_LOOP_PILOT_USER_IDS", userId);
    expect(growthLoopEnabled(userId)).toBe(false);
  });
});

describe("goal input contract", () => {
  const base = {
    title: "为产品获得新的有效激活用户",
    landingUrl: "https://www.finfold.app/",
    targetValue: 10,
    endAt: new Date(Date.now() + 28 * 24 * 3600 * 1000).toISOString(),
    timezone: "Asia/Shanghai"
  };

  it("accepts a well-formed goal", () => {
    expect(growthGoalInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a past end time (T02-adjacent: goals cannot fake windows)", () => {
    const parsed = growthGoalInputSchema.safeParse({ ...base, endAt: "2020-01-01T00:00:00.000Z" });
    expect(parsed.success).toBe(false);
  });

  it("rejects zero targets and non-url landing pages", () => {
    expect(growthGoalInputSchema.safeParse({ ...base, targetValue: 0 }).success).toBe(false);
    expect(growthGoalInputSchema.safeParse({ ...base, landingUrl: "not-a-url" }).success).toBe(false);
  });
});

describe("planner model contract (T03: invalid plans never reach execution)", () => {
  const validPlan = {
    hypothesis: "展示可查看的成品案例比只介绍功能更可能吸引目标用户试用",
    primaryVariable: "message_angle",
    designType: "exploratory",
    variants: [
      { key: "A", angle: "feature_explanation", workbenchIdea: "写一篇介绍产品功能清单的笔记，突出三个核心能力" },
      { key: "B", angle: "inspectable_example", workbenchIdea: "写一篇展示真实成品案例的笔记，附可查看的链接" }
    ],
    actions: [
      { variantKey: "A", type: "publish_post", channelRef: "selected_channel" },
      { variantKey: "B", type: "publish_post", channelRef: "selected_channel" }
    ],
    missingInputs: [],
    usedLearningIds: []
  };

  it("accepts a compliant plan", () => {
    expect(experimentPlanModelSchema.safeParse(validPlan).success).toBe(true);
  });

  it("rejects single-variant, non-exploratory, and extra-field plans", () => {
    const oneVariant = structuredClone(validPlan);
    oneVariant.variants = [validPlan.variants[0]];
    oneVariant.actions = [validPlan.actions[0]];
    expect(experimentPlanModelSchema.safeParse(oneVariant).success).toBe(false);

    const controlled = { ...validPlan, designType: "controlled" };
    expect(experimentPlanModelSchema.safeParse(controlled).success).toBe(false);

    const extra = { ...validPlan, promisedGrowth: "37%" };
    expect(experimentPlanModelSchema.safeParse(extra).success).toBe(false);
  });

  it("rejects duplicate variant keys inside an otherwise valid plan", () => {
    const duplicate = structuredClone(validPlan);
    duplicate.variants[1] = { ...duplicate.variants[1], key: "A" };
    expect(experimentPlanModelSchema.safeParse(duplicate).success).toBe(false);
  });

  it("rejects actions whose variant key is not declared by the variants", () => {
    const orphan = structuredClone(validPlan);
    orphan.variants = [
      { key: "A", angle: "功能介绍", workbenchIdea: "写一篇介绍产品能力清单的笔记，突出三个核心场景" },
      { key: "B", angle: "成品展示", workbenchIdea: "写一篇展示真实成品案例的笔记，引导读者查看可交互样例" }
    ];
    orphan.actions[1] = { variantKey: "A", type: "publish_post", channelRef: "selected_channel" };
    orphan.actions[0] = { variantKey: "B", type: "publish_post", channelRef: "selected_channel" };
    // Both actions still reference declared keys; now shrink variants to a
    // single entry so the second action's key cannot be declared.
    orphan.variants = [
      { key: "A", angle: "功能介绍", workbenchIdea: "写一篇介绍产品能力清单的笔记，突出三个核心场景" }
    ];
    expect(experimentPlanModelSchema.safeParse(orphan).success).toBe(false);
  });
});
