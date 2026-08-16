import type { GrowthMission } from "@/lib/agent/growth-missions";
import type { KitOutput } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import type { VisualStoryTheme } from "@/lib/visual-story";

export type ContentSkillId =
  | "xhs-native-carousel"
  | "wechat-editorial-package"
  | "zhihu-answer-package"
  | "x-thread-media-package"
  | "article-visual-package"
  | "motion-storyboard"
  | "social-cover";

export type ContentSkillStrategy = "story-driven" | "information-dense" | "visual-first";
export type ContentSkillLayout = "sparse" | "balanced" | "dense" | "comparison" | "flow" | "checklist";

export type ContentSkillPlan = {
  id: ContentSkillId;
  name: string;
  outcome: string;
  rationale: string;
  strategy: ContentSkillStrategy;
  layout: ContentSkillLayout;
  theme: VisualStoryTheme;
  steps: string[];
  primaryAction: "story" | "cover" | "illustrations" | "publication";
  missionMetricKey?: GrowthMission["primaryMetricKey"];
};

type MissionInput = Pick<GrowthMission, "primaryMetricKey" | "primaryMetric" | "hypothesis">;

export function buildContentSkillPlan(
  output: Pick<KitOutput, "platform" | "title" | "body" | "finalBody" | "cta">,
  locale: Locale,
  mission?: MissionInput | null
): ContentSkillPlan {
  const isZh = locale === "zh";
  const source = `${output.title}\n${output.finalBody || output.body}\n${output.cta}`;

  if (output.platform === "xiaohongshu") {
    const selection = selectXhsStrategy(source, mission?.primaryMetricKey);
    return {
      id: "xhs-native-carousel",
      name: isZh ? "小红书原生图文 Skill" : "Xiaohongshu native carousel",
      outcome: mission?.primaryMetric || (isZh ? selection.outcomeZh : selection.outcomeEn),
      rationale: mission
        ? (isZh
            ? `本轮只围绕「${mission.primaryMetric}」组织内容，不同时改动所有变量。`
            : `This run is organized around “${mission.primaryMetric}” without changing every variable at once.`)
        : (isZh ? selection.rationaleZh : selection.rationaleEn),
      strategy: selection.strategy,
      layout: selection.layout,
      theme: selection.theme,
      steps: isZh
        ? [
            "把封面承诺压缩成一个可验证结果或具体场景",
            "按一页一个信息任务拆成 5–9 页",
            selection.stepZh,
            "最后一页交付可保存结论，并给出明确的长期关注理由"
          ]
        : [
            "Compress the cover promise into one verifiable outcome or concrete situation",
            "Split the story into 5–9 pages with one information job per page",
            selection.stepEn,
            "End with a save-worthy takeaway and a durable reason to follow"
          ],
      primaryAction: "story",
      missionMetricKey: mission?.primaryMetricKey
    };
  }

  if (output.platform === "wechat") {
    return {
      id: "wechat-editorial-package",
      name: isZh ? "公众号文章发布 Skill" : "WeChat editorial publishing skill",
      outcome: isZh ? "打开率、读完率与转发" : "Open rate, completion, and sharing",
      rationale: isZh
        ? "先把观点、证据与段落节奏整理成文章，再生成内联样式 HTML、封面和配图清单。"
        : "Structure thesis, evidence, and reading rhythm first, then produce inline HTML, cover, and illustration placements.",
      strategy: "information-dense",
      layout: /\b(vs\.?|before|after)\b|对比|前后/u.test(source) ? "comparison" : "flow",
      theme: "editorial",
      steps: isZh
        ? ["前 100 字直接兑现标题承诺", "每一节只推进一个新观点", "为证据、流程和对比安排配图", "生成公众号兼容 HTML 与发布元数据"]
        : ["Pay off the title promise in the first 100 characters", "Advance one new idea per section", "Place visuals at evidence, process, and comparison moments", "Generate WeChat-compatible HTML and publishing metadata"],
      primaryAction: "publication",
      missionMetricKey: mission?.primaryMetricKey
    };
  }

  if (output.platform === "zhihu") {
    return {
      id: "zhihu-answer-package",
      name: isZh ? "知乎回答发布 Skill" : "Zhihu answer publishing skill",
      outcome: isZh ? "赞同、收藏与高质量讨论" : "Upvotes, saves, and qualified discussion",
      rationale: isZh
        ? "先把问题、判断和证据关系理顺，再准备题图与发布前披露，不把产品软文塞进无关问题。"
        : "Align the question, judgment, and evidence first, then prepare the editorial visual and required publishing disclosures.",
      strategy: "information-dense",
      layout: /\b(vs\.?|before|after)\b|对比|取舍|区别/u.test(source) ? "comparison" : "flow",
      theme: "editorial",
      steps: isZh
        ? [
            "确认回答真正接住了一个具体问题",
            "开头直接给出有边界的判断",
            "让每个主要段落都有事实、经验、案例或明确推理",
            "发布前核对来源，并勾选“包含 AI 辅助创作”、披露利益关系"
          ]
        : [
            "Make sure the draft answers one concrete question",
            "Open with a bounded judgment",
            "Ground every major section in evidence, experience, an example, or explicit reasoning",
            "Verify sources, declare AI assistance, and disclose relevant commercial relationships before publishing"
          ],
      primaryAction: "publication",
      missionMetricKey: mission?.primaryMetricKey
    };
  }

  if (output.platform === "x") {
    return {
      id: "x-thread-media-package",
      name: isZh ? "X 串文与配图包" : "X thread and media package",
      outcome: isZh ? "串文读完、有效回复与后续点击" : "Thread completion, qualified replies, and downstream clicks",
      rationale: isZh
        ? "先让每条串文独立成立，再用少量配图承接复杂证据或对比；不要把同一篇长文硬拆成多条。"
        : "Make every post stand on its own, then use a small media set for evidence or comparison instead of slicing one long post apart.",
      strategy: "story-driven",
      layout: "flow",
      theme: "signal",
      steps: isZh
        ? ["首条交付明确张力和读者回报", "拆成 5–12 条可独立理解的编号串文", "每 2–3 条只配一张服务于证据或对比的方图", "最后一条提出一个真实问题，并把外链留给回复区"]
        : ["Make the opening post state a clear tension and reader payoff", "Build a 5–12 post numbered thread with standalone value", "Attach one square evidence or comparison card for every 2–3 posts", "End with a genuine question and keep external links for the reply"],
      primaryAction: "story",
      missionMetricKey: mission?.primaryMetricKey
    };
  }

  if (output.platform === "medium-substack") {
    return {
      id: "article-visual-package",
      name: isZh ? "长文视觉发布 Skill" : "Long-form visual publishing skill",
      outcome: isZh ? "阅读完成与订阅转化" : "Reading completion and subscriptions",
      rationale: isZh ? "用编辑部式长文结构、原文证据配图和可复制 HTML 形成完整交付。" : "Combine editorial structure, evidence-bound illustrations, and reusable HTML.",
      strategy: "information-dense",
      layout: "flow",
      theme: "editorial",
      steps: isZh
        ? ["首屏明确论点", "每 300–500 字设置导航小标题", "只在有信息价值的位置配图", "导出独立 HTML 与分享图"]
        : ["State the thesis above the fold", "Add navigation headings every 300–500 words", "Illustrate only information-bearing moments", "Export standalone HTML and a social preview"],
      primaryAction: "publication",
      missionMetricKey: mission?.primaryMetricKey
    };
  }

  const visualFirst = ["instagram", "facebook", "threads"].includes(output.platform);
  return {
    id: visualFirst ? "motion-storyboard" : "social-cover",
    name: visualFirst
      ? (isZh ? "动态社交故事板 Skill" : "Motion social storyboard")
      : (isZh ? "高信号社交封面 Skill" : "High-signal social cover"),
    outcome: isZh ? "停留、互动与点击" : "Retention, engagement, and clicks",
    rationale: visualFirst
      ? (isZh ? "把正文拆成可编辑的内容图谱与逐帧节奏，后续可交给视频渲染器。" : "Turn the copy into an editable content graph and timed frames ready for a renderer.")
      : (isZh ? "把核心判断压缩成一个平台原生视觉入口。" : "Compress the core claim into one platform-native visual entry point."),
    strategy: visualFirst ? "visual-first" : "information-dense",
    layout: visualFirst ? "sparse" : "balanced",
    theme: /\b(ai|data|system|code|saas)\b|数据|系统|代码|AI/iu.test(source) ? "signal" : "field-notes",
    steps: visualFirst
      ? (isZh ? ["建立内容图谱", "分配逐帧信息任务", "校验首帧与结尾动作", "导出动态 HTML 与渲染清单"] : ["Build the content graph", "Assign one job per frame", "Validate opening and ending", "Export animated HTML and the render manifest"])
      : (isZh ? ["提炼唯一主张", "匹配平台尺寸", "保持品牌视觉", "导出高清图片"] : ["Extract one claim", "Match platform dimensions", "Apply brand visual memory", "Export a high-resolution image"]),
    primaryAction: visualFirst ? "story" : "cover",
    missionMetricKey: mission?.primaryMetricKey
  };
}

function selectXhsStrategy(source: string, metricKey?: GrowthMission["primaryMetricKey"]) {
  if (metricKey === "cover_click_rate" || metricKey === "impressions") {
    return {
      strategy: "visual-first" as const,
      layout: "sparse" as const,
      theme: "signal" as const,
      outcomeZh: "封面点击与有效曝光",
      outcomeEn: "Cover clicks and qualified reach",
      rationaleZh: "当前先解决读者为什么要点开，而不是继续增加正文信息量。",
      rationaleEn: "Fix why someone should open the post before adding more body detail.",
      stepZh: "保持正文基本不变，只测试封面 Hook 与首屏兑现",
      stepEn: "Hold the body steady and test only the cover hook and first-screen payoff"
    };
  }
  if (metricKey === "average_view_seconds") {
    return {
      strategy: "story-driven" as const,
      layout: "flow" as const,
      theme: "field-notes" as const,
      outcomeZh: "阅读停留",
      outcomeEn: "Reading retention",
      rationaleZh: "用结论先行与逐步展开减少点开后的落差。",
      rationaleEn: "Use conclusion-first sequencing to reduce the gap after the click.",
      stepZh: "第二页立即兑现封面承诺，之后再补背景与过程",
      stepEn: "Pay off the cover promise on page two before adding context"
    };
  }
  if (metricKey === "followers_per_thousand") {
    return {
      strategy: "story-driven" as const,
      layout: "balanced" as const,
      theme: "field-notes" as const,
      outcomeZh: "关注转化",
      outcomeEn: "Follower conversion",
      rationaleZh: "把单篇内容变成一个可持续栏目承诺。",
      rationaleEn: "Turn the individual post into a durable recurring promise.",
      stepZh: "用真实经历建立人设，并在结尾预告下一篇具体交付",
      stepEn: "Use lived experience to establish identity and tease the exact next delivery"
    };
  }
  if (metricKey === "save_share_per_thousand" || hasStructuredValueSignal(source)) {
    return {
      strategy: "information-dense" as const,
      layout: "checklist" as const,
      theme: "editorial" as const,
      outcomeZh: "收藏与分享",
      outcomeEn: "Saves and shares",
      rationaleZh: "把观点转换成读者能复用的清单、模板或对比。",
      rationaleEn: "Convert the argument into a reusable checklist, template, or comparison.",
      stepZh: "至少交付一个可截图保存的清单、模板或前后对比",
      stepEn: "Deliver at least one screenshot-worthy checklist, template, or before/after"
    };
  }
  return {
    strategy: "story-driven" as const,
    layout: "balanced" as const,
    theme: "field-notes" as const,
    outcomeZh: "停留与信任",
    outcomeEn: "Retention and trust",
    rationaleZh: "当前素材更适合从真实场景进入，再逐步交付方法。",
    rationaleEn: "The source is better served by a real situation followed by a practical method.",
    stepZh: "先写人物、动作与代价，再给出方法和证据",
    stepEn: "Name the person, action, and cost before delivering the method and proof"
  };
}

function hasStructuredValueSignal(source: string): boolean {
  return /(?:^|\n)\s*(?:[-*•]|\d+[.)、])|清单|模板|步骤|对比|checklist|template|steps|comparison/imu.test(source);
}
