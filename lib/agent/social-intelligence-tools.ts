import {
  fetchPublicPageText,
  fetchRedditCreatorPosts,
  fetchRedditSubredditListing,
  redditAboutToCreatorName,
  redditPostsToStyleSamples,
  resolveRedditHandle,
  type RedditListing,
  type RedditPost,
  type RedditTimeRange
} from "@/lib/agent/social-intelligence";
import { analyzeCreatorStyleProfile } from "@/lib/agent/style-profile";
import { fetchHackerNewsDemandSignals } from "@/lib/agent/public-demand-signals";
import { persistPublicDemandSignals } from "@/lib/operations/demand-signals";
import { normalizeExternalHttpUrl, validateExternalHttpUrl } from "@/lib/safe-url";
import {
  searchPublicWebEvidence,
  type WebSearchEvidence
} from "@/lib/agent/web-search-evidence";
import type { AgentToolDefinition } from "@/lib/agent/types";

const UPGRADE_RESULT = {
  upgradeRequired: true,
  message: "外部平台调研需要付费套餐的智能体能力，请引导用户升级套餐（starter 及以上）。"
};

function summarizeRedditPosts(posts: RedditPost[], limit = 12) {
  return posts.slice(0, limit).map((post, index) => ({
    rank: index + 1,
    title: post.title,
    text: (post.selftext ?? "").slice(0, 400),
    score: post.score ?? null,
    comments: post.num_comments ?? null,
    subreddit: post.subreddit ?? null,
    author: post.author ?? null,
    publishedAt: typeof post.created_utc === "number"
      ? new Date(post.created_utc * 1000).toISOString()
      : null,
    url: post.permalink.startsWith("http") ? post.permalink : `https://www.reddit.com${post.permalink}`
  }));
}

const SOURCE_NOTE = {
  sourceType: "public_web",
  reliability: "measured" as const,
  note: "数据来自平台公开接口实时抓取；互动数为抓取时刻的公开计数，不含曝光量。"
};

export const SOCIAL_INTELLIGENCE_TOOLS: AgentToolDefinition[] = [
  {
    name: "research_public_demand_signals",
    description: "通过 Hacker News 官方公开 API 实时搜索与产品问题、品类或购买意图词匹配的公开帖子。结果只是待人工确认的需求信号，不是已验证 lead，不采集联系方式、不自动联系，也不能计入 lead/signup/revenue。",
    parameters: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { type: "string", minLength: 2, maxLength: 50 },
          description: "1-8 个产品品类、用户问题或购买意图词"
        },
        limit: { type: "number", description: "返回候选数，默认 10，最多 20" },
        scanLimit: { type: "number", description: "扫描最新帖子数，默认 60，最多 100" }
      },
      required: ["keywords"]
    },
    mutates: true,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const result = await fetchHackerNewsDemandSignals({
        keywords: args.keywords,
        limit: args.limit,
        scanLimit: args.scanLimit
      });
      if (!result.available) {
        return { fetchUnavailable: true, reason: result.reason, userGuidance: result.userGuidance ?? null };
      }
      const { data: program } = await ctx.admin
        .from("operating_programs")
        .select("id")
        .eq("user_id", ctx.userId)
        .in("status", ["active", "draft", "paused"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const savedSignalCount = await persistPublicDemandSignals(ctx.admin, {
        userId: ctx.userId,
        operatingProgramId: program?.id ?? null,
        capturedAt: result.capturedAt,
        signals: result.signals
      });
      return {
        platform: "hacker-news",
        source: result.source,
        capturedAt: result.capturedAt,
        leadStatus: result.leadStatus,
        signalCount: result.signals.length,
        savedSignalCount,
        signals: result.signals,
        sourceType: "public_web",
        reliability: "measured",
        note: "这些是抓取时刻的公开需求信号，不是已验证 lead；必须通过用户主动访问、提交表单或付款后才能进入对应商业结果。"
      };
    }
  },
  {
    name: "research_platform_hot_posts",
    description: "实时抓取 Reddit 指定社区的热门/最新帖（标题、正文、点赞、评论、链接），用于选题调研、选题灵感验证或竞品内容研究。数据来自 Reddit 公开接口，不是模型记忆；其他平台没有公开接口时不得虚构结果。",
    parameters: {
      type: "object",
      properties: {
        subreddit: { type: "string", description: "社区名，如 marketing 或 r/marketing" },
        listing: { type: "string", enum: ["hot", "top", "new"], description: "hot=当前热门，top=时段最佳（默认），new=最新" },
        timeRange: { type: "string", enum: ["day", "week", "month", "year", "all"], description: "top 模式的时间窗，默认 month" },
        limit: { type: "number", description: "抓取条数，默认 10，最多 25" }
      },
      required: ["subreddit"]
    },
    mutates: false,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const result = await fetchRedditSubredditListing({
        subreddit: String(args.subreddit ?? ""),
        listing: args.listing as RedditListing | undefined,
        timeRange: args.timeRange as RedditTimeRange | undefined,
        limit: args.limit
      });
      if (!result.available) {
        return { fetchUnavailable: true, reason: result.reason, userGuidance: result.userGuidance ?? null };
      }
      return {
        platform: "reddit",
        source: result.source,
        capturedAt: result.capturedAt,
        postCount: result.posts.length,
        posts: summarizeRedditPosts(result.posts),
        ...SOURCE_NOTE
      };
    }
  },
  {
    name: "research_creator_posts",
    description: "实时抓取 Reddit 某位博主的公开发帖历史和公开主页资料（粉丝数、发帖/评论 karma），用于对标研究、判断内容方向。数据来自 Reddit 公开接口；小红书没有公开接口，需用户提供链接或截图导入。",
    parameters: {
      type: "object",
      properties: {
        creator: { type: "string", description: "Reddit 用户名或完整主页链接" },
        timeRange: { type: "string", enum: ["month", "year", "all"], description: "按最佳表现取帖的时间窗，默认 year" },
        limit: { type: "number", description: "抓取条数，默认 12，最多 25" }
      },
      required: ["creator"]
    },
    mutates: false,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const result = await fetchRedditCreatorPosts({
        creator: String(args.creator ?? ""),
        timeRange: args.timeRange as RedditTimeRange | undefined,
        limit: args.limit
      });
      if (!result.available) {
        return { fetchUnavailable: true, reason: result.reason, userGuidance: result.userGuidance ?? null };
      }
      return {
        platform: "reddit",
        source: result.source,
        capturedAt: result.capturedAt,
        creator: {
          handle: `u/${result.handle}`,
          displayName: redditAboutToCreatorName(result.about, result.handle),
          followers: result.about?.subreddit?.subscribers ?? null,
          linkKarma: result.about?.link_karma ?? null,
          commentKarma: result.about?.comment_karma ?? null,
          bio: (result.about?.subreddit?.public_description ?? "").slice(0, 200) || null
        },
        postCount: result.posts.length,
        posts: summarizeRedditPosts(result.posts),
        ...SOURCE_NOTE
      };
    }
  },
  {
    name: "learn_creator_style_from_reddit",
    description: "一条完成对标学习：实时抓取 Reddit 博主的公开发帖历史，自动转成证据样本并分析出可迁移的风格画像（选题、包装、结构、信任、转化）。成功后可调用 save_creator_style_profile 把画像存入品牌记忆。样本不足 3 篇时如实说明并引导补料，不会编造样本。",
    parameters: {
      type: "object",
      properties: {
        creator: { type: "string", description: "Reddit 用户名或完整主页链接" },
        timeRange: { type: "string", enum: ["month", "year", "all"], description: "取最佳发帖的时间窗，默认 year" },
        maxSamples: { type: "number", description: "参与分析的样本数上限，默认 8，最多 12" }
      },
      required: ["creator"]
    },
    mutates: false,
    requiresAgentTools: true,
    async execute(args, ctx) {
      if (!ctx.agentToolsEnabled) return UPGRADE_RESULT;
      const handle = resolveRedditHandle(String(args.creator ?? ""));
      if (!handle) {
        return {
          needsInput: true,
          message: "请提供 Reddit 用户名（3-20 个字符），或直接粘贴 reddit.com/user/... 的主页链接。"
        };
      }
      const fetched = await fetchRedditCreatorPosts({
        creator: handle,
        timeRange: args.timeRange as RedditTimeRange | undefined,
        limit: 25
      });
      if (!fetched.available) {
        return { fetchUnavailable: true, reason: fetched.reason, userGuidance: fetched.userGuidance ?? null };
      }
      const { samples, skipped } = redditPostsToStyleSamples(fetched.posts, {
        maxSamples: Math.min(Number(args.maxSamples) || 8, 12)
      });
      if (samples.length < 3) {
        return {
          needsInput: true,
          fetchedPosts: fetched.posts.length,
          usableSamples: samples.length,
          skipped,
          message: `这位博主近期公开帖里只有 ${samples.length} 篇带足够文字，不足 3 篇。可以让用户补充粘贴 2-3 篇代表帖原文，或换一位文字内容更多的博主。`
        };
      }
      const creatorName = redditAboutToCreatorName(fetched.about, fetched.handle);
      const profileUrl = `https://www.reddit.com/user/${fetched.handle}/`;
      const creatorStyleProfile = await analyzeCreatorStyleProfile(ctx, {
        creatorName,
        profileUrl,
        samples
      });
      return {
        creatorStyleProfile,
        evidence: {
          source: fetched.source,
          capturedAt: fetched.capturedAt,
          sampleCount: samples.length,
          skippedSampleCount: skipped.length,
          followerCount: fetched.about?.subreddit?.subscribers ?? null,
          reliability: "measured",
          note: "样本来自 Reddit 公开接口实时抓取；点赞与评论为公开计数。"
        },
        nextActions: [
          "把画像存入品牌记忆",
          "基于画像生成 3 个选题实验",
          "用可迁移规则改写下一篇内容"
        ]
      };
    }
  },
  {
    name: "fetch_public_pages",
    description: "读取 1-3 个公开网页的标题和正文文本；若直接访问遇到反爬、登录墙或脚本渲染，会自动尝试带来源的联网检索恢复证据。用于调研用户给出的竞品页、文章和公开帖子；两种通道都失败时如实说明，不得假装读到了全文。",
    parameters: {
      type: "object",
      properties: {
        urls: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: { type: "string", description: "完整 https 链接" }
        },
        purpose: { type: "string", description: "这次读取要调研什么，一句话" }
      },
      required: ["urls"]
    },
    mutates: false,
    // Reading URLs the user explicitly supplied is a baseline Agent ability.
    // Discovery and platform research remain plan-gated above.
    requiresAgentTools: false,
    async execute(args) {
      const rawUrls = Array.isArray(args.urls) ? args.urls.slice(0, 3) : [];
      const urls = rawUrls.flatMap((value) => {
        if (typeof value !== "string" || !value.trim()) return [];
        try {
          const url = validateExternalHttpUrl(normalizeExternalHttpUrl(value));
          return url.protocol === "https:" || url.protocol === "http:" ? [url.toString()] : [];
        } catch {
          return [];
        }
      });
      if (urls.length === 0) {
        return { error: "请提供 1-3 个有效的 http/https 链接。" };
      }
      const pages = await Promise.all(urls.map(async (url) => {
        try {
          const page = await fetchPublicPageText(url);
          return {
            requestedUrl: url,
            url: page.url,
            title: page.title,
            text: page.text.slice(0, 4_000),
            ok: page.ok && !page.loginWalled && page.text.trim().length >= 60,
            limitation: page.limitation,
            xhsImportHint: page.isXiaohongshu && (page.loginWalled || page.text.trim().length < 60)
              ? "请在小红书 App 中复制该笔记的文字内容粘贴给我，或上传笔记截图。"
              : null
          };
        } catch {
          return {
            requestedUrl: url,
            url,
            title: "",
            text: "",
            ok: false,
            limitation: "页面请求失败或返回内容过大。",
            xhsImportHint: null
          };
        }
      }));
      const unavailableUrls = pages
        .filter((page) => !page.ok)
        .map((page) => page.requestedUrl);
      let indexedEvidence: WebSearchEvidence | null = null;
      if (unavailableUrls.length > 0) {
        try {
          indexedEvidence = await searchPublicWebEvidence({
            targetUrls: unavailableUrls,
            userRequest: typeof args.purpose === "string"
              ? args.purpose
              : `读取这些公开网页：${unavailableUrls.join(", ")}`
          });
        } catch {
          indexedEvidence = {
            available: false as const,
            reason: "provider_failed" as const,
            limitation: "带来源联网检索本次超时或服务不可用。",
            targetUrls: unavailableUrls
          };
        }
      }
      return {
        pages,
        indexedEvidence,
        reliability: "observed",
        capturedAt: new Date().toISOString()
      };
    }
  }
];
