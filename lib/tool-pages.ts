import type { PlatformId } from "@/lib/platforms";

export type ToolPageConfig = {
  slug: string;
  updatedAt: string;
  platform: PlatformId;
  titleZh: string;
  titleEn: string;
  searchTitleZh: string;
  searchTitleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  searchDescriptionZh: string;
  searchDescriptionEn: string;
  heroZh: string;
  heroEn: string;
  bestForZh: string[];
  bestForEn: string[];
  outputsZh: string[];
  outputsEn: string[];
  faq: Array<{
    questionZh: string;
    questionEn: string;
    answerZh: string;
    answerEn: string;
  }>;
  relatedBlogSlug?: string;
};

/**
 * First 6 tool pages per the plan's SEO route table (§6) — each locks the
 * trial widget to one platform so the page matches its target keyword
 * ("小红书文案生成器", "Product Hunt launch copy generator", etc.).
 * Content (rules, viral patterns) is pulled live from lib/platforms.ts
 * rather than duplicated here, so it never drifts from the actual
 * generation engine.
 */
export const toolPages: ToolPageConfig[] = [
  {
    slug: "xiaohongshu-generator",
    updatedAt: "2026-08-09",
    platform: "xiaohongshu",
    titleZh: "小红书文案生成器",
    titleEn: "Xiaohongshu Copy Generator",
    searchTitleZh: "免费小红书文案生成器｜中英文笔记与标题",
    searchTitleEn: "Free Xiaohongshu Caption Generator (English & Chinese)",
    descriptionZh: "把那段像说明书的产品更新丢进来。先写出生活里的那个麻烦，再整理成小红书读得下去的节奏。",
    descriptionEn: "Drop in the product update that still sounds like a manual. Start from a real-life frustration, then shape it for Xiaohongshu.",
    searchDescriptionZh: "把产品更新改成小红书标题、开场和正文，支持中英文，并提供披露、事实、图片与话题的发布前自查清单。",
    searchDescriptionEn: "Create Xiaohongshu or RED titles and captions in English or Chinese, with mobile-ready structure and a practical pre-publish content checklist.",
    heroZh: "小红书文案生成器",
    heroEn: "Xiaohongshu Caption & Post Generator",
    bestForZh: [
      "把产品更新改成小红书或 RED 原生笔记",
      "同时准备中文和英文版本",
      "发布前检查披露、事实、图片与话题"
    ],
    bestForEn: [
      "Product updates that need a Xiaohongshu or RED-native angle",
      "English or Chinese captions for global teams",
      "A pre-publish check for disclosure, claims, visuals, and topics"
    ],
    outputsZh: ["笔记标题与首屏开场", "适合手机阅读的正文结构", "话题建议与发布前自查清单"],
    outputsEn: ["Post titles and first-screen hooks", "Mobile-readable caption structure", "Topic ideas and a Xiaohongshu content checklist"],
    faq: [
      {
        questionZh: "小红书文案通常包括什么？",
        questionEn: "What does a Xiaohongshu caption include?",
        answerZh: "一篇可发布的笔记通常包括标题、首屏开场、短段落正文、必要披露和准确话题。图片内容与文案表达也应保持一致。",
        answerEn: "A publishable note usually combines a title, first-screen hook, short mobile-friendly paragraphs, any necessary disclosure, and accurate topics. The visuals should support the same claim as the copy."
      },
      {
        questionZh: "Finfold 可以生成英文小红书内容吗？",
        questionEn: "Can Finfold write Xiaohongshu content in English?",
        answerZh: "可以。你可以准备中文或英文笔记，但仍应根据目标读者调整例子、语气和文化语境，而不是逐句直译。",
        answerEn: "Yes. You can prepare English or Chinese Xiaohongshu drafts, then adapt examples, tone, and cultural context for the audience instead of translating line by line."
      },
      {
        questionZh: "发布前自查清单等于合规保证吗？",
        questionEn: "Is the Xiaohongshu content checklist a compliance guarantee?",
        answerZh: "不是。清单用于发现常见风险，不能替代平台最新规则、当地法律或专业法律意见；发布者仍需做最终人工审核。",
        answerEn: "No. The checklist catches common risks but does not replace current platform rules, local law, or professional legal advice. A human publisher must make the final review."
      }
    ],
    relatedBlogSlug: "xiaohongshu-algorithm-playbook"
  },
  {
    slug: "wechat-article-generator",
    updatedAt: "2026-08-09",
    platform: "wechat",
    titleZh: "公众号文章生成器 AI",
    titleEn: "WeChat Official Account Article Generator",
    searchTitleZh: "免费公众号文章生成器 AI｜标题、大纲与长文",
    searchTitleEn: "Free WeChat Official Account Article Generator",
    descriptionZh: "有些事三百字讲不清。把事实和故事交给它，先搭出一篇能慢慢读、也值得转发的公众号长文。",
    descriptionEn: "Some ideas need more than 300 words. Turn the facts and story into a WeChat article worth reading slowly and sharing.",
    searchDescriptionZh: "把产品更新、文章或采访素材整理成公众号标题、大纲和长文初稿，保留事实、故事和品牌语气。",
    searchDescriptionEn: "Turn product updates, articles, or interview notes into a WeChat Official Account title, outline, and long-form draft with your facts and voice intact.",
    heroZh: "公众号文章生成器",
    heroEn: "WeChat Official Account Article Generator",
    bestForZh: ["需要展开成完整故事的产品更新", "采访、播客或长文素材复用", "公众号读者需要的中文长文结构"],
    bestForEn: ["Product updates that need a complete story", "Repurposing interviews, podcasts, or long-form notes", "Chinese long-form structure for Official Account readers"],
    outputsZh: ["标题与摘要方向", "可编辑的大纲和小标题", "适合公众号阅读节奏的长文初稿"],
    outputsEn: ["Headline and summary directions", "An editable outline with section headings", "A long-form draft shaped for WeChat reading"],
    faq: [
      {
        questionZh: "公众号文章生成器会直接发布内容吗？",
        questionEn: "Does the WeChat article generator publish automatically?",
        answerZh: "不会。Finfold 先生成可编辑的文章与素材，你完成事实核对和人工修改后再导出发布。",
        answerEn: "No. Finfold prepares an editable article and assets. You verify the facts, make the final human edit, and then export for publishing."
      },
      {
        questionZh: "可以把短更新扩写成长文吗？",
        questionEn: "Can a short update become a long WeChat article?",
        answerZh: "可以，但不应凭空补事实。Finfold 会整理已有材料；缺少案例、数字或引用时，需要你补充真实信息。",
        answerEn: "Yes, but it should not invent facts. Finfold structures the material you provide; you should add real examples, numbers, or quotations when the source is thin."
      },
      {
        questionZh: "生成后还能修改标题和结构吗？",
        questionEn: "Can I edit the headline and structure?",
        answerZh: "可以。标题、段落、小标题和语气都能继续修改，并可把偏好保存到品牌记忆中。",
        answerEn: "Yes. You can edit headlines, paragraphs, section headings, and tone, then save useful preferences in Brand Memory."
      }
    ]
  },
  {
    slug: "product-hunt-launch-copy",
    updatedAt: "2026-08-09",
    platform: "product-hunt",
    titleZh: "Product Hunt 发布文案生成器",
    titleEn: "Product Hunt Launch Copy Generator",
    searchTitleZh: "免费 Product Hunt 发布文案生成器",
    searchTitleEn: "Free Product Hunt Launch Copy Generator",
    descriptionZh: "别再用 revolutionary 和 game-changing 吓人。把你为什么做、替谁解决什么，写成一句 tagline 和一段 Maker Comment。",
    descriptionEn: "Skip revolutionary and game-changing. Say why you built it, who it helps, and turn that into a tagline and Maker Comment.",
    searchDescriptionZh: "生成 Product Hunt tagline、产品简介和 Maker Comment 初稿，用真实用户问题与产品能力替代空泛夸张词。",
    searchDescriptionEn: "Create a Product Hunt tagline, product description, and Maker Comment from real customer problems and product facts — without empty launch hype.",
    heroZh: "Product Hunt 发布文案生成器",
    heroEn: "Product Hunt Launch Copy Generator",
    bestForZh: ["首次发布或重大版本更新", "需要压缩成一句话的复杂产品", "想写清楚起因与待验证问题的 Maker"],
    bestForEn: ["First launches or major product updates", "Complex products that need one repeatable line", "Makers who want a clear origin and a useful feedback question"],
    outputsZh: ["可复述的 tagline", "简洁产品简介", "有起因、证据和反馈问题的 Maker Comment"],
    outputsEn: ["A repeatable tagline", "A concise product description", "A Maker Comment with origin, evidence, and one feedback question"],
    faq: [
      {
        questionZh: "Product Hunt 发布页最需要哪些文案？",
        questionEn: "What copy does a Product Hunt launch need?",
        answerZh: "核心通常是 tagline、简短产品描述、Maker Comment 和首条评论。具体字段可能变化，发布当天应再次核对平台要求。",
        answerEn: "The core set usually includes a tagline, concise product description, Maker Comment, and launch-day replies. Recheck the live Product Hunt fields before publishing because platform requirements can change."
      },
      {
        questionZh: "Finfold 会虚构用户数据或榜单结果吗？",
        questionEn: "Will Finfold invent traction or ranking claims?",
        answerZh: "不应该。发布文案应只使用你提供或能验证的事实，Beta 状态、功能边界和待验证问题也应明确说明。",
        answerEn: "It should not. Launch copy should use facts you provide or can verify, while stating beta status, product limits, and open questions clearly."
      },
      {
        questionZh: "Maker Comment 应该多长？",
        questionEn: "How long should a Maker Comment be?",
        answerZh: "没有一个永远有效的字数。优先讲清楚为什么做、为谁做、今天能交付什么，以及你真正想验证的一个问题。",
        answerEn: "There is no permanent magic length. Explain why you built it, who it serves, what works today, and the one question you genuinely want early users to test."
      }
    ],
    relatedBlogSlug: "product-hunt-maker-comment-guide"
  },
  {
    slug: "twitter-thread-generator",
    updatedAt: "2026-08-09",
    platform: "x",
    titleZh: "X（Twitter）推文生成器",
    titleEn: "X / Twitter Thread Generator",
    searchTitleZh: "免费 X（Twitter）推文与线程生成器",
    searchTitleEn: "Free X (Twitter) Post & Thread Generator",
    descriptionZh: "把客服邮件味的更新改成一条有人愿意停下来的推文：先把矛盾摆出来，再决定要不要展开成线程。",
    descriptionEn: "Turn a customer-support-style update into an X post worth stopping for. Put the tension first, then decide if it needs a thread.",
    searchDescriptionZh: "把产品更新改成 X（Twitter）单条推文或线程：先写清第一行、核心观点和自然 CTA，再决定是否展开。",
    searchDescriptionEn: "Turn a product update into an X or Twitter post, caption, or thread with a clear first line, one central idea, and a natural next step.",
    heroZh: "X / Twitter 推文生成器",
    heroEn: "X (Twitter) Post & Thread Generator",
    bestForZh: ["产品更新和 Build in Public", "需要从单条扩展成线程的观点", "想保留真人语气的技术内容"],
    bestForEn: ["Product updates and building in public", "Ideas that may need a single post or a thread", "Technical content that should still sound human"],
    outputsZh: ["单条推文的第一行与正文", "多条线程结构", "自然 CTA 与回复方向"],
    outputsEn: ["A first line and complete single post", "A multi-post thread structure", "A natural CTA and reply direction"],
    faq: [
      {
        questionZh: "什么时候应该写线程而不是单条推文？",
        questionEn: "When should I use a thread instead of one post?",
        answerZh: "当一个观点需要多个独立证据或步骤才能成立时再用线程；一句话能讲清的更新，不必人为拆长。",
        answerEn: "Use a thread when the idea needs several distinct pieces of evidence or steps. If one post can carry the complete thought, do not stretch it artificially."
      },
      {
        questionZh: "可以根据 release notes 生成推文吗？",
        questionEn: "Can I generate an X post from release notes?",
        answerZh: "可以。先选择一个用户能感知的变化，再用技术细节作证据，不要把整份更新日志原样贴进信息流。",
        answerEn: "Yes. Choose one user-visible change, then use technical details as evidence instead of pasting the entire changelog into the feed."
      },
      {
        questionZh: "生成内容会自动发布吗？",
        questionEn: "Does Finfold auto-publish the generated thread?",
        answerZh: "当前页面提供生成与编辑工作流；发布前仍由你核对事实、语气和链接，并决定最终发布方式。",
        answerEn: "This page provides the generation and editing workflow. You still review facts, voice, and links before choosing how to publish."
      }
    ],
    relatedBlogSlug: "x-twitter-algorithm-playbook"
  },
  {
    slug: "linkedin-post-generator",
    updatedAt: "2026-08-09",
    platform: "linkedin",
    titleZh: "LinkedIn 帖子生成器",
    titleEn: "LinkedIn Post Generator",
    searchTitleZh: "免费 LinkedIn 帖子与 Caption 生成器",
    searchTitleEn: "Free AI LinkedIn Post & Caption Generator",
    descriptionZh: "别把帖子写成年终述职。先讲一次真实变化，再把你的经验变成同行明天能拿去试的东西。",
    descriptionEn: "Do not write another performance review. Start with a real change and turn your experience into something a peer can try tomorrow.",
    searchDescriptionZh: "把产品更新、案例或观点改成 LinkedIn 帖子：生成 hook、caption、正文结构和自然 CTA，保留真实经历与专业判断。",
    searchDescriptionEn: "Turn release notes, a case study, or an idea into a LinkedIn post with a human hook, caption structure, evidence, and a natural CTA.",
    heroZh: "LinkedIn 帖子生成器",
    heroEn: "LinkedIn Post & Caption Generator",
    bestForZh: ["产品发布与版本更新", "创始人复盘和专业观点", "案例、长文或播客内容复用"],
    bestForEn: ["Product launches and release updates", "Founder lessons and professional points of view", "Repurposing a case study, article, or podcast"],
    outputsZh: ["首屏 hook 与 caption", "有证据的正文结构", "自然 CTA 与可讨论的问题"],
    outputsEn: ["A first-screen hook and caption", "An evidence-led post structure", "A natural CTA and a specific discussion question"],
    faq: [
      {
        questionZh: "LinkedIn caption 和帖子有什么区别？",
        questionEn: "What is the difference between a LinkedIn caption and a post?",
        answerZh: "很多人把 LinkedIn 帖子的正文称为 caption，尤其是在配图或视频时。Finfold 会把它们作为同一个内容任务处理：先写开场，再组织正文和 CTA。",
        answerEn: "People often use “caption” for the text attached to a LinkedIn image or video. Finfold treats it as the same writing job: a strong opening, useful body, and relevant next step."
      },
      {
        questionZh: "可以把更新日志改成 LinkedIn 帖子吗？",
        questionEn: "Can Finfold turn release notes into a LinkedIn post?",
        answerZh: "可以。最好的做法是只选一个用户能感知的变化，用更新日志里的事实作证据，再补上团队学到的判断。",
        answerEn: "Yes. Choose one user-visible change, use release-note facts as evidence, and add the judgment your team learned instead of publishing an inventory."
      },
      {
        questionZh: "怎样避免生成内容像 AI？",
        questionEn: "How do I keep a generated LinkedIn post from sounding like AI?",
        answerZh: "补上只有你知道的时间、取舍、失败和具体数字，删除无法证明的夸张词，并保留一次最终人工改写。",
        answerEn: "Add details only you know — timing, tradeoffs, failure, and verified numbers. Remove unsupported hype and keep one final human editing pass."
      }
    ],
    relatedBlogSlug: "product-changelog-to-linkedin-post"
  },
  {
    slug: "reddit-post-generator",
    updatedAt: "2026-08-09",
    platform: "reddit",
    titleZh: "Reddit 帖子生成器",
    titleEn: "Reddit Post Generator",
    searchTitleZh: "免费 AI Reddit 帖子生成器｜真实社区发帖",
    searchTitleEn: "Free AI Reddit Post Generator for Authentic Posts",
    descriptionZh: "先写一个拿掉链接也值得看的帖子，再诚实说明产品是你做的。社区不是鱼塘，别拿网进去。",
    descriptionEn: "Write something worth reading after the link is removed, then say honestly that you built the product. A community is not a traffic pond.",
    searchDescriptionZh: "把产品更新改成符合社区语境的 Reddit 标题和正文，包含身份披露、无链接价值、规则检查与明确提问。",
    searchDescriptionEn: "Create subreddit-aware Reddit titles and posts with honest disclosure, no-link value, rule checks, and a specific question. Preview the workflow free.",
    heroZh: "Reddit 帖子生成器",
    heroEn: "AI Reddit Post Generator",
    bestForZh: ["独立开发者分享产品与复盘", "需要适配具体 subreddit 的讨论帖", "想诚实披露利益关系的社区发帖"],
    bestForEn: ["Indie founders sharing products or lessons", "Discussion posts shaped for a specific subreddit", "Community posts that disclose the maker relationship honestly"],
    outputsZh: ["Reddit 标题与完整正文", "身份披露和链接位置建议", "一个带背景、可被具体回答的问题"],
    outputsEn: ["A Reddit title and complete post", "Disclosure and link-placement guidance", "One contextual question people can answer specifically"],
    faq: [
      {
        questionZh: "AI 生成的 Reddit 帖子会被删除吗？",
        questionEn: "Will an AI-generated Reddit post be removed?",
        answerZh: "是否删除取决于 subreddit 规则、内容价值和账号行为，而不是只看使用了什么工具。发布前应阅读规则，并做最终人工改写。",
        answerEn: "Removal depends on subreddit rules, the post's value, and account behaviour — not only the tool used. Read the community rules and make a final human edit before posting."
      },
      {
        questionZh: "推广自己的产品需要披露吗？",
        questionEn: "Should I disclose that I built the product?",
        answerZh: "应该。直接说明你是产品作者通常比假装路人更可信，同时仍要遵守具体社区对自我推广和链接的规则。",
        answerEn: "Yes. Saying that you built the product is usually more trustworthy than pretending to be a passer-by, while each community's self-promotion and link rules still apply."
      },
      {
        questionZh: "什么样的 Reddit 帖子值得发布？",
        questionEn: "What makes a Reddit post worth publishing?",
        answerZh: "把链接删掉后，帖子仍应提供可用经历、数据或问题。若正文只剩产品介绍，它更像广告而不是社区讨论。",
        answerEn: "After removing the link, the post should still offer a useful experience, data point, or question. If only the product pitch remains, it is an ad rather than a community contribution."
      }
    ],
    relatedBlogSlug: "reddit-algorithm-playbook"
  }
];

export const founderMarketingToolSlugs: ReadonlySet<string> = new Set([
  "product-hunt-launch-copy",
  "twitter-thread-generator",
  "linkedin-post-generator",
  "reddit-post-generator"
]);

export function getToolPage(slug: string): ToolPageConfig | undefined {
  return toolPages.find((tool) => tool.slug === slug);
}
