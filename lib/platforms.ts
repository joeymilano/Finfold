import {
  BookOpenText,
  BriefcaseBusiness,
  Facebook,
  Flame,
  Hash,
  Instagram,
  MessageCircle,
  Rocket,
  Send,
  Sparkles,
  Store,
  Users,
  type LucideIcon
} from "@/components/ui/icons";

export type PlatformId =
  | "wechat"
  | "xiaohongshu"
  | "zhihu"
  | "moments"
  | "x"
  | "linkedin"
  | "instagram"
  | "facebook"
  | "reddit"
  | "product-hunt"
  | "threads"
  | "hacker-news"
  | "indie-hackers"
  | "medium-substack";

export type Platform = {
  id: PlatformId;
  label: string;
  shortLabel: string;
  region: "China" | "Global";
  icon: LucideIcon;
  bestFor: string;
  voice: string;
  constraints: string[];
  charLimit: number;
  viralPatterns: string[];
  avoidList: string[];
  tagStrategy: string;
};

const englishPlatformLabels: Record<PlatformId, string> = {
  wechat: "WeChat Official Account",
  xiaohongshu: "Xiaohongshu / RED",
  zhihu: "Zhihu",
  moments: "WeChat Moments",
  x: "X / Twitter",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  reddit: "Reddit",
  "product-hunt": "Product Hunt",
  threads: "Threads",
  "hacker-news": "Hacker News",
  "indie-hackers": "Indie Hackers",
  "medium-substack": "Newsletter / Substack"
};

export function getLocalizedPlatformLabel(id: PlatformId, locale: "zh" | "en", short = false): string {
  const platform = getPlatform(id);
  return locale === "en" ? englishPlatformLabels[id] : short ? platform.shortLabel : platform.label;
}

export const platforms: Platform[] = [
  {
    id: "wechat",
    label: "微信公众号",
    shortLabel: "公众号",
    region: "China",
    icon: BookOpenText,
    bestFor: "长文叙事、信任建设、深度价值解释，适合沉淀可转发资产。",
    voice: "完整故事结构，先立问题再给解法，小标题分层，金句单独成行，语气像朋友圈里信任的人写的深度文章。",
    constraints: [
      "标题控制在25字以内，前10字必须包含核心关键词",
      "开篇100字要有悬念或痛点共鸣，不能直接介绍产品",
      "每段不超过5行，每800字设一个加粗小标题",
      "核心金句单独成行加粗，让'扫读者'也能获得价值",
      "结尾引导分享或关注，给出明确但不强迫的下一步"
    ],
    charLimit: 5000,
    viralPatterns: [
      "痛点确认 → 原因揭秘 → 反常识解法 → 可操作步骤 → 升华结论",
      "对比叙事：别人怎么做 vs 你怎么做，数字说话",
      "故事型：从一个真实场景切入，经历→转折→启发→方法论",
      "利益承诺型：标题直接说明读完能得到什么（省钱/时间/避坑）",
      "嘴替型：说出大多数人想说但没说的话，激活转发欲望"
    ],
    avoidList: [
      "纯介绍产品功能，没有读者视角",
      "标题太长或太模糊（如'关于XXX的一些思考'）",
      "每段超过8行，没有小标题，视觉压抑",
      "结尾无互动引导，读完就走",
      "AI八股句式：'值得注意的是''综上所述''不言而喻''此外还有'",
      "空洞形容词堆叠：'革命性''颠覆性''开创性'"
    ],
    tagStrategy: "公众号无标签系统，靠标题关键词和内容匹配推荐流，标题里自然融入2-3个精准搜索词即可"
  },
  {
    id: "xiaohongshu",
    label: "小红书",
    shortLabel: "小红书",
    region: "China",
    icon: Sparkles,
    bestFor: "痛点发现、情绪钩子、收藏驱动、素人种草，搜索流量入口。",
    voice: "像真实用户的亲身经历分享，有痛点有故事有具体结果，不像广告，语气口语化，每段超短，大量换行，结尾引导收藏和评论。",
    constraints: [
      "标题尽量控制在20字内，明确场景、对象或收益，避免空泛悬念",
      "正文写到足以解决问题，不迷信固定字数门槛",
      "图文优先按3:4竖版轮播设计：封面只承诺一件事，后续每页只完成一个信息任务",
      "产品截图必须裁切、放大并标注重点，不把完整横向界面缩成无法阅读的小图",
      "发布图片不得包含用于站外导流的二维码、网址、微信号或第三方平台水印；发布前逐张检查",
      "使用短段落、小标题和留白，优先保证移动端可读性",
      "用emoji作视觉分隔（不超过每段一个），如✅❌🔥💡",
      "结尾给出可执行下一步；只有适合讨论时才提出具体问题",
      "只使用与受众、场景和主题高度相关的话题标签"
    ],
    charLimit: 1500,
    viralPatterns: [
      "痛点开头 → 我也经历过 → 发现这个方法 → 具体步骤 → 结果对比 → 收藏价值点",
      "数字型：'做了X件事/用了X天/省了X元'，数字要具体真实",
      "对比型：'以前这样/现在这样'，视觉冲击，适合前后对比",
      "清单型：'X个你不知道的...'，条目式，适合收藏",
      "反常识型：挑战一个目标读者默认认知，并在第二页立即给证据"
    ],
    avoidList: [
      "大段文字不换行（直接导致用户划走）",
      "开头只有产品名称和功能清单，没有读者场景或价值",
      "未核对事实、未人工编辑或未按适用规则披露的 AI 辅助内容",
      "没有证据却使用“99%的人”“人人都在”等伪统计标题",
      "把完整横屏网页截图直接塞进竖版卡片，导致核心信息不可读",
      "在封面、轮播图或产品截图中保留站外导流二维码、联系方式或第三方平台水印",
      "标题超过20字或信息量过密",
      "堆砌无关热门话题，带来错误流量",
      "与正文无关的收藏、评论或关注诱导"
    ],
    tagStrategy: "选择少量高度相关的话题：覆盖受众、使用场景和具体主题；数量不是目标，匹配度和搜索意图才是。"
  },
  {
    id: "zhihu",
    label: "知乎",
    shortLabel: "知乎",
    region: "China",
    icon: MessageCircle,
    bestFor: "专业解释、经验复盘、搜索沉淀与可信观点，适合回答用户正在认真追问的问题。",
    voice: "像一个确实做过功课、愿意把来龙去脉讲清楚的人。先接住问题，再用事实、经验和推理往下讲；敢下判断，也诚实说明证据边界。",
    constraints: [
      "优先写成问答：标题字段给出要回答的具体问题或文章选题，正文开头直接回应，不用“谢邀”或空泛预告",
      "每个关键判断都要靠用户素材、可核验来源或明确推理支撑；不得编造亲历、客户故事、数据、引语和来源",
      "一个回答集中讲透一到两个最有把握的判断；新段落必须增加事实、动作、区别、例外或后果",
      "长文可用少量小标题帮助定位，但不要把全文硬拆成模板化的三点、五步和整齐排比",
      "商业关系、产品身份和利益关联要透明；正文先提供独立价值，行动引导保持克制",
      "使用 AI 辅助生成后，发布时主动勾选“包含 AI 辅助创作”，并由发布者完成人工修改与事实核查"
    ],
    charLimit: 8000,
    viralPatterns: [
      "直答型：先给有边界的判断 → 说明依据 → 处理最关键的例外 → 给读者可执行的下一步",
      "经验复盘型：具体处境 → 做过什么 → 哪里失败或改变判断 → 当前更可靠的做法",
      "机制解释型：先描述现象 → 拆出真正起作用的环节 → 用案例或数据验证 → 说明适用范围",
      "决策对比型：明确比较对象 → 统一比较条件 → 写清成本与取舍 → 给不同人不同建议",
      "资料考证型：交代信息来路 → 区分事实、当事人自述与作者推断 → 收住无法确认的部分"
    ],
    avoidList: [
      "答非所问，拿一个通用产品软文硬套进热门问题",
      "伪造第一人称经历、案例、精确数字、对话或权威来源",
      "标题党、夸张承诺、情绪煽动和没有证据的群体判断",
      "批量发布未经人工编辑、事实核查或未声明的 AI 内容",
      "开头堆背景、概念和套话，迟迟不回答读者的问题",
      "用“私信领取”“关注后发链接”等导流话术替代正文价值",
      "为了显得全面而重复同一观点，或用整齐清单凑长文"
    ],
    tagStrategy: "知乎不靠正文堆话题标签。优先匹配一个真实、相关且仍有讨论价值的问题，再绑定少量准确话题；问题相关性、专业可信度与正向互动比标签数量更重要。"
  },
  {
    id: "moments",
    label: "朋友圈",
    shortLabel: "朋友圈",
    region: "China",
    icon: Users,
    bestFor: "创始人人设、项目进展、熟人信任、私域流量激活。",
    voice: "像给认识你的朋友发消息，保留真实人味，分享正在发生的事，软性传递产品价值，不像发广告。",
    constraints: [
      "控制在100-200字以内，朋友圈不适合长文",
      "开头直接进入状态：'最近在做''刚完成了''发现了一件有意思的事'",
      "不直接说'快来买''点击链接'，把行动引导放到最后一句",
      "可以流露真实情绪：兴奋、困惑、惊喜，让人看到真实的人",
      "配图选择真实场景截图或工作现场，避免过度设计的海报"
    ],
    charLimit: 200,
    viralPatterns: [
      "项目进展型：'做了X个月，终于...'，分享里程碑",
      "发现型：'最近发现一个...'，分享有用的事物",
      "反思型：'做这件事让我意识到...'，输出思考",
      "求助型：'在想一个问题，帮我看看...'，引发互动",
      "结果展示型：用数字说话，如'上周发出去，有X个人私信了'"
    ],
    avoidList: [
      "大量广告词汇（限时/优惠/立即购买）",
      "超过300字的长文（朋友圈读者没耐心）",
      "多个链接或二维码（过于商业化）",
      "完全没有个人观点的转发内容",
      "每天多次发布（变成刷屏，被屏蔽）"
    ],
    tagStrategy: "朋友圈无标签系统，靠内容本身的可分享性和人设一致性积累私域影响力"
  },
  {
    id: "x",
    label: "X / Twitter",
    shortLabel: "X",
    region: "Global",
    icon: Hash,
    bestFor: "强观点、创始人叙事、发布动能、公开迭代，out-of-network 算法分发。",
    voice: "Sharp, compressed, international. Every sentence earns the next. No throat-clearing. Open with a clear reason for the reader to continue.",
    constraints: [
      "First line should work standalone and state the audience, tension, change, or payoff",
      "Each tweet in a thread: 150–240 characters, one clear idea, can stand alone",
      "Thread length: 5–12 tweets (longer = higher drop-off)",
      "Choose in-post or reply link placement based on the conversion goal, then measure clicks and downstream conversion",
      "No 'just sharing some thoughts' openers — drop in the middle of the action",
      "Use a specific question only when a genuine discussion would improve the post"
    ],
    charLimit: 280,
    viralPatterns: [
      "Contrarian take: 'Most [people/advice] about X is wrong. Here's why:' → numbered breakdown",
      "Story hook: '[Number] months ago I was [bad state]. Today [good state]. Here's what changed:'",
      "Specific list: 'X things I learned building [thing] that I wish someone told me:'",
      "Bold claim + proof: State a controversial opinion in line 1, defend with evidence in the thread",
      "Value thread: 'I spent [time/money] researching X so you don't have to. Thread:'"
    ],
    avoidList: [
      "Opening with 'I think' or 'Just wanted to share' without explaining why the reader should care",
      "Assuming link placement is a universal algorithm rule instead of testing it against the goal",
      "Generic AI buzzwords: 'game-changing', 'revolutionize', 'unlock your potential'",
      "Engagement bait: 'Like if you agree', 'Comment YES' — X flags these",
      "Posting when your audience is offline — posts expire before they reach late arrivals",
      "Mass reposting the same content — X deduplication filter removes these"
    ],
    tagStrategy: "1–2 hashtags maximum, or none at all. X's algorithm uses semantic understanding, not hashtag matching. Hashtag overuse signals spam."
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    shortLabel: "LinkedIn",
    region: "Global",
    icon: BriefcaseBusiness,
    bestFor: "B2B 可信度、创始人故事、专业受众，精准分发而非病毒传播。",
    voice: "Founder narrative meets professional insight. Start with a tension or conflict, build to a specific lesson, end with a question that invites real replies.",
    constraints: [
      "Establish the topic and reader value early, before longer content is folded in the feed",
      "Place links where they best serve the goal and measure both reach and downstream conversion",
      "End with one specific question only when it invites useful discussion",
      "Use only a small set of highly relevant hashtags; do not pad the post to hit a formula",
      "Post spacing: leave blank lines between every 1–2 sentences for scanability",
      "Respond to substantive comments while the discussion is active, without treating 60 minutes as a guaranteed ranking window"
    ],
    charLimit: 3000,
    viralPatterns: [
      "Tension opener → Background → 3-7 bullet lessons → Specific question",
      "Story arc: 'X months ago [failure/problem] → What I tried → What actually worked → The lesson'",
      "Carousel format described in text: promise X insights, deliver numbered points",
      "Contrarian insight: 'Everyone says [common advice]. Here's what I actually found:'",
      "Transparent numbers: 'We went from $0 to $X in Y months. Here's the honest breakdown:'"
    ],
    avoidList: [
      "Several self-focused opening lines before explaining why the topic matters to the reader",
      "Vague inspirational content: 'Success takes hard work!' with no specific insight",
      "Engagement bait: 'Comment YES to get this resource', emoji polls, 'Like if you agree'",
      "Tag-baiting irrelevant people to boost reach — spam signal",
      "AI-flavor phrases: 'In today's fast-paced world', 'It's no secret that', 'At the end of the day'",
      "Hashtag padding or irrelevant broad tags",
      "Long paragraphs without line breaks — kills scannability"
    ],
    tagStrategy: "Use a small set of highly relevant topic and audience tags when they improve discovery. Test against comparable posts instead of relying on a fixed count."
  },
  {
    id: "instagram",
    label: "Instagram",
    shortLabel: "Instagram",
    region: "Global",
    icon: Instagram,
    bestFor: "视觉叙事、品牌建设、生活方式与幕后、Reels/Explore 拉新、强种草转化。",
    voice: "Visual-first, aspirational but real. The hook lives in the first two lines before '…more'. Emoji is punctuation, not decoration. Sounds like a person behind a brand, not a brand behind a logo.",
    constraints: [
      "CRITICAL: 前 ~125 字符（约 2 行）是 '…more' 折叠前唯一可见的部分——钩子永远放在这里",
      "Reels 是 2025 年的主要拉新引擎——文案必须配一条竖屏 9:16 Reel 或 3–10 页轮播；单张方图几乎没有触达",
      "标签：只用 3–5 个。Instagram 现在依赖语义匹配，20–30 个标签会被判为垃圾并降权",
      "正文里的链接不可点击——绝不贴 URL，用 'link in bio' 或 Story 链接贴纸",
      "轮播要为滑动而设计：第 1 页是封面（让人停下拇指的标题+视觉），2–N 页每页一个要点，最后一页驱动收藏/分享",
      "为图片写 alt text——它辅助无障碍访问，也喂给 Explore/关键词搜索"
    ],
    charLimit: 2200,
    viralPatterns: [
      "轮播教学：'building X 时我学到的 5 件事'——每页一个要点，最后一页给出值得收藏的结论",
      "Reel 模式中断：第一帧打破预期 + 3 秒文字钩子 + 快速给出回报（完播率才是算法）",
      "Before/After 视觉对比，文案保持简短",
      "POV/共鸣 Reel：'POV: 你是这样的创始人……'——借用热门音频，粗糙真实胜过精致",
      "清单轮播：强封面页（'你正在犯的 X 个错误'）+ 编号分页 + 收藏 CTA"
    ],
    avoidList: [
      "标签堆砌（20–30 个）——Instagram 2025 算法将其判为垃圾并削减触达",
      "只发方图或横图——9:16 Reels 和 4:5 信息流版式占屏更多、排名更高",
      "首行没有钩子的文案——没人会为慢热开头点开 '…more'",
      "带 TikTok 水印的 Reels——Instagram 明确降权竞品水印内容",
      "买粉或加入互动群——检测会连累你已有粉丝的触达",
      "纯文字无配图——Instagram 不是写长文的地方"
    ],
    tagStrategy: "3–5 hashtags：1 个大词（#startup）+ 2–3 个垂直长尾（#buildinpublic、#indiehacker）。放在文案末尾或第一条评论里。相关性胜过数量——语义匹配意味着正文本身的措辞比标签更重要。"
  },
  {
    id: "facebook",
    label: "Facebook",
    shortLabel: "Facebook",
    region: "Global",
    icon: Facebook,
    bestFor: "社群运营、中高龄/本地受众、活动推广、Groups 私域、原生视频与直播拉新。",
    voice: "Conversational and community-minded, like a post in a group you belong to. Slightly longer and more personal than Instagram. Always leaves room for a reply — comments are the #1 ranking signal.",
    constraints: [
      "把完整信息放在前 ~3 行——Facebook 在移动端约 6 行 / ~477 字符后用 'See more' 折叠",
      "原生视频（Reels、直播）在 2025 年触达最高；视频直接上传，绝不外链 YouTube/TikTok",
      "提一个具体问题——评论对算法的驱动力远大于点赞",
      "避免正文里放外链——Facebook 大幅降权带链接帖子；把链接放第一条评论",
      "务必配图或视频——纯文字帖互动量约为三分之一",
      "要拿自然触达，发到相关 Facebook Groups，别只发主页——主页在不投流时触达几乎为零"
    ],
    charLimit: 500,
    viralPatterns: [
      "故事 + 开放式提问：一段简短个人经历，结尾 '你会怎么做？'",
      "原生视频教程或幕后，直接上传到 Facebook（不是链接）",
      "里程碑 + 真诚致谢——'我们刚到 X。感谢这些人：'并 @ 真实的人",
      "社群辩论：一个克制的争议观点，邀请双方来评论",
      "直播官宣：发布或大消息时开播，并保留回放"
    ],
    avoidList: [
      "正文里放外链——Facebook 算法会大幅降权",
      "无图无视频的纯文字帖",
      "标题党（'你绝不会相信……''这一招……'）——Facebook 会标记并降权",
      "互动诱饵（'同意请点赞''评论 YES''@ 一个朋友'）——Facebook 明确降权",
      "过度官方、新闻稿腔调——Facebook 奖励人味",
      "带 TikTok 水印的搬运内容"
    ],
    tagStrategy: "0–2 个标签，或不用。Facebook 算法不靠标签分发——触达来自分享、评论、原生视频和 Groups。一堆标签既像垃圾又毫无增益。"
  },
  {
    id: "reddit",
    label: "Reddit",
    shortLabel: "Reddit",
    region: "Global",
    icon: MessageCircle,
    bestFor: "社区讨论、用户调研、问题验证、真实反馈，建立社区存在感。",
    voice: "Sound like a real community member asking a genuine question or sharing a hard-won lesson — not a marketer. Lead with value, earn trust before mentioning your product.",
    constraints: [
      "Read the current subreddit rules and pinned threads before drafting; promotion and link policies differ by community",
      "Frame the post around useful experience or a genuine question, and disclose your relationship to the product",
      "Include enough specific context to make the post useful on its own",
      "Build a history of real participation; the historical 10% guideline is not a universal sitewide threshold",
      "Use a CTA only where the current community rules allow it, and keep it transparent and restrained",
      "Never disguise a commercial relationship as an independent recommendation"
    ],
    charLimit: 10000,
    viralPatterns: [
      "Lesson-sharing: 'I spent X building Y, here are Z things I learned (no product pitch)'",
      "Question frame: 'How do you all handle [specific problem]? I've been trying [approach] and...'",
      "AMA-style: 'I've done X for Y years, happy to share what I've learned' — requires mod approval on r/startups",
      "Discussion starter: 'Controversial opinion: [take]. What's your experience?'",
      "Genuine ask: 'Built something to solve my own problem. What would make this genuinely useful to you?'"
    ],
    avoidList: [
      "Product names or links that violate the current subreddit's promotion rules",
      "Marketing language: 'revolutionary', 'game-changing', 'we built the solution to this'",
      "Fake grassroots: multiple accounts upvoting, coordinated team voting",
      "AI-assisted content that violates a community rule or has not been fact-checked and human-edited",
      "Asking people to DM or visit a profile when the community rules prohibit solicitation",
      "Posting without genuine prior engagement in the subreddit"
    ],
    tagStrategy: "Reddit uses flair tags (set by moderators), not user-defined hashtags. Choose the correct post flair for r/startups or r/SideProject when available."
  },
  {
    id: "product-hunt",
    label: "Product Hunt",
    shortLabel: "PH",
    region: "Global",
    icon: Rocket,
    bestFor: "新产品首发、early adopter 获取、初期品牌曝光、创业社区存在感。",
    voice: "Launch energy: humble, helpful, specific. Marketing-speak kills credibility here. The maker comment is your moment — tell the real story, invite real feedback, don't ask for upvotes.",
    constraints: [
      "Tagline: EXACTLY ≤60 characters, start with a verb, describe what it does (not what it is)",
      "No superlatives in tagline: never 'best', 'most amazing', 'revolutionary', '#1'",
      "Maker Comment must be the first comment — 70% of top products include one",
      "Gallery: minimum 2 images (1270×760px recommended), ~53% of top products include a video",
      "Launch at 12:01 AM PST for full 24-hour window (PST resets the daily ranking)",
      "Never ask for upvotes — PH algorithm detects and penalizes this, can remove from homepage"
    ],
    charLimit: 500,
    viralPatterns: [
      "Tagline formula: '[Verb] [what it does] [for whom]' — e.g. 'Turn one idea into platform-native posts for every channel'",
      "Maker Comment structure: Who built it → What problem → Core features (bullet points) → Who it's for → Specific ask for feedback → Offer (PH-exclusive discount/access)",
      "Gallery story: screenshot 1 = the problem, screenshot 2 = the solution, screenshot 3+ = key features",
      "Product walkthrough: 60–90 seconds, show actual product use, real founder voiceover beats polished animation",
      "Humble ask: 'We built this for ourselves first. Would love to know if this solves your problem too.'"
    ],
    avoidList: [
      "Tagline with vague adjectives: 'powerful', 'beautiful', 'smart', 'next-generation'",
      "Asking anyone to upvote — in the post, comment, email, or social",
      "Launching without gallery images (minimum 2 required to show gallery)",
      "Using a big-name Hunter instead of self-hunting — data shows 60% of #1 products are self-hunted",
      "Launching a product that isn't yet usable (closed beta without public access)",
      "Corporate/marketing-speak in the maker comment"
    ],
    tagStrategy: "Product Hunt uses Topics (set during submission): choose 3–5 accurate topics that match your product category. Tags drive discovery in PH search and newsletter curation."
  },
  {
    id: "threads",
    label: "Threads",
    shortLabel: "Threads",
    region: "Global",
    icon: Send,
    bestFor: "轻量级公开更新、创作者受众、平易近人的创始人笔记。",
    voice: "Casual, direct, conversational, less intense than X. Feels like a thought you just had, not a carefully crafted post.",
    constraints: [
      "Keep it under 500 characters for best engagement",
      "One clear idea per post — don't try to cram in multiple points",
      "Conversational tone: write like you're texting a smart friend",
      "Make replies easy by ending with an open question or relatable observation"
    ],
    charLimit: 500,
    viralPatterns: [
      "Shower thought: 'I just realized [observation]. Is this just me?'",
      "Hot take: '[Controversial take]. Fight me.' (short, punchy)",
      "Real talk: 'Nobody talks about [uncomfortable truth in your field]'",
      "Progress share: '[Small milestone] feels [emotion]. [Lesson].'",
      "Question that sparks discussion: 'What's your take on [relevant topic]?'"
    ],
    avoidList: [
      "Long threads (Threads is not X — audiences don't want to read 10-post chains)",
      "Overly polished brand-speak — authenticity wins here",
      "External links as the centerpiece — Threads deprioritizes link posts",
      "Content that requires a lot of context to understand"
    ],
    tagStrategy: "1–3 hashtags or none. Threads' algorithm is still maturing; relevance and engagement matter more than hashtag optimization."
  },
  {
    id: "hacker-news",
    label: "Hacker News",
    shortLabel: "HN",
    region: "Global",
    icon: Flame,
    bestFor: "开发者注意力、技术可信度、Show HN 首发、原始真实反馈。",
    voice: "Matter-of-fact, technically precise, humble, specific. The HN audience has extreme BS detectors. No marketing speak. Every claim needs evidence or honest uncertainty.",
    constraints: [
      "Show HN format: 'Show HN: [Product Name] – [What it does in plain English]'",
      "First comment: explain the technical approach, what problem it solves, how you built it",
      "No marketing adjectives ever: not 'revolutionary', 'seamless', 'powerful', 'intuitive'",
      "Acknowledge limitations and tradeoffs honestly — HN respects intellectual honesty",
      "Invite genuine critique: 'I'd especially like feedback on [specific technical decision]'",
      "Keep the post title factual and specific, not a tagline"
    ],
    charLimit: 2000,
    viralPatterns: [
      "Technical novelty first: explain the hard problem you solved and how",
      "Honest origin: 'I built this because I needed it and nothing else existed'",
      "Specific numbers: lines of code, performance benchmarks, users, revenue (if applicable)",
      "What you learned: HN loves 'lessons from building X' posts with genuine insights",
      "Ask for specific critique: 'The part I'm least confident about is X'"
    ],
    avoidList: [
      "Any marketing language or startup buzzwords",
      "Vague descriptions that don't explain how it works",
      "Asking for upvotes or shares",
      "Exaggerating capabilities or hiding limitations",
      "Product with no technical depth or novel approach"
    ],
    tagStrategy: "Hacker News has no hashtags. Post in Show HN for product launches, Ask HN for questions, or as a regular post for lessons/essays."
  },
  {
    id: "indie-hackers",
    label: "Indie Hackers",
    shortLabel: "IH",
    region: "Global",
    icon: Store,
    bestFor: "公开建设、收入学习、创始人社区、早期用户。",
    voice: "Transparent founder lesson with real numbers when possible. The community respects honesty about what's working and what isn't. Be specific, be useful, be genuine.",
    constraints: [
      "Always include real numbers if you have them: revenue, users, conversion rate, churn",
      "Frame as a lesson learned, not a product announcement",
      "Acknowledge failures and pivots — the community values honesty over polish",
      "Ask a genuine question at the end to invite founder feedback",
      "Avoid phrasing that sounds like a press release"
    ],
    charLimit: 5000,
    viralPatterns: [
      "Milestone post with breakdown: '$X MRR achieved: here's exactly what worked and what didn't'",
      "Build-in-public update: 'Month 3 update: [metric], [lesson], [next step]'",
      "Failure autopsy: 'I shut down [project]. Here's what I learned.'",
      "Contrarian experiment: 'I tried [unconventional approach] for 30 days. Results were unexpected.'",
      "Genuine question with context: 'We just hit [milestone] but struggling with [specific problem]. How did you solve this?'"
    ],
    avoidList: [
      "Generic motivational content without specific numbers or lessons",
      "Product pitches disguised as posts",
      "Claiming success without showing the work or process",
      "Passive voice and corporate language"
    ],
    tagStrategy: "Indie Hackers uses product tags and group categories. Tag your product and post in the relevant group (e.g., 'Acquisition', 'Revenue', 'Tools'). No hashtags."
  },
  {
    id: "medium-substack",
    label: "Medium / Substack",
    shortLabel: "Newsletter",
    region: "Global",
    icon: BookOpenText,
    bestFor: "常青文章、SEO流量、Newsletter增长、思想领导力。",
    voice: "Essay-like, clear thesis, specific examples that prove the point. Every section should deliver a distinct insight — no padding, no filler.",
    constraints: [
      "State your thesis in the first 3 sentences — don't bury the lede",
      "Use H2 subheadings every 300–500 words to aid navigation",
      "Each section must add a new insight, not just elaborate the same point",
      "End with a specific CTA: subscribe, reply, or share",
      "Include at least one concrete example or data point per major claim"
    ],
    charLimit: 10000,
    viralPatterns: [
      "Thesis-driven: state a specific, falsifiable claim, then prove it with examples",
      "Counter-narrative: 'The conventional wisdom about X is wrong. Here's what the data shows:'",
      "Deep dive: 'Everything you need to know about X in one essay'",
      "Personal + universal: start with a specific personal experience, extract a universal lesson",
      "Framework essay: introduce a named mental model, explain it with examples, show how to apply it"
    ],
    avoidList: [
      "Vague thesis or no thesis at all ('Some thoughts on X')",
      "Lists without explanation — Medium readers want depth, not bullet dumps",
      "No concrete examples — abstract claims without evidence don't resonate",
      "Padded intros that delay getting to the point"
    ],
    tagStrategy: "Medium: 5 tags maximum, choose based on existing high-traffic publications. Substack: no hashtags; growth comes from referrals, SEO, and cross-promotions with other newsletters."
  }
];

export const requiredPlatformIds: PlatformId[] = [
  "wechat",
  "xiaohongshu",
  "zhihu",
  "moments",
  "x",
  "linkedin",
  "instagram",
  "facebook",
  "reddit",
  "product-hunt"
];

/**
 * Operational cap for one generation request. Plans can expose the complete
 * platform library, but keeping a single run bounded avoids long-tail latency
 * and makes partial failures easier to recover from.
 */
export const MAX_PLATFORMS_PER_GENERATION = 6;

export const SUPPORTED_PLATFORM_COUNT = platforms.length;

export function getPlatform(platformId: PlatformId): Platform {
  const platform = platforms.find((item) => item.id === platformId);

  if (!platform) {
    throw new Error(`Unsupported platform: ${platformId}`);
  }

  return platform;
}
