import type { createSupabaseAdminClient } from "@/lib/supabase";
import { getPlatform, type PlatformId } from "@/lib/platforms";

export type GrowthBriefingLocale = "zh" | "en";
export type GrowthStage = "measurement" | "distribution" | "click" | "retention" | "value" | "conversion";
export type GrowthHealth = "critical" | "warning" | "healthy" | "insufficient";

export type GrowthMetricSample = {
  kitId: string;
  platform: PlatformId;
  title: string;
  scope?: "post" | "account";
  ideaText?: string;
  measuredAt?: string;
  impressions: number;
  views: number;
  clicks: number;
  coverClickRate: number;
  averageViewSeconds: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  followerGrowth: number;
  profileVisits: number;
  leads: number;
  signups: number;
  revenue: number;
};

export type GrowthFunnelSignal = {
  stage: GrowthStage;
  label: string;
  health: GrowthHealth;
  value: string;
  evidence: string;
};

export type GrowthPriority = {
  stage: GrowthStage;
  title: string;
  evidence: string;
  action: string;
  metric: string;
};

export type GrowthExperimentVariant = {
  name: string;
  angle: string;
  hookInstruction: string;
  format: string;
};

export type GrowthExperiment = {
  name: string;
  hypothesis: string;
  primaryMetric: string;
  primaryMetricKey: "impressions" | "cover_click_rate" | "average_view_seconds" | "save_share_per_thousand" | "followers_per_thousand";
  baselineValue: number;
  successThreshold: number;
  targetDirection: "increase";
  platform: PlatformId;
  variants: GrowthExperimentVariant[];
  workbenchIdea: string;
  agentPrompt: string;
};

export type GrowthBriefing = {
  generatedAt: string;
  platform: PlatformId | null;
  sampleSize: number;
  headline: string;
  summary: string;
  northStar: {
    label: string;
    value: string;
    evidence: string;
  };
  funnel: GrowthFunnelSignal[];
  priorities: GrowthPriority[];
  experiment: GrowthExperiment | null;
  missingData: string[];
};

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type PerformanceRow = {
  kit_id: string;
  platform: string;
  measured_at?: string | null;
  impressions?: number | null;
  views?: number | null;
  clicks?: number | null;
  cover_click_rate?: number | null;
  average_view_seconds?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
  follower_growth?: number | null;
  profile_visits?: number | null;
  leads?: number | null;
  signups?: number | null;
  revenue?: number | null;
};

const EXTENDED_METRIC_COLUMNS = [
  "kit_id",
  "platform",
  "measured_at",
  "impressions",
  "views",
  "clicks",
  "cover_click_rate",
  "average_view_seconds",
  "likes",
  "comments",
  "saves",
  "shares",
  "follower_growth",
  "profile_visits",
  "leads",
  "signups",
  "revenue"
].join(", ");

const LEGACY_METRIC_COLUMNS = [
  "kit_id",
  "platform",
  "measured_at",
  "impressions",
  "clicks",
  "likes",
  "comments",
  "saves",
  "shares",
  "leads",
  "signups",
  "revenue"
].join(", ");

/**
 * Builds the account-level briefing used by both the proactive Agent home
 * card and the tool-calling chat. The extended query deliberately falls back
 * to the legacy schema so deploying app code before migration 047 does not
 * take the Agent offline.
 */
export async function loadGrowthBriefing(
  admin: AdminClient,
  userId: string,
  locale: GrowthBriefingLocale,
  preferredPlatform?: PlatformId
): Promise<GrowthBriefing> {
  const samples = await loadGrowthMetricSamples(admin, userId, preferredPlatform);
  return buildGrowthBriefing(samples, locale, preferredPlatform);
}

export async function loadGrowthMetricSamples(
  admin: AdminClient,
  userId: string,
  preferredPlatform?: PlatformId
): Promise<GrowthMetricSample[]> {
  let result = await admin
    .from("performance_metrics")
    .select(EXTENDED_METRIC_COLUMNS)
    .eq("user_id", userId)
    .order("measured_at", { ascending: false })
    .limit(60);

  if (result.error) {
    result = await admin
      .from("performance_metrics")
      .select(LEGACY_METRIC_COLUMNS)
      .eq("user_id", userId)
      .order("measured_at", { ascending: false })
      .limit(60);
  }

  const rows = (result.data ?? []) as unknown as PerformanceRow[];
  if (rows.length === 0) {
    return loadAccountSnapshotSamples(admin, userId, preferredPlatform);
  }

  const kitIds = Array.from(new Set(rows.map((row) => row.kit_id)));
  const [{ data: outputs }, { data: kits }] = await Promise.all([
    admin
      .from("kit_outputs")
      .select("kit_id, platform, title")
      .in("kit_id", kitIds),
    admin
      .from("content_kits")
      .select("id, idea_text")
      .in("id", kitIds)
  ]);

  const titleByKey = new Map(
    (outputs ?? []).map((row) => [`${row.kit_id}:${row.platform}`, String(row.title ?? "")])
  );
  const ideaByKit = new Map((kits ?? []).map((row) => [String(row.id), String(row.idea_text ?? "")]));

  const samples = rows
    .filter((row) => isPlatformId(row.platform))
    .map((row): GrowthMetricSample => ({
      kitId: row.kit_id,
      platform: row.platform as PlatformId,
      title: titleByKey.get(`${row.kit_id}:${row.platform}`) || ideaByKit.get(row.kit_id)?.slice(0, 80) || getPlatform(row.platform as PlatformId).label,
      scope: "post",
      ideaText: ideaByKit.get(row.kit_id),
      measuredAt: row.measured_at ?? undefined,
      impressions: number(row.impressions),
      views: number(row.views),
      clicks: number(row.clicks),
      coverClickRate: number(row.cover_click_rate),
      averageViewSeconds: number(row.average_view_seconds),
      likes: number(row.likes),
      comments: number(row.comments),
      saves: number(row.saves),
      shares: number(row.shares),
      followerGrowth: number(row.follower_growth),
      profileVisits: number(row.profile_visits),
      leads: number(row.leads),
      signups: number(row.signups),
      revenue: number(row.revenue)
    }));

  const accountSamples = await loadAccountSnapshotSamples(admin, userId, preferredPlatform);
  return accountSamples.length > 0 ? accountSamples : samples;
}

async function loadAccountSnapshotSamples(
  admin: AdminClient,
  userId: string,
  preferredPlatform?: PlatformId
): Promise<GrowthMetricSample[]> {
  let query = admin
    .from("account_performance_snapshots")
    .select("id, platform, measured_at, impressions, views, cover_click_rate, average_view_seconds, likes, comments, saves, shares, follower_growth, profile_visits")
    .eq("user_id", userId)
    .order("measured_at", { ascending: false })
    .limit(8);
  if (preferredPlatform) query = query.eq("platform", preferredPlatform);

  const { data, error } = await query;
  if (error || !data) return [];

  const { data: recentKits } = await admin
    .from("content_kits")
    .select("idea_text, platforms, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(12);
  const recentIdeaByPlatform = new Map<PlatformId, string>();
  for (const kit of recentKits ?? []) {
    const platforms = Array.isArray(kit.platforms) ? kit.platforms.map(String) : [];
    for (const platform of platforms) {
      if (isPlatformId(platform) && !recentIdeaByPlatform.has(platform)) {
        recentIdeaByPlatform.set(platform, String(kit.idea_text ?? ""));
      }
    }
  }

  return data
    .filter((row) => isPlatformId(String(row.platform)))
    .map((row): GrowthMetricSample => ({
      kitId: `account-snapshot-${String(row.id)}`,
      platform: String(row.platform) as PlatformId,
      title: `${getPlatform(String(row.platform) as PlatformId).label} account snapshot`,
      scope: "account",
      ideaText: recentIdeaByPlatform.get(String(row.platform) as PlatformId),
      measuredAt: row.measured_at ?? undefined,
      impressions: number(row.impressions),
      views: number(row.views),
      clicks: 0,
      coverClickRate: number(row.cover_click_rate),
      averageViewSeconds: number(row.average_view_seconds),
      likes: number(row.likes),
      comments: number(row.comments),
      saves: number(row.saves),
      shares: number(row.shares),
      followerGrowth: number(row.follower_growth),
      profileVisits: number(row.profile_visits),
      leads: 0,
      signups: 0,
      revenue: 0
    }));
}

export function buildGrowthBriefing(
  allSamples: GrowthMetricSample[],
  locale: GrowthBriefingLocale,
  preferredPlatform?: PlatformId
): GrowthBriefing {
  const isZh = locale === "zh";
  if (allSamples.length === 0) {
    const missingData = isZh
      ? ["至少一篇已发布内容的曝光与观看", "封面点击率或链接点击", "平均观看时长", "收藏、分享与涨粉"]
      : ["Impressions and views for one published post", "Cover CTR or link clicks", "Average view time", "Saves, shares, and follower growth"];
    return {
      generatedAt: new Date().toISOString(),
      platform: preferredPlatform ?? null,
      sampleSize: 0,
      headline: isZh ? "我还缺真实结果，暂时不能替你判断" : "I need real outcomes before I can make the call",
      summary: isZh
        ? "把平台后台数据粘贴到发布数据回流，或让 Agent 读取截图。录入后我会自动定位漏斗断点，并准备下一轮实验。"
        : "Paste analytics into the performance loop or let the Agent read screenshots. I will then locate the funnel break and prepare the next experiment.",
      northStar: {
        label: isZh ? "每千次观看新增关注" : "New followers per 1K views",
        value: "—",
        evidence: isZh ? "等待观看与涨粉数据" : "Waiting for views and follower data"
      },
      funnel: [
        {
          stage: "measurement",
          label: isZh ? "数据闭环" : "Measurement",
          health: "insufficient",
          value: "0",
          evidence: isZh ? "还没有可用于比较的真实发布结果" : "No measured publishing outcomes yet"
        }
      ],
      priorities: [
        {
          stage: "measurement",
          title: isZh ? "先补一篇真实数据" : "Add one real post result",
          evidence: isZh ? "没有数据时，任何“爆款分”都只是发布前猜测。" : "Without outcome data, any viral score is only a pre-publish guess.",
          action: isZh ? "从平台后台复制单篇曝光、观看、点击、停留、互动和涨粉数据。" : "Copy per-post exposure, views, clicks, retention, engagement, and follower data.",
          metric: isZh ? "已测量内容数" : "Measured posts"
        }
      ],
      experiment: null,
      missingData
    };
  }

  const platform = choosePlatform(allSamples, preferredPlatform);
  const samples = allSamples
    .filter((sample) => sample.platform === platform)
    .sort((a, b) => String(b.measuredAt ?? "").localeCompare(String(a.measuredAt ?? "")));
  const isAccountScope = samples.every((sample) => sample.scope === "account");
  const sampleLabel = isZh
    ? (isAccountScope ? `${samples.length} 个账号周期` : `${samples.length} 篇内容`)
    : (isAccountScope ? `${samples.length} account snapshot${samples.length === 1 ? "" : "s"}` : `${samples.length} post${samples.length === 1 ? "" : "s"}`);

  const totals = samples.reduce(
    (sum, sample) => ({
      impressions: sum.impressions + sample.impressions,
      views: sum.views + effectiveViews(sample),
      clicks: sum.clicks + sample.clicks,
      likes: sum.likes + sample.likes,
      comments: sum.comments + sample.comments,
      saves: sum.saves + sample.saves,
      shares: sum.shares + sample.shares,
      followerGrowth: sum.followerGrowth + sample.followerGrowth,
      profileVisits: sum.profileVisits + sample.profileVisits
    }),
    { impressions: 0, views: 0, clicks: 0, likes: 0, comments: 0, saves: 0, shares: 0, followerGrowth: 0, profileVisits: 0 }
  );

  const explicitCtrSamples = samples.filter((sample) => sample.coverClickRate > 0);
  const coverCtr = weightedAverage(
    explicitCtrSamples.map((sample) => ({
      value: sample.coverClickRate,
      weight: sample.impressions || 1
    }))
  ) || rate(totals.views || totals.clicks, totals.impressions) * 100;
  const watchSeconds = weightedAverage(
    samples
      .filter((sample) => sample.averageViewSeconds > 0)
      .map((sample) => ({ value: sample.averageViewSeconds, weight: effectiveViews(sample) || 1 }))
  );
  const saveSharePerThousand = rate(totals.saves + totals.shares, totals.views) * 1000;
  const followersPerThousand = rate(totals.followerGrowth, totals.views) * 1000;
  const engagementRate = rate(totals.likes + totals.comments + totals.saves + totals.shares, totals.views || totals.impressions) * 100;

  const ctrValues = samples.map(sampleCoverCtr).filter((value) => value > 0);
  const watchValues = samples.map((sample) => sample.averageViewSeconds).filter((value) => value > 0);

  const funnel: GrowthFunnelSignal[] = [
    {
      stage: "distribution",
      label: isZh ? "曝光" : "Distribution",
      health: totals.impressions > 0 ? "healthy" : "insufficient",
      value: compact(totals.impressions),
      evidence: totals.impressions > 0
        ? (isZh ? `${sampleLabel}共获得 ${compact(totals.impressions)} 次曝光` : `${sampleLabel} earned ${compact(totals.impressions)} impressions`)
        : (isZh ? "缺少曝光数据" : "Impression data is missing")
    },
    buildClickSignal(coverCtr, ctrValues, totals.impressions, isZh),
    buildRetentionSignal(watchSeconds, watchValues, isZh),
    {
      stage: "value",
      label: isZh ? "收藏与传播" : "Save & share value",
      health: totals.views <= 0
        ? "insufficient"
        : totals.saves + totals.shares === 0
          ? "critical"
          : saveSharePerThousand < 5
            ? "warning"
            : "healthy",
      value: totals.views > 0 ? `${saveSharePerThousand.toFixed(1)}‰` : "—",
      evidence: totals.views > 0
        ? (isZh
            ? `${compact(totals.views)} 次观看带来 ${totals.saves} 收藏、${totals.shares} 分享`
            : `${compact(totals.views)} views produced ${totals.saves} saves and ${totals.shares} shares`)
        : (isZh ? "缺少观看数，无法计算价值转化" : "Views are missing, so value conversion cannot be calculated")
    },
    {
      stage: "conversion",
      label: isZh ? "关注转化" : "Follower conversion",
      health: totals.views <= 0
        ? "insufficient"
        : totals.followerGrowth <= 0
          ? "critical"
          : followersPerThousand < 1
            ? "warning"
            : "healthy",
      value: totals.views > 0 ? `${followersPerThousand.toFixed(1)}‰` : "—",
      evidence: totals.profileVisits > 0
        ? (isZh
            ? `${totals.profileVisits} 次主页访问带来 ${totals.followerGrowth} 个新增关注`
            : `${totals.profileVisits} profile visits produced ${totals.followerGrowth} new followers`)
        : (isZh
            ? `${compact(totals.views)} 次观看带来 ${totals.followerGrowth} 个新增关注`
            : `${compact(totals.views)} views produced ${totals.followerGrowth} new followers`)
    }
  ];

  const priorities = funnel
    .filter((signal) => signal.health === "critical" || signal.health === "warning")
    .sort((a, b) => healthRank(b.health) - healthRank(a.health) || stageRank(a.stage) - stageRank(b.stage))
    .slice(0, 3)
    .map((signal) => priorityForSignal(signal, isZh));

  const primary = priorities[0] ?? priorityForSignal(funnel.find((signal) => signal.stage === "value")!, isZh);
  const experiment = buildExperiment(primary.stage, platform, samples[0], locale, {
    impressionsPerSample: rate(totals.impressions, samples.length),
    coverCtr,
    watchSeconds,
    saveSharePerThousand,
    followersPerThousand
  });
  const platformLabel = getPlatform(platform).label;

  return {
    generatedAt: new Date().toISOString(),
    platform,
    sampleSize: samples.length,
    headline: headlineForStage(primary.stage, locale),
    summary: isZh
      ? `我已自动复盘 ${platformLabel} 的${sampleLabel}：${compact(totals.impressions)} 次曝光、${compact(totals.views)} 次观看、互动率 ${engagementRate.toFixed(1)}%。当前先修「${primary.title}」，不要同时重写所有环节。`
      : `I reviewed ${sampleLabel} for ${platformLabel}: ${compact(totals.impressions)} impressions, ${compact(totals.views)} views, and ${engagementRate.toFixed(1)}% engagement. Fix “${primary.title}” before rewriting every stage.`,
    northStar: {
      label: isZh ? "每千次观看新增关注" : "New followers per 1K views",
      value: totals.views > 0 ? followersPerThousand.toFixed(1) : "—",
      evidence: isZh
        ? `${compact(totals.views)} 次观看 / ${totals.followerGrowth} 个新增关注`
        : `${compact(totals.views)} views / ${totals.followerGrowth} new followers`
    },
    funnel,
    priorities,
    experiment,
    missingData: collectMissingData(samples, locale)
  };
}

function buildClickSignal(coverCtr: number, values: number[], impressions: number, isZh: boolean): GrowthFunnelSignal {
  const relativeMedian = median(values);
  const health: GrowthHealth = impressions <= 0 || coverCtr <= 0
    ? "insufficient"
    : values.length >= 3 && relativeMedian > 0 && coverCtr < relativeMedian * 0.7
      ? "critical"
      : values.length >= 2 && relativeMedian > 0 && coverCtr < relativeMedian * 0.85
        ? "warning"
        : "healthy";
  return {
    stage: "click",
    label: isZh ? "封面点击" : "Cover click",
    health,
    value: coverCtr > 0 ? `${coverCtr.toFixed(1)}%` : "—",
    evidence: coverCtr > 0
      ? (values.length >= 2
          ? (isZh
              ? `当前加权点击率 ${coverCtr.toFixed(1)}%，账号样本中位数 ${relativeMedian.toFixed(1)}%`
              : `Weighted CTR is ${coverCtr.toFixed(1)}%; account median is ${relativeMedian.toFixed(1)}%`)
          : (isZh ? `当前加权点击率 ${coverCtr.toFixed(1)}%` : `Weighted CTR is ${coverCtr.toFixed(1)}%`))
      : (isZh ? "缺少封面点击率或观看数据" : "Cover CTR or view data is missing")
  };
}

function buildRetentionSignal(watchSeconds: number, values: number[], isZh: boolean): GrowthFunnelSignal {
  const relativeMedian = median(values);
  const health: GrowthHealth = watchSeconds <= 0
    ? "insufficient"
    : values.length >= 2 && relativeMedian > 0 && watchSeconds < relativeMedian * 0.7
      ? "critical"
      : watchSeconds < 6
        ? "warning"
        : "healthy";
  return {
    stage: "retention",
    label: isZh ? "阅读停留" : "Retention",
    health,
    value: watchSeconds > 0 ? `${watchSeconds.toFixed(1)}s` : "—",
    evidence: watchSeconds > 0
      ? (values.length >= 2
          ? (isZh
              ? `加权平均观看 ${watchSeconds.toFixed(1)} 秒，账号样本中位数 ${relativeMedian.toFixed(1)} 秒`
              : `Weighted view time is ${watchSeconds.toFixed(1)}s; account median is ${relativeMedian.toFixed(1)}s`)
          : (isZh ? `平均观看 ${watchSeconds.toFixed(1)} 秒` : `Average view time is ${watchSeconds.toFixed(1)}s`))
      : (isZh ? "缺少平均观看时长" : "Average view time is missing")
  };
}

function priorityForSignal(signal: GrowthFunnelSignal, isZh: boolean): GrowthPriority {
  const copy: Record<GrowthStage, { zh: [string, string, string]; en: [string, string, string] }> = {
    measurement: {
      zh: ["补齐真实数据", "没有完整指标，Agent 无法判断是封面还是内容问题。", "导入至少一篇单篇内容的完整漏斗数据。"],
      en: ["Complete measurement", "Incomplete metrics hide whether the cover or content failed.", "Import one post's full funnel."]
    },
    distribution: {
      zh: ["提高有效曝光", "内容还没有得到足够的第一轮分发。", "重做选题包装、关键词和发布时间，只改变分发变量。"],
      en: ["Increase qualified distribution", "The content is not earning enough initial distribution.", "Test topic framing, keywords, and timing while holding the content constant."]
    },
    click: {
      zh: ["重做封面承诺", "曝光没有充分转化为观看。", "为同一正文生成结果型、反常识型、具体场景型三个封面 Hook。"],
      en: ["Rebuild the cover promise", "Impressions are not converting into views.", "Create outcome, contrarian, and concrete-scenario cover hooks for the same body."]
    },
    retention: {
      zh: ["修复首屏兑现", "点进来的人没有快速获得封面承诺的价值。", "前两页先给结论和证据，再讲背景；每页只保留一个信息任务。"],
      en: ["Fix first-screen payoff", "People who click are not receiving the promised value quickly.", "Lead with the conclusion and proof; give each slide one job."]
    },
    value: {
      zh: ["增加可收藏价值", "内容被看见，但没有形成保存与传播信号。", "加入清单、步骤、前后对比或可复用模板，并让结尾总结可截图保存。"],
      en: ["Create save-worthy value", "The content is seen but not saved or shared.", "Add a checklist, steps, before/after proof, or a reusable template."]
    },
    conversion: {
      zh: ["建立关注理由", "观看没有转化成持续关注。", "把结尾 CTA 改成明确的账号长期承诺，并让主页定位与本篇主题一致。"],
      en: ["Create a reason to follow", "Views are not becoming ongoing audience growth.", "End with a durable account promise and align the profile with the post topic."]
    }
  };
  const [title, fallbackEvidence, action] = isZh ? copy[signal.stage].zh : copy[signal.stage].en;
  return {
    stage: signal.stage,
    title,
    evidence: signal.evidence || fallbackEvidence,
    action,
    metric: signal.label
  };
}

function buildExperiment(
  stage: GrowthStage,
  platform: PlatformId,
  latest: GrowthMetricSample | undefined,
  locale: GrowthBriefingLocale,
  baseline: {
    impressionsPerSample: number;
    coverCtr: number;
    watchSeconds: number;
    saveSharePerThousand: number;
    followersPerThousand: number;
  }
): GrowthExperiment {
  const isZh = locale === "zh";
  const topic = latest?.ideaText || latest?.title || (isZh ? "最近表现最弱的内容" : "the latest underperforming post");
  const variantSets: Record<Exclude<GrowthStage, "measurement">, GrowthExperimentVariant[]> = {
    distribution: [
      { name: isZh ? "明确人群" : "Audience-specific", angle: isZh ? "把目标读者写进标题" : "Name the reader in the title", hookInstruction: isZh ? "用具体职业、阶段或场景开头" : "Open with a specific role, stage, or situation", format: isZh ? "关键词型 6 页轮播" : "Keyword-led 6-slide carousel" },
      { name: isZh ? "趋势借势" : "Trend bridge", angle: isZh ? "连接正在发生的行业变化" : "Connect to a live category shift", hookInstruction: isZh ? "先说变化，再说它对读者的影响" : "State the shift, then its consequence", format: isZh ? "观点型 5 页轮播" : "Point-of-view 5-slide carousel" },
      { name: isZh ? "窄问题" : "Narrow problem", angle: isZh ? "只解决一个高频小问题" : "Solve one frequent narrow problem", hookInstruction: isZh ? "避免大词，写清触发场景" : "Avoid broad claims; name the trigger", format: isZh ? "问题解决型 7 页轮播" : "Problem-solution 7-slide carousel" }
    ],
    click: [
      { name: isZh ? "结果证明" : "Outcome proof", angle: isZh ? "先展示具体变化或结果" : "Lead with a concrete result", hookInstruction: isZh ? "标题必须出现可验证结果，不用“99%”等无证据数字" : "Use a verifiable result; avoid unsupported statistics", format: isZh ? "结果型 3:4 封面 + 6 页" : "3:4 outcome cover + 6 slides" },
      { name: isZh ? "反常识" : "Contrarian", angle: isZh ? "挑战目标人群的一个默认认知" : "Challenge one default belief", hookInstruction: isZh ? "第二行立即给出反转方向" : "Reveal the reversal on line two", format: isZh ? "反差型 3:4 封面 + 7 页" : "3:4 contrast cover + 7 slides" },
      { name: isZh ? "具体场景" : "Concrete scene", angle: isZh ? "从真实工作瞬间切入" : "Open on a real work moment", hookInstruction: isZh ? "写出人物、动作和代价" : "Name the person, action, and cost", format: isZh ? "场景型 3:4 封面 + 6 页" : "3:4 scene cover + 6 slides" }
    ],
    retention: [
      { name: isZh ? "结论先行" : "Conclusion first", angle: isZh ? "第二页直接兑现答案" : "Pay off the answer on slide two", hookInstruction: isZh ? "封面承诺必须在 3 秒内被证实" : "Prove the cover promise within three seconds", format: isZh ? "6 页单结论轮播" : "6-slide single-idea carousel" },
      { name: isZh ? "前后对比" : "Before / after", angle: isZh ? "用变化过程维持滑动" : "Use transformation to sustain swipes", hookInstruction: isZh ? "每页都产生一次信息差" : "Create a new information gap per slide", format: isZh ? "7 页对比轮播" : "7-slide comparison carousel" },
      { name: isZh ? "拆解标注" : "Annotated breakdown", angle: isZh ? "裁切并标注真实产品或案例" : "Crop and annotate the real product or case", hookInstruction: isZh ? "禁止直接塞入横向完整截图" : "Never drop in a full landscape screenshot", format: isZh ? "6 页标注式轮播" : "6-slide annotated carousel" }
    ],
    value: [
      { name: isZh ? "可保存清单" : "Saveable checklist", angle: isZh ? "把经验变成检查清单" : "Turn the lesson into a checklist", hookInstruction: isZh ? "标题说明读者保存后能完成什么" : "State what saving the post helps accomplish", format: isZh ? "8 页清单轮播" : "8-slide checklist" },
      { name: isZh ? "模板交付" : "Template delivery", angle: isZh ? "直接给可复用模板" : "Give a reusable template", hookInstruction: isZh ? "不先介绍产品，先交付模板" : "Deliver the template before introducing the product", format: isZh ? "6 页模板轮播" : "6-slide template carousel" },
      { name: isZh ? "案例拆解" : "Case breakdown", angle: isZh ? "用事实解释为什么有效" : "Use evidence to explain why it worked", hookInstruction: isZh ? "至少展示一个具体前后差异" : "Show at least one concrete before/after difference", format: isZh ? "7 页案例轮播" : "7-slide case carousel" }
    ],
    conversion: [
      { name: isZh ? "连续栏目" : "Recurring series", angle: isZh ? "把单篇变成可期待的系列" : "Turn the post into an anticipated series", hookInstruction: isZh ? "结尾预告下一篇具体主题" : "Tease the exact next topic", format: isZh ? "7 页栏目型轮播" : "7-slide recurring series" },
      { name: isZh ? "身份承诺" : "Identity promise", angle: isZh ? "明确关注后长期获得什么" : "Clarify the durable value of following", hookInstruction: isZh ? "CTA 不说“关注我”，说清长期交付" : "Do not say only “follow me”; state the ongoing payoff", format: isZh ? "6 页方法型轮播" : "6-slide method carousel" },
      { name: isZh ? "公开实验" : "Build in public", angle: isZh ? "邀请读者跟进真实结果" : "Invite the audience to follow a real experiment", hookInstruction: isZh ? "下一轮必须承诺可验证更新" : "Promise a verifiable update", format: isZh ? "实验日志型轮播" : "Experiment-log carousel" }
    ]
  };
  const effectiveStage = stage === "measurement" ? "click" : stage;
  const variants = variantSets[effectiveStage];
  const metricKey = metricKeyForStage(effectiveStage);
  const baselineValue = metricValueForStage(effectiveStage, baseline);
  const successThreshold = thresholdForStage(effectiveStage, baselineValue);
  const workbenchIdea = isZh
    ? `基于以下原始主题制作一组小红书原生内容实验：${topic.slice(0, 360)}。本轮只优化「${headlineForStage(effectiveStage, "zh")}」。请采用 3:4 竖版轮播，每页一个结论，所有产品截图必须裁切放大并标注，禁止大面积留白。先给出三个封面方向：${variants.map((variant) => variant.name).join("、")}，再选择最有证据支撑的一版完成正文。`
    : `Create a Xiaohongshu-native experiment from this source: ${topic.slice(0, 360)}. Optimize only “${headlineForStage(effectiveStage, "en")}”. Use a 3:4 carousel with one takeaway per slide; crop, enlarge, and annotate product screenshots. Start with these three cover directions: ${variants.map((variant) => variant.name).join(", ")}, then complete the best-supported version.`;
  return {
    name: isZh ? `下一轮：${headlineForStage(effectiveStage, "zh")}` : `Next cycle: ${headlineForStage(effectiveStage, "en")}`,
    hypothesis: isZh
      ? `如果只改变「${headlineForStage(effectiveStage, "zh")}」并保持主题一致，就能判断这一环节是否是当前主要瓶颈。`
      : `If we change only “${headlineForStage(effectiveStage, "en")}” while holding the topic constant, we can verify whether it is the current bottleneck.`,
    primaryMetric: metricForStage(effectiveStage, locale),
    primaryMetricKey: metricKey,
    baselineValue: round(baselineValue, 2),
    successThreshold: round(successThreshold, 2),
    targetDirection: "increase",
    platform,
    variants,
    workbenchIdea,
    agentPrompt: isZh
      ? `读取我的真实表现数据，基于值班简报为 ${getPlatform(platform).label} 制定下一轮内容实验。请给出三个差异明显的策略方向、每个方向的封面 Hook 和逐页结构，并明确只测试一个变量。`
      : `Read my real performance data and plan the next ${getPlatform(platform).label} experiment. Give me three distinct strategies, each with a cover hook and slide-by-slide structure, and change only one test variable.`
  };
}

function collectMissingData(samples: GrowthMetricSample[], locale: GrowthBriefingLocale): string[] {
  const isZh = locale === "zh";
  const missing: string[] = [];
  if (!samples.some((sample) => sample.views > 0)) missing.push(isZh ? "观看数" : "views");
  if (!samples.some((sample) => sample.coverClickRate > 0)) missing.push(isZh ? "封面点击率" : "cover CTR");
  if (!samples.some((sample) => sample.averageViewSeconds > 0)) missing.push(isZh ? "平均观看时长" : "average view time");
  if (!samples.some((sample) => sample.profileVisits > 0)) missing.push(isZh ? "主页访客" : "profile visits");
  if (!samples.some((sample) => sample.followerGrowth !== 0)) missing.push(isZh ? "涨粉数" : "follower growth");
  return missing;
}

function choosePlatform(samples: GrowthMetricSample[], preferred?: PlatformId): PlatformId {
  if (preferred && samples.some((sample) => sample.platform === preferred)) return preferred;
  const counts = new Map<PlatformId, number>();
  for (const sample of samples) counts.set(sample.platform, (counts.get(sample.platform) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    if (a[0] === "xiaohongshu") return -1;
    if (b[0] === "xiaohongshu") return 1;
    return a[0].localeCompare(b[0]);
  })[0][0];
}

function isPlatformId(value: string): value is PlatformId {
  try {
    getPlatform(value as PlatformId);
    return true;
  } catch {
    return false;
  }
}

function effectiveViews(sample: GrowthMetricSample): number {
  return sample.views > 0 ? sample.views : sample.clicks;
}

function sampleCoverCtr(sample: GrowthMetricSample): number {
  if (sample.coverClickRate > 0) return sample.coverClickRate;
  return sample.impressions > 0 ? rate(effectiveViews(sample), sample.impressions) * 100 : 0;
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rate(value: number, base: number): number {
  return base > 0 ? value / base : 0;
}

function weightedAverage(values: Array<{ value: number; weight: number }>): number {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function compact(value: number): string {
  return new Intl.NumberFormat("zh-CN", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function healthRank(health: GrowthHealth): number {
  return health === "critical" ? 3 : health === "warning" ? 2 : health === "insufficient" ? 1 : 0;
}

function stageRank(stage: GrowthStage): number {
  return ["measurement", "distribution", "click", "retention", "value", "conversion"].indexOf(stage);
}

function headlineForStage(stage: GrowthStage, locale: GrowthBriefingLocale): string {
  const copy: Record<GrowthStage, { zh: string; en: string }> = {
    measurement: { zh: "先建立真实数据闭环", en: "Build the measurement loop first" },
    distribution: { zh: "先修有效曝光", en: "Fix qualified distribution first" },
    click: { zh: "封面承诺是当前优先项", en: "The cover promise is the priority" },
    retention: { zh: "首屏没有及时兑现价值", en: "The opening is not paying off quickly enough" },
    value: { zh: "内容还不够值得收藏和分享", en: "The content is not save-worthy enough yet" },
    conversion: { zh: "读者还没有明确的关注理由", en: "Readers still lack a clear reason to follow" }
  };
  return copy[stage][locale];
}

function metricForStage(stage: Exclude<GrowthStage, "measurement">, locale: GrowthBriefingLocale): string {
  const copy: Record<Exclude<GrowthStage, "measurement">, { zh: string; en: string }> = {
    distribution: { zh: "曝光数", en: "Impressions" },
    click: { zh: "封面点击率", en: "Cover CTR" },
    retention: { zh: "平均观看时长", en: "Average view time" },
    value: { zh: "每千次观看收藏+分享", en: "Saves + shares per 1K views" },
    conversion: { zh: "每千次观看新增关注", en: "New followers per 1K views" }
  };
  return copy[stage][locale];
}

function metricKeyForStage(
  stage: Exclude<GrowthStage, "measurement">
): GrowthExperiment["primaryMetricKey"] {
  const keys: Record<Exclude<GrowthStage, "measurement">, GrowthExperiment["primaryMetricKey"]> = {
    distribution: "impressions",
    click: "cover_click_rate",
    retention: "average_view_seconds",
    value: "save_share_per_thousand",
    conversion: "followers_per_thousand"
  };
  return keys[stage];
}

function metricValueForStage(
  stage: Exclude<GrowthStage, "measurement">,
  baseline: {
    impressionsPerSample: number;
    coverCtr: number;
    watchSeconds: number;
    saveSharePerThousand: number;
    followersPerThousand: number;
  }
): number {
  if (stage === "distribution") return baseline.impressionsPerSample;
  if (stage === "click") return baseline.coverCtr;
  if (stage === "retention") return baseline.watchSeconds;
  if (stage === "value") return baseline.saveSharePerThousand;
  return baseline.followersPerThousand;
}

function thresholdForStage(stage: Exclude<GrowthStage, "measurement">, baselineValue: number): number {
  if (stage === "distribution") return Math.max(baselineValue * 1.2, 100);
  if (stage === "click") return Math.max(baselineValue * 1.15, 3);
  if (stage === "retention") return Math.max(baselineValue * 1.15, 6);
  if (stage === "value") return Math.max(baselineValue * 1.2, 5);
  return Math.max(baselineValue * 1.2, 0.5);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
