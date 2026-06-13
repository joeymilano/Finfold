import {
  BookOpenText,
  BriefcaseBusiness,
  Flame,
  Hash,
  MessageCircle,
  Rocket,
  Send,
  Sparkles,
  Store,
  Users,
  type LucideIcon
} from "lucide-react";

export type PlatformId =
  | "wechat"
  | "xiaohongshu"
  | "moments"
  | "x"
  | "linkedin"
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
      "标题必须≤20字，前5字即痛点或数字，末尾可加省略号制造悬念",
      "正文600-1500字（平台给超600字内容额外权重）",
      "每段1-3行，强制换行，绝不写大段落",
      "用emoji作视觉分隔（不超过每段一个），如✅❌🔥💡",
      "结尾必须有收藏引导和互动问题（如'你们有没有遇到过...'）",
      "自然融入3-5个#话题标签：2个泛标签+3个垂直长尾标签"
    ],
    charLimit: 1500,
    viralPatterns: [
      "痛点开头 → 我也经历过 → 发现这个方法 → 具体步骤 → 结果对比 → 收藏价值点",
      "数字型：'做了X件事/用了X天/省了X元'，数字要具体真实",
      "对比型：'以前这样/现在这样'，视觉冲击，适合前后对比",
      "清单型：'X个你不知道的...'，条目式，适合收藏",
      "反常识型：'99%的人都做错了这件事'，颠覆认知，触发点赞"
    ],
    avoidList: [
      "大段文字不换行（直接导致用户划走）",
      "开头直接介绍产品名称（像广告，被降权）",
      "纯AI生成内容不加人工改写（平台2025年起必须标注AI，且原创度低被降权）",
      "标题超过20字或信息量过密",
      "超过5个话题标签（无效甚至负效）",
      "没有结尾互动引导（影响评论数，降低CES分）"
    ],
    tagStrategy: "3-5个话题标签：先选2个大话题蹭流量池（如#独立开发者 #副业），再选3个精准垂直长尾词（如#AI工具推荐 #内容创作工具），标签要与正文高度相关"
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
    voice: "Sharp, compressed, international. Every sentence earns the next. No throat-clearing. First line is the only line that matters for the algorithm.",
    constraints: [
      "First line must be a hook that works standalone — the algorithm decides distribution on line 1",
      "Each tweet in a thread: 150–240 characters, one clear idea, can stand alone",
      "Thread length: 5–12 tweets (longer = higher drop-off)",
      "Put links in the first comment, NOT the main post — X demotes link-containing posts",
      "No 'just sharing some thoughts' openers — drop in the middle of the action",
      "End with a specific question to drive replies (replies outweigh likes in the algorithm)"
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
      "Opening with 'I think' or 'Just wanted to share' — zero signal, killed by algorithm",
      "External links in main post — X demotes these significantly",
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
      "CRITICAL: First 2 lines (≈210 characters) must hook before 'See more' cutoff — this is your entire ad",
      "No links in the main post body — LinkedIn demotes them; put the link in first comment",
      "End with ONE specific question tied to the content (posts with questions get 77% more comments)",
      "3–5 hashtags maximum — more than 5 triggers spam filters",
      "Post spacing: leave blank lines between every 1–2 sentences for scanability",
      "Golden Hour: respond to every substantive comment within the first 60 minutes of posting"
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
      "Starting with 'I' — LinkedIn's algorithm reportedly penalizes posts starting with 'I'",
      "Vague inspirational content: 'Success takes hard work!' with no specific insight",
      "Engagement bait: 'Comment YES to get this resource', emoji polls, 'Like if you agree'",
      "Tag-baiting irrelevant people to boost reach — spam signal",
      "AI-flavor phrases: 'In today's fast-paced world', 'It's no secret that', 'At the end of the day'",
      "More than 5 hashtags",
      "Long paragraphs without line breaks — kills scannability"
    ],
    tagStrategy: "3–5 hashtags: 1 broad topic (#marketing) + 1–2 vertical (#B2BSaaS, #IndieFounder) + 1 niche (#ContentStrategy). Place at the end of the post, not inline."
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
      "CRITICAL: r/startups and r/entrepreneur strictly ban direct self-promotion — never mention product name or URL in post body",
      "Frame as experience-sharing or question-asking, not announcing",
      "Post minimum 250 words with specific context (r/startups requirement)",
      "The 10% rule: your own content/links should be <10% of your total Reddit activity",
      "Avoid any hard CTA — 'check out my product', 'visit my site', 'DM me for details' = instant removal",
      "If referencing your own work, frame it as 'a side project I've been building' not 'my startup [Name]'"
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
      "Product name, URL, or any direct link to your product in post body",
      "Marketing language: 'revolutionary', 'game-changing', 'we built the solution to this'",
      "Fake grassroots: multiple accounts upvoting, coordinated team voting",
      "AI-generated content (r/entrepreneur explicitly bans it)",
      "Asking people to DM you or visit your profile for more info",
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
  "moments",
  "x",
  "linkedin",
  "reddit",
  "product-hunt"
];

export function getPlatform(platformId: PlatformId): Platform {
  const platform = platforms.find((item) => item.id === platformId);

  if (!platform) {
    throw new Error(`Unsupported platform: ${platformId}`);
  }

  return platform;
}
