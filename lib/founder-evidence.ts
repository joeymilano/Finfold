export type ProfileEvidenceRow = { id: string; plan: string | null; founding_member: boolean | null; created_at: string };
export type KitEvidenceRow = { id: string; user_id: string; created_at: string; experiment_bucket: "treatment" | "control" | null };
export type OutputEvidenceRow = {
  id: string;
  kit_id: string;
  user_id: string;
  publish_status: string;
  user_edited: boolean | null;
  created_at: string;
  published_at: string | null;
};
export type PerformanceEvidenceRow = {
  kit_id: string;
  user_id: string;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  leads: number | null;
  signups: number | null;
  revenue: number | string | null;
};
export type SubscriptionEvidenceRow = {
  user_id: string;
  status: string;
  provider_customer_id: string | null;
  current_period_end: string | null;
  created_at: string;
};
export type ActivationCodeEvidenceRow = {
  batch_label: string;
  plan: string;
  duration_days: number;
  redeemed_by: string | null;
  redeemed_at: string | null;
  created_at: string;
};
export type FeedbackEvidenceRow = {
  user_id: string;
  rating: "helpful" | "unhelpful";
  reason_codes: string[] | null;
  created_at: string;
};
export type BrainEvidenceRow = {
  user_id: string;
  learned_style: string[] | null;
  learned_negative: string[] | null;
  performance_rules: string[] | null;
  approved_examples: string[] | null;
};
export type ReferralEvidenceRow = {
  referrer_user_id: string;
  status: "pending" | "completed" | "ineligible";
  risk_flag: boolean | null;
  attributed_at: string;
  rewarded_at: string | null;
  referrer_reward_credits: number | null;
  referred_reward_credits: number | null;
};

export type FounderEvidenceRows = {
  profiles: ProfileEvidenceRow[];
  kits: KitEvidenceRow[];
  outputs: OutputEvidenceRow[];
  performance: PerformanceEvidenceRow[];
  subscriptions: SubscriptionEvidenceRow[];
  activationCodes: ActivationCodeEvidenceRow[];
  feedback: FeedbackEvidenceRow[];
  brains: BrainEvidenceRow[];
  referrals?: ReferralEvidenceRow[];
};

export type FounderEvidence = ReturnType<typeof buildFounderEvidence>;

const DAY = 24 * 60 * 60 * 1000;
const MIN_EXPERIMENT_SAMPLES_PER_GROUP = 10;

export function buildFounderEvidence(rows: FounderEvidenceRows, now = new Date()) {
  const referrals = rows.referrals ?? [];
  const since7 = now.getTime() - 7 * DAY;
  const since30 = now.getTime() - 30 * DAY;
  const activatedUsers = new Set(rows.kits.map((row) => row.user_id));
  const publishedOutputs = rows.outputs.filter((row) => ["posted", "measured", "iterated"].includes(row.publish_status));
  const publishedUsers = new Set(publishedOutputs.map((row) => row.user_id));
  const measuredUsers = new Set(rows.performance.map((row) => row.user_id));
  const measuredKitIds = new Set(rows.performance.map((row) => row.kit_id));
  const kitById = new Map(rows.kits.map((row) => [row.id, row]));
  const weeklyActiveUsers = new Set(rows.kits.filter((row) => Date.parse(row.created_at) >= since7).map((row) => row.user_id));

  const userWeeks = new Map<string, Set<string>>();
  for (const kit of rows.kits) {
    const weeks = userWeeks.get(kit.user_id) ?? new Set<string>();
    weeks.add(weekKey(new Date(kit.created_at)));
    userWeeks.set(kit.user_id, weeks);
  }
  const repeatCreators = [...userWeeks.values()].filter((weeks) => weeks.size >= 2).length;

  const paidUsers = new Set<string>();
  for (const subscription of rows.subscriptions) {
    const periodActive = !subscription.current_period_end || Date.parse(subscription.current_period_end) > now.getTime();
    const isMarketingTrial = subscription.provider_customer_id === "activation_code";
    if (subscription.status === "active" && periodActive && !isMarketingTrial) paidUsers.add(subscription.user_id);
  }
  for (const profile of rows.profiles) {
    if (profile.founding_member) paidUsers.add(profile.id);
  }
  const paidMeasuredUsers = new Set([...paidUsers].filter((userId) => measuredUsers.has(userId)));

  const learningUsers = new Set(
    rows.brains
      .filter((brain) => [brain.learned_style, brain.learned_negative, brain.performance_rules, brain.approved_examples]
        .some((items) => Array.isArray(items) && items.length > 0))
      .map((brain) => brain.user_id)
  );

  const helpfulFeedback = rows.feedback.filter((row) => row.rating === "helpful").length;
  const reasonCounts = new Map<string, number>();
  for (const feedback of rows.feedback) {
    for (const reason of feedback.reason_codes ?? []) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const experiment = {
    treatment: experimentGroup(rows.performance, kitById, "treatment"),
    control: experimentGroup(rows.performance, kitById, "control")
  };
  const experimentReady = experiment.treatment.samples >= MIN_EXPERIMENT_SAMPLES_PER_GROUP
    && experiment.control.samples >= MIN_EXPERIMENT_SAMPLES_PER_GROUP;
  const experimentLift = experimentReady && experiment.control.averageScore > 0
    ? round(((experiment.treatment.averageScore - experiment.control.averageScore) / experiment.control.averageScore) * 100, 1)
    : null;

  const funnel = [
    { key: "signed_up", label: "Signed up", value: rows.profiles.length },
    { key: "activated", label: "Created first kit", value: activatedUsers.size },
    { key: "published", label: "Published output", value: publishedUsers.size },
    { key: "measured", label: "Closed data loop", value: measuredUsers.size },
    { key: "paid_measured", label: "Paid with closed loop", value: paidMeasuredUsers.size }
  ].map((stage, index, stages) => ({
    ...stage,
    fromPreviousRate: index === 0 ? 100 : percentage(stage.value, stages[index - 1].value),
    fromSignupRate: percentage(stage.value, rows.profiles.length)
  }));

  const seedCohorts = buildSeedCohorts(rows.activationCodes, activatedUsers, publishedUsers, measuredUsers);
  const completedReferrals = referrals.filter((row) => row.status === "completed");
  const referralSharers = new Set(referrals.map((row) => row.referrer_user_id));

  return {
    asOf: now.toISOString(),
    acquisition: {
      totalUsers: rows.profiles.length,
      newUsers7d: rows.profiles.filter((row) => Date.parse(row.created_at) >= since7).length,
      newUsers30d: rows.profiles.filter((row) => Date.parse(row.created_at) >= since30).length,
      weeklyActiveCreators: weeklyActiveUsers.size,
      activatedUsers: activatedUsers.size,
      activationRate: percentage(activatedUsers.size, rows.profiles.length),
      repeatCreators,
      repeatCreatorRate: percentage(repeatCreators, activatedUsers.size)
    },
    commercial: {
      paidAccounts: paidUsers.size,
      foundingMembers: rows.profiles.filter((row) => row.founding_member).length,
      paidConversionRate: percentage(paidUsers.size, rows.profiles.length)
    },
    referrals: {
      attributed: referrals.length,
      completed: completedReferrals.length,
      pending: referrals.filter((row) => row.status === "pending").length,
      activationRate: percentage(completedReferrals.length, referrals.length),
      uniqueReferrers: referralSharers.size,
      completedPerReferrer: referralSharers.size > 0
        ? round(completedReferrals.length / referralSharers.size, 2)
        : 0,
      rewardCreditsGranted: completedReferrals.reduce(
        (sum, row) => sum + Number(row.referrer_reward_credits ?? 0) + Number(row.referred_reward_credits ?? 0),
        0
      ),
      riskFlagged: referrals.filter((row) => row.risk_flag).length
    },
    product: {
      totalKits: rows.kits.length,
      kits30d: rows.kits.filter((row) => Date.parse(row.created_at) >= since30).length,
      outputs: rows.outputs.length,
      publishedOutputs: publishedOutputs.length,
      pendingMeasurement: publishedOutputs.filter((row) => !measuredKitIds.has(row.kit_id)).length,
      measuredKits: measuredKitIds.size,
      editedOutputs: rows.outputs.filter((row) => row.user_edited).length
    },
    flywheel: {
      feedbackSignals: rows.feedback.length,
      helpfulFeedback,
      helpfulRate: percentage(helpfulFeedback, rows.feedback.length),
      learningUsers: learningUsers.size,
      learningCoverage: percentage(learningUsers.size, activatedUsers.size),
      experiment: {
        ...experiment,
        liftPercent: experimentLift,
        ready: experimentReady,
        minimumSamplesPerGroup: MIN_EXPERIMENT_SAMPLES_PER_GROUP,
        methodology: "Randomized per eligible content kit; 50/50 treatment-control; one internal diagnostic observation per kit, averaged across measured platforms; revenue excluded."
      },
      topNegativeReasons: [...reasonCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }))
    },
    funnel,
    cohorts: buildCohorts(rows.profiles, rows.kits, now),
    seedCohorts,
    seedCohortTotals: {
      invited: rows.activationCodes.length,
      redeemed: rows.activationCodes.filter((row) => row.redeemed_by).length,
      activated: new Set(rows.activationCodes.filter((row) => row.redeemed_by && activatedUsers.has(row.redeemed_by)).map((row) => row.redeemed_by)).size,
      published: new Set(rows.activationCodes.filter((row) => row.redeemed_by && publishedUsers.has(row.redeemed_by)).map((row) => row.redeemed_by)).size,
      measured: new Set(rows.activationCodes.filter((row) => row.redeemed_by && measuredUsers.has(row.redeemed_by)).map((row) => row.redeemed_by)).size
    }
  };
}

function buildSeedCohorts(
  codes: ActivationCodeEvidenceRow[],
  activatedUsers: Set<string>,
  publishedUsers: Set<string>,
  measuredUsers: Set<string>
) {
  const batches = new Map<string, ActivationCodeEvidenceRow[]>();
  for (const code of codes) {
    const label = code.batch_label.trim() || "Unlabelled";
    const batch = batches.get(label) ?? [];
    batch.push(code);
    batches.set(label, batch);
  }
  return [...batches.entries()]
    .map(([batchLabel, batchCodes]) => {
      const redeemedUsers = new Set(batchCodes.map((code) => code.redeemed_by).filter((id): id is string => Boolean(id)));
      return {
        batchLabel,
        plan: batchCodes[0]?.plan ?? "starter",
        durationDays: batchCodes[0]?.duration_days ?? 0,
        invited: batchCodes.length,
        redeemed: redeemedUsers.size,
        activated: [...redeemedUsers].filter((id) => activatedUsers.has(id)).length,
        published: [...redeemedUsers].filter((id) => publishedUsers.has(id)).length,
        measured: [...redeemedUsers].filter((id) => measuredUsers.has(id)).length,
        createdAt: batchCodes.map((code) => code.created_at).sort()[0] ?? ""
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function experimentGroup(
  performance: PerformanceEvidenceRow[],
  kitById: Map<string, KitEvidenceRow>,
  bucket: "treatment" | "control"
) {
  // Assignment happens once per content kit, while a kit can contain several
  // measured platform outputs. Collapse those correlated rows into one
  // observation per kit so a multi-platform kit does not count as several samples.
  const scoresByKit = new Map<string, number[]>();
  for (const row of performance) {
    if (kitById.get(row.kit_id)?.experiment_bucket !== bucket) continue;
    const scores = scoresByKit.get(row.kit_id) ?? [];
    scores.push(performanceScore(row));
    scoresByKit.set(row.kit_id, scores);
  }
  const scores = [...scoresByKit.values()].map((kitScores) => (
    kitScores.reduce((sum, score) => sum + score, 0) / kitScores.length
  ));
  return {
    samples: scores.length,
    averageScore: scores.length > 0 ? round(scores.reduce((sum, score) => sum + score, 0) / scores.length, 1) : 0
  };
}

function performanceScore(row: PerformanceEvidenceRow) {
  return Number(row.likes ?? 0)
    + Number(row.comments ?? 0) * 3
    + Number(row.saves ?? 0) * 2
    + Number(row.shares ?? 0) * 3
    + Number(row.leads ?? 0) * 8
    + Number(row.signups ?? 0) * 10;
}

function buildCohorts(profiles: ProfileEvidenceRow[], kits: KitEvidenceRow[], now: Date) {
  const firstKitAt = new Map<string, number>();
  for (const kit of kits) {
    const createdAt = Date.parse(kit.created_at);
    const current = firstKitAt.get(kit.user_id);
    if (current === undefined || createdAt < current) firstKitAt.set(kit.user_id, createdAt);
  }
  const cohorts = new Map<string, { signedUp: number; activated: number }>();
  for (let offset = 7; offset >= 0; offset -= 1) {
    cohorts.set(weekKey(new Date(now.getTime() - offset * 7 * DAY)), { signedUp: 0, activated: 0 });
  }
  for (const profile of profiles) {
    const key = weekKey(new Date(profile.created_at));
    const cohort = cohorts.get(key);
    if (!cohort) continue;
    cohort.signedUp += 1;
    const signedUpAt = Date.parse(profile.created_at);
    const activatedAt = firstKitAt.get(profile.id);
    if (activatedAt !== undefined && activatedAt >= signedUpAt && activatedAt <= signedUpAt + 7 * DAY) cohort.activated += 1;
  }
  return [...cohorts.entries()].map(([week, cohort]) => ({
    week,
    ...cohort,
    activationRate: percentage(cohort.activated, cohort.signedUp)
  }));
}

function weekKey(date: Date): string {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return copy.toISOString().slice(0, 10);
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? round((numerator / denominator) * 100, 1) : 0;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
