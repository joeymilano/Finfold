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
  /** Direct-answer opening paragraph rendered right under the H1 so AI
   * search engines can quote the page's core answer (GEO). ~40-60 words en. */
  directAnswerZh: string;
  directAnswerEn: string;
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
    updatedAt: "2026-09-21",
    platform: "xiaohongshu",
    titleZh: "小红书文案生成器",
    titleEn: "Xiaohongshu Copy Generator",
    searchTitleZh: "免费小红书标题生成器｜正文、话题排版与发布自查｜Finfold",
    searchTitleEn: "Free Xiaohongshu Caption Generator (English & Chinese)",
    descriptionZh: "输入产品更新或真实经历，生成小红书标题、正文和话题建议。",
    descriptionEn: "Turn a product update or real experience into a Xiaohongshu title, caption, and topic ideas.",
    directAnswerZh: "这个免费生成器把一次产品更新或一段真实经历，写成适合手机阅读的小红书笔记。标题、首屏开场、正文结构和中英文话题标签一次配齐，每份草稿附发布前自查，覆盖身份披露、事实依据、图片授权与话题相关性。",
    directAnswerEn: "Paste one product update or a real experience, and this free generator writes a phone-ready RED note around it, title, first-screen opening, body, and Chinese or English topic tags included. Every draft ships with a pre-publish checklist for disclosure, facts, image rights, and topic fit.",
    searchDescriptionZh: "把产品更新改成适合手机阅读的小红书标题、首屏开场、正文和话题排版，支持中英文笔记；无需登录即可预览工作流，生成时使用免费账户，并附身份披露、事实依据、图片授权、隐私与话题相关性的发布前自查，保留最终人工审核。",
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
        questionZh: "小红书标题、正文和话题怎么排版？",
        questionEn: "How should I format a Xiaohongshu title, caption, and topics?",
        answerZh: "标题单独成行，正文用适合手机阅读的短段落，话题放在正文末尾，只保留与内容直接相关的标签。发布界面和规则可能变化，发布前仍需查看当前页面并完成人工检查。",
        answerEn: "Keep the title separate, use short mobile-readable paragraphs, and place only genuinely relevant topics at the end. The publishing interface and rules can change, so check the current screen and make a final human review."
      },
      {
        questionZh: "Finfold 可以生成英文小红书内容吗？",
        questionEn: "Can Finfold write Xiaohongshu content in English?",
        answerZh: "可以。你可以准备中文或英文笔记，例子、语气和文化语境要跟着目标读者调整。逐句直译通常会显得生硬。",
        answerEn: "Yes. You can prepare English or Chinese Xiaohongshu drafts, then adapt examples, tone, and cultural context for the audience instead of translating line by line."
      },
      {
        questionZh: "发布前自查清单等于合规保证吗？",
        questionEn: "Is the Xiaohongshu content checklist a compliance guarantee?",
        answerZh: "不能。清单用于发现常见风险，不能替代平台最新规则、当地法律或专业法律意见；发布者仍需做最终人工审核。",
        answerEn: "No. The checklist catches common risks but does not replace current platform rules, local law, or professional legal advice. A human publisher must make the final review."
      }
    ],
    relatedBlogSlug: "content-compounding-founder-system"
  },
  {
    slug: "wechat-article-generator",
    updatedAt: "2026-09-21",
    platform: "wechat",
    titleZh: "公众号文章生成器 AI",
    titleEn: "WeChat Official Account Article Generator",
    searchTitleZh: "免费微信公众号文章生成器 AI｜标题、大纲、长文初稿与排版｜Finfold",
    searchTitleEn: "Free WeChat Official Account Article Generator | Finfold",
    descriptionZh: "输入现有材料，生成公众号标题、大纲和长文初稿。",
    descriptionEn: "Turn existing material into a WeChat headline, outline, and long-form draft.",
    directAnswerZh: "把产品更新、采访或长文素材整理成可以直接编辑的公众号文章，标题方向、摘要、可编辑大纲和适合公众号阅读节奏的长文初稿一起生成。事实和语气保持你提供的原样，核对修改后再导出发布。",
    directAnswerEn: "Feed it product updates, interview notes, or long-form material and get a ready-to-edit Official Account article, with headline directions, a summary, an editable outline, and a long-form draft paced for WeChat reading. Your facts and voice stay as you provided them.",
    searchDescriptionZh: "把产品更新、文章、采访或播客素材整理成微信公众号标题、摘要、可编辑大纲和长文初稿，按移动端阅读节奏组织小标题与段落，同时保留可核对的事实、故事线和品牌语气；生成后继续人工修改，再导出发布。",
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
    updatedAt: "2026-09-21",
    platform: "product-hunt",
    titleZh: "Product Hunt 发布文案生成器",
    titleEn: "Product Hunt Launch Copy Generator",
    searchTitleZh: "免费 Product Hunt 发布文案生成器｜Tagline 与 Maker Comment｜Finfold",
    searchTitleEn: "Free Product Hunt Launch Copy Generator",
    descriptionZh: "输入产品信息，生成 tagline、产品简介和 Maker Comment。",
    descriptionEn: "Turn product facts into a tagline, description, and Maker Comment.",
    directAnswerZh: "从真实用户问题和产品事实出发，写出可复述的 tagline、简洁的产品简介，以及交代起因、证据和一个反馈问题的 Maker Comment。不编造数据，也不堆发布日的夸张词。",
    directAnswerEn: "Start from real customer problems and product facts, and get a tagline you can repeat from memory, a concise product description, and a Maker Comment that covers origin, evidence, and one feedback question. No invented traction, no launch-day hype.",
    searchDescriptionZh: "根据真实用户问题、产品能力与发布目标，生成 Product Hunt tagline、产品简介和 Maker Comment 初稿；明确 Beta 边界与待验证问题，用可核对的事实替代空泛夸张词。",
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
        answerZh: "没有一个永远有效的字数。优先讲清楚为什么做、为谁做、今天能交付什么，以及你这次想验证的一个问题。",
        answerEn: "There is no permanent magic length. Explain why you built it, who it serves, what works today, and the one question you genuinely want early users to test."
      }
    ],
    relatedBlogSlug: "validate-demand-before-building"
  },
  {
    slug: "twitter-thread-generator",
    updatedAt: "2026-09-21",
    platform: "x",
    titleZh: "X（Twitter）推文生成器",
    titleEn: "X / Twitter Thread Generator",
    searchTitleZh: "免费 X（Twitter）推文与线程生成器｜产品更新写作｜Finfold",
    searchTitleEn: "Free X (Twitter) Post & Thread Generator",
    descriptionZh: "输入产品更新或观点，生成单条推文或完整线程。",
    descriptionEn: "Turn a product update or point of view into one X post or a complete thread.",
    directAnswerZh: "把产品更新或创始人观点写成一条推文，或者一整条线程。第一行先给判断，证据跟上，结尾留一个自然的下一步，Build in Public 用起来最顺，读起来不像机器刷帖。",
    directAnswerEn: "Turn a product update or a founder's point of view into one X post or a full thread. The first line carries the claim, evidence follows, and the close leaves a natural next step. Built for building in public, without sounding automated.",
    searchDescriptionZh: "把产品更新、发布说明或创始人观点改成 X（Twitter）单条推文或线程。先写清第一行、核心判断、证据与自然 CTA，再根据阅读节奏决定是否展开；适合产品发布、Build in Public 和复盘内容，并保留最终人工审核。",
    searchDescriptionEn: "Turn a product update into an X or Twitter post, caption, or thread with a clear first line, one central idea, and a natural next step.",
    heroZh: "X / Twitter 推文生成器",
    heroEn: "X (Twitter) Post & Thread Generator",
    bestForZh: ["产品更新和 Build in Public", "需要从单条扩展成线程的观点", "想保留真人语气的技术内容"],
    bestForEn: ["Product updates and building in public", "Ideas that may need a single post or a thread", "Technical content that should still sound human"],
    outputsZh: ["单条推文的第一行与正文", "多条线程结构", "自然 CTA 与回复方向"],
    outputsEn: ["A first line and complete single post", "A multi-post thread structure", "A natural CTA and reply direction"],
    faq: [
      {
        questionZh: "什么时候应该把一条推文展开成线程？",
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
    relatedBlogSlug: "content-compounding-founder-system"
  },
  {
    slug: "linkedin-post-generator",
    updatedAt: "2026-09-21",
    platform: "linkedin",
    titleZh: "LinkedIn 帖子生成器",
    titleEn: "LinkedIn Post Generator",
    searchTitleZh: "免费 LinkedIn 帖子与 Caption 生成器｜Release Notes 转 Post｜Finfold",
    searchTitleEn: "LinkedIn Post & Caption Generator: Release Notes | Finfold",
    descriptionZh: "输入产品更新、案例或观点，生成 LinkedIn 帖子初稿。",
    descriptionEn: "Turn a product update, case, or point of view into a LinkedIn draft.",
    directAnswerZh: "把 release notes、案例或创始人复盘改写成 LinkedIn 帖子。首屏 hook 用真人经历开场，正文用可核对的事实支撑，结尾放一个自然的 CTA。每帖只讲一个用户能感知的变化，不整段贴更新日志。",
    directAnswerEn: "Turn release notes, a case study, or a founder retrospective into a LinkedIn post that opens like a person, argues from checkable facts, and closes with a natural CTA. One user-visible change per post, no changelog dump.",
    searchDescriptionZh: "把产品更新、release notes、案例或专业观点改成 LinkedIn 帖子与 caption。先选一个用户能感知的变化，再生成首屏 hook、证据结构和自然 CTA，保留真实经历、可核对事实与最终人工审核，避免把整份更新日志复制成工程清单。",
    searchDescriptionEn: "Turn release notes or a case study into a LinkedIn post or caption with a human hook, evidence-led structure, and natural CTA, while keeping the facts intact.",
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
        answerZh: "很多人把 LinkedIn 帖子的正文称为 caption，尤其是在配图或视频时。Finfold 会把它们作为同一个内容任务处理，先写开场，再组织正文和 CTA。",
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
    relatedBlogSlug: "content-compounding-founder-system"
  },
  {
    slug: "reddit-post-generator",
    updatedAt: "2026-09-21",
    platform: "reddit",
    titleZh: "Reddit 帖子生成器",
    titleEn: "Reddit Post Generator",
    searchTitleZh: "免费 AI Reddit 帖子生成器｜发帖格式、社区规则与身份披露｜Finfold",
    searchTitleEn: "Reddit Post Generator for Community-Ready Drafts | Finfold",
    descriptionZh: "输入经历或产品信息，生成 Reddit 标题、正文和身份披露。",
    descriptionEn: "Turn an experience or product note into a Reddit title, post, and disclosure.",
    directAnswerZh: "把一段经历或产品信息写成社区愿意读的帖子。标题贴 subreddit 语境，格式符合版规，正文带诚实的作者身份披露，最后留一个别人能具体回答的问题。发布前会对照 flair、链接和自我推广规则再过一遍。",
    directAnswerEn: "Turn an experience or product note into a post a subreddit will actually read, with a title that fits the community, the right post format, honest maker disclosure, and one question people can answer with specifics. The draft is checked against flair, link, and self-promotion rules before you publish.",
    searchDescriptionZh: "把产品更新改成符合具体 subreddit 语境的 Reddit 标题、发帖格式和完整正文；发布前核对是否允许未加入用户发帖、flair、链接、自我推广与身份披露规则，并确保拿掉链接后内容仍然有用，最后由人工确认。",
    searchDescriptionEn: "Create subreddit-aware Reddit titles and posts with a usable format, honest disclosure, no-link value, flair and rule checks, and a specific question.",
    heroZh: "Reddit 帖子生成器",
    heroEn: "AI Reddit Post Generator",
    bestForZh: ["独立开发者分享产品与复盘", "需要适配具体 subreddit 规则与发帖格式的讨论帖", "想诚实披露利益关系的社区发帖"],
    bestForEn: ["Indie founders sharing products or lessons", "Discussion posts shaped for a subreddit's rules and format", "Community posts that disclose the maker relationship honestly"],
    outputsZh: ["Reddit 标题、发帖格式与完整正文", "身份披露和链接位置建议", "一个带背景、可被具体回答的问题"],
    outputsEn: ["A Reddit title, post format, and complete body", "Disclosure and link-placement guidance", "One contextual question people can answer specifically"],
    faq: [
      {
        questionZh: "没有加入 subreddit 可以发帖吗？",
        questionEn: "Can I post without joining a subreddit?",
        answerZh: "是否能发帖由具体 subreddit 当前设置和规则决定。加入社区不自动等于可以发帖，未加入也不一定被禁止；发布前查看规则、置顶帖和发帖表单提示，不确定时先联系版主。",
        answerEn: "It depends on the subreddit's current settings and rules. Joining does not automatically grant posting access, and not joining does not always block it. Check the rules, pinned posts, and submission form, or ask the moderators when uncertain."
      },
      {
        questionZh: "推广自己的产品需要披露吗？",
        questionEn: "Should I disclose that I built the product?",
        answerZh: "应该。直接说明你是产品作者通常比假装路人更可信，同时仍要遵守具体社区对自我推广和链接的规则。",
        answerEn: "Yes. Saying that you built the product is usually more trustworthy than pretending to be a passer-by, while each community's self-promotion and link rules still apply."
      },
      {
        questionZh: "Reddit 发帖格式通常包括什么？",
        questionEn: "What format should a Reddit post use?",
        answerZh: "通常包括标题、可选 flair、正文、必要的身份披露和社区允许的链接；有些 subreddit 还规定固定模板。以发布时的社区规则为准，并确保拿掉链接后正文仍提供有用经历、数据或问题。",
        answerEn: "A post usually has a title, optional flair, body, necessary disclosure, and any link the community allows. Some subreddits require a fixed template. Follow the current rules and make sure the body still offers useful experience, data, or a question without the link."
      }
    ],
    relatedBlogSlug: "reddit-post-patterns-popsy-ai"
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

const relatedToolSlugs: Record<string, string[]> = {
  "xiaohongshu-generator": ["wechat-article-generator", "linkedin-post-generator", "twitter-thread-generator"],
  "wechat-article-generator": ["xiaohongshu-generator", "linkedin-post-generator", "twitter-thread-generator"],
  "product-hunt-launch-copy": ["linkedin-post-generator", "twitter-thread-generator", "reddit-post-generator"],
  "twitter-thread-generator": ["linkedin-post-generator", "product-hunt-launch-copy", "reddit-post-generator"],
  "linkedin-post-generator": ["twitter-thread-generator", "product-hunt-launch-copy", "reddit-post-generator"],
  "reddit-post-generator": ["linkedin-post-generator", "twitter-thread-generator", "xiaohongshu-generator"]
};

export function getRelatedToolPages(slug: string): ToolPageConfig[] {
  return (relatedToolSlugs[slug] ?? [])
    .map((relatedSlug) => getToolPage(relatedSlug))
    .filter((tool): tool is ToolPageConfig => Boolean(tool));
}
