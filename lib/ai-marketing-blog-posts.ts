import type { BlogPost } from "@/lib/blog-posts";

const authorZh = "Joey Zhao · Finfold 创始人";
const authorEn = "Joey Zhao · Founder of Finfold";

export const aiMarketingBlogPosts: BlogPost[] = [
  {
    slug: "ai-marketing-agent-vs-automation",
    publishedAt: "2026-08-16",
    updatedAt: "2026-08-16",
    platform: "AI Marketing",
    readingMinutes: 8,
    authorZh,
    authorEn,
    disclosureZh: "产品工作分析 · 基于 Finfold 当前可审核工作流与常见营销自动化模式，不代表客户业绩，也不保证流量、排名或收入。",
    disclosureEn: "Product workflow analysis · based on Finfold's current reviewable workflow and common automation patterns, not a customer result or a promise of traffic, rankings, or revenue.",
    titleZh: "AI 营销智能体和营销自动化，不是同一个按钮的两个名字",
    titleEn: "AI Marketing Agent vs Automation: What Small Teams Need",
    seoTitleZh: "AI 营销智能体 vs 营销自动化：小团队怎么选",
    seoTitleEn: "AI Marketing Agent vs Automation: What Small Teams Need",
    descriptionZh: "自动化擅长重复执行，Agent 擅长从上下文准备下一步。小团队真正需要的，是知道哪里可以交给规则，哪里必须保留人工判断。",
    descriptionEn: "Automation executes known rules. An AI marketing agent prepares the next move from context. Small teams need a clear boundary between the two.",
    seoDescriptionZh: "比较 AI 营销智能体与营销自动化的区别、适用场景、人工审核边界，并用三个小实验判断小团队应该先补哪一层。",
    seoDescriptionEn: "Compare AI marketing agents with marketing automation, including use cases, human-review boundaries, and three practical tests for small teams.",
    kickerZh: "增长现场 07 · AGENT 还是 AUTOMATION",
    kickerEn: "FIELD NOTE 07 · AGENT OR AUTOMATION",
    introZh: "周一上午，一家三人 SaaS 团队发现首页注册下滑。最容易的反应是再加一条自动邮件，或者让 AI 一口气写二十条帖子。两个动作都很快，也都可能绕开真正的问题：访客根本没看懂首页在替谁解决什么。\n\nAI 营销智能体和营销自动化的差别，不在有没有 AI 字样，而在任务是否已经确定。已确定的动作可以交给规则执行；还需要从网站、受众和结果里判断“下一步值得做什么”的任务，需要 Agent 准备建议、证据和草稿，并在关键承诺前停下来等人审核。",
    introEn: "On Monday morning, a three-person SaaS team sees signup conversion fall. The easy response is another automated email or twenty AI-written posts. Both are fast. Both can avoid the real issue: visitors may not understand who the homepage is for.\n\nThe difference between an AI marketing agent and marketing automation is not the presence of the letters AI. It is whether the task is already known. A known action can follow a rule. A task that still requires deciding what is worth doing needs an agent to prepare a recommendation, evidence, and draft — then stop for human review before an important promise is made.",
    sectionsZh: [
      {
        heading: "自动化回答“什么时候执行”，Agent 先回答“值得执行什么”",
        body: "营销自动化适合确定关系：提交表单后发送欢迎邮件、用户七天未登录时触发提醒、发布后记录链接。这些流程的条件和动作可以预先写清楚。\n\nAgent 面对的是开放问题：哪个页面阻碍注册、哪个顾客问题值得变成内容、哪个平台更适合这次任务。它可以审查上下文并准备方案，但因为判断包含不确定性，输出必须带证据和审核点。",
        pullQuote: "规则已经清楚，就自动化；下一步还没想清楚，就先让 Agent 准备判断。"
      },
      {
        heading: "小团队最危险的不是自动化少，而是把错误动作放大",
        body: "如果首页定位模糊，自动发送更多流量只会让更多人更快离开。如果内容没有真实来源，批量生成只会扩大空话的面积。\n\n先要求每个增长任务写清五件事：目标受众、可见证据、业务下一步、人工核对项和成功信号。写不出来时，问题还不适合进入自动化队列。",
        pullQuote: "自动化是放大器。放进去的是错误判断，出来的只会是更稳定的错误。"
      },
      {
        heading: "人工审核不是拖慢系统，而是系统的一部分",
        body: "价格、库存、服务范围、产品能力和合规承诺不能由模型自行决定。Agent 可以把这些字段标成检查项，准备不同表达，并指出来源；最终发布仍由了解业务的人批准。\n\n真正可扩展的工作流，不是每次人工从头写，而是把人的判断放在事实、承诺和发布三个关口，把整理、改编和记录交给系统。",
        pullQuote: "把人从重复劳动里拿出来，不等于把人从责任里拿掉。"
      },
      {
        heading: "组合方式：Agent 准备任务，自动化执行已批准的部分",
        body: "一个稳妥的循环可以是：Agent 审查网站与结果，准备一个有边界的增长任务；人核对事实并批准；自动化负责 UTM、提醒、状态记录或已明确的跟进；结果再回到下一轮判断。\n\nFinfold 当前承诺的是准备可审核任务与平台原生内容，不承诺无人值守发布。这个边界让小团队先获得执行杠杆，同时保留对品牌和客户的责任。",
        pullQuote: "最好的组合不是 Agent 取代自动化，而是让每一层只做它能负责的事。"
      }
    ],
    sectionsEn: [
      {
        heading: "Automation answers when to execute. An agent first asks what is worth doing.",
        body: "Marketing automation fits known relationships: send a welcome email after a form, trigger a reminder after seven inactive days, or record a link after publication. The condition and action can be defined in advance.\n\nAn agent faces open questions: which page blocks signup, which customer question deserves content, or which channel fits this mission. It can inspect context and prepare a plan, but uncertainty means the output needs evidence and a review checkpoint.",
        pullQuote: "When the rule is known, automate it. When the next move is uncertain, prepare the decision first."
      },
      {
        heading: "A small team is not endangered by too little automation. It is endangered by amplified mistakes.",
        body: "If homepage positioning is unclear, automatically sending more traffic helps more people leave faster. If the source material contains no evidence, bulk generation only expands the surface area of empty copy.\n\nRequire every mission to name the audience, visible evidence, business next step, human checks, and success signal. If those five cannot be written down, the work is not ready for an automation queue.",
        pullQuote: "Automation is an amplifier. A mistaken decision becomes a more reliable mistake."
      },
      {
        heading: "Human review is part of the system, not friction outside it.",
        body: "Price, availability, service boundaries, product capabilities, and regulated claims cannot be delegated to a model. An agent can mark them as checks, prepare alternative language, and point to sources. A person who understands the business approves the final publication.\n\nA scalable workflow does not ask a human to draft everything. It places human judgment at the facts, promises, and publication checkpoints while the system handles organization, adaptation, and records.",
        pullQuote: "Removing repetitive labour does not remove human responsibility."
      },
      {
        heading: "The useful combination: an agent prepares; automation executes approved rules.",
        body: "A defensible loop looks like this: an agent audits the website and outcomes, then prepares one bounded mission. A human verifies and approves it. Automation handles UTMs, reminders, status records, or a defined follow-up. Results return to the next decision.\n\nFinfold currently promises reviewable missions and channel-native content preparation, not unattended publishing. That boundary gives a small team leverage without surrendering responsibility for its brand and customers.",
        pullQuote: "An agent should not replace automation. Each layer should do only the work it can own."
      }
    ],
    experimentTitleZh: "用三个小实验画出你自己的边界",
    experimentTitleEn: "Three small tests to draw your own boundary",
    experimentsZh: [
      { label: "01 / 列规则", body: "写下本周所有营销动作，只把条件与动作都确定的项目标成“可自动化”。" },
      { label: "02 / 找证据", body: "选一个待做任务，为它补齐受众、证据、业务下一步、审核点和成功信号。" },
      { label: "03 / 断一次", body: "模拟模型或发布渠道不可用，确认人仍能看见任务状态并阻止错误承诺上线。" }
    ],
    experimentsEn: [
      { label: "01 / LIST RULES", body: "List this week's marketing actions. Mark only the ones with a known condition and action as automatable." },
      { label: "02 / FIND EVIDENCE", body: "Choose one open task and add its audience, evidence, next action, review points, and success signal." },
      { label: "03 / BREAK IT", body: "Simulate a model or channel failure. Confirm a person can see the state and stop a false claim from going live." }
    ]
  },
  {
    slug: "ai-marketing-for-small-business-without-content-team",
    publishedAt: "2026-08-16",
    updatedAt: "2026-08-16",
    platform: "Small Business",
    readingMinutes: 8,
    authorZh,
    authorEn,
    disclosureZh: "复合场景与产品工作流 · 文中的烘焙店不对应真实客户，未声称任何曝光、咨询、预订或收入结果。",
    disclosureEn: "Composite scenario and product workflow · the bakery is not a real customer, and no reach, inquiry, booking, or revenue result is claimed.",
    titleZh: "没有内容团队，小企业也不该把每个晚上都交给营销",
    titleEn: "AI Marketing for Small Business Without a Content Team",
    seoTitleZh: "没有内容团队的小企业，如何使用 AI 做营销",
    seoTitleEn: "AI Marketing for Small Business Without a Content Team",
    descriptionZh: "从网站和顾客问题里找到一个真实机会，准备一个可审核的任务，再用咨询、预订或注册决定下一步。",
    descriptionEn: "Find one real opportunity in the website and customer questions, prepare a reviewable mission, and let inquiries, bookings, or signups guide the next move.",
    seoDescriptionZh: "一套适合没有内容团队的小企业 AI 营销流程：网站诊断、机会优先级、人工审核、平台内容与业务结果复盘。",
    seoDescriptionEn: "A practical AI marketing workflow for a small business without a content team: website audit, opportunity selection, human review, channel content, and outcome learning.",
    kickerZh: "增长现场 08 · 打烊后的第二份工作",
    kickerEn: "FIELD NOTE 08 · THE SECOND SHIFT AFTER CLOSING",
    introZh: "一家社区烘焙店打烊后，经营者把当天的便笺摊在桌上。三个顾客都问了周末预订，网站却只有产品照片和营业时间。她本来准备发一条“周末限定，欢迎到店”，但这句话既没回答预订，也没有明确下一步。\n\n小企业的 AI 营销不应该从“今天发什么”开始，而应该从“哪个真实问题最值得解决”开始。网站、顾客原话和业务目标提供证据；AI 帮忙审查、整理和准备；经营者核对事实与承诺；结果再决定下一轮。",
    introEn: "After a neighbourhood bakery closes, the owner spreads the day's notes across the counter. Three customers asked about weekend preorders, yet the website contains only product photos and opening hours. She was about to post, “Weekend special — come visit.” It answers neither the preorder question nor the next step.\n\nAI marketing for a small business should not start with “What should we post today?” It should start with “Which real problem is worth solving?” The website, customer language, and business goal supply evidence. AI audits and prepares. The owner verifies the facts and promise. The outcome chooses the next cycle.",
    sectionsZh: [
      {
        heading: "先从网站找摩擦，而不是从内容日历找空格",
        body: "查看首页是否说清服务对象、核心页面是否回答高频问题、CTA 是否能让人预约或咨询、移动端是否容易完成动作。把每个问题对应到具体页面和顾客原话。\n\n这一步可能发现最值得做的不是社交帖子，而是一段预订说明、一个 FAQ 或更清楚的按钮。营销任务应该服从客户路径，不该服从日历空位。",
        pullQuote: "内容日历会问哪里还空着，客户路径会问人在哪里停住。"
      },
      {
        heading: "一次选择一个能验证的增长机会",
        body: "把机会写成任务：为周末预订人群补一页说明，并准备 Instagram 与小红书内容把人带到预约入口。写清受众、页面、平台、事实边界、CTA 和观察指标。\n\n任务越具体，经营者越容易判断“值得不值得做”，也越容易在两周后承认它没有产生信号。",
        pullQuote: "小企业不需要更多营销任务，需要更少但能给出答案的任务。"
      },
      {
        heading: "AI 准备草稿，经营者审核现实世界",
        body: "AI 不知道周末产能、临时缺货、配送半径或某个承诺会不会拖垮门店。把这些信息列成发布前检查表，比要求模型“更准确”更可靠。\n\n经营者核对价格、库存、时间、范围、语气和图片授权。需要改动时，把原因记录为品牌或业务规则，让下一次准备少犯同样的错。",
        pullQuote: "模型负责组织语言，经营者负责组织现实。"
      },
      {
        heading: "用咨询、预订和注册复盘，不用发布数量自我安慰",
        body: "为落地页和 CTA 保留来源，记录自然访问、按钮点击、咨询、预订或注册。曝光可以说明标题是否被看见，业务动作才能说明承诺是否被理解。\n\n如果页面已收录但没有曝光，检查意图与内链；有曝光但点击率低，改标题与描述；有访问却无人行动，先改页面承诺和 CTA，不继续堆文章。",
        pullQuote: "发布是成本发生的时刻，结果才是学习开始的时刻。"
      }
    ],
    sectionsEn: [
      {
        heading: "Find friction in the website before filling a content calendar.",
        body: "Check whether the homepage names the customer, important pages answer repeated questions, calls to action lead to a booking or inquiry, and the mobile path can be completed. Connect every issue to a page and customer language.\n\nThe best next move may be a preorder explanation, an FAQ, or a clearer button — not another social post. The mission should serve the customer path rather than an empty calendar slot.",
        pullQuote: "A content calendar asks where the gap is. A customer path asks where the person stopped."
      },
      {
        heading: "Choose one growth opportunity that can answer a question.",
        body: "Write the mission clearly: add a weekend preorder page, then prepare Instagram and Xiaohongshu content that leads to the booking action. Name the audience, page, channel, factual limits, CTA, and observed outcome.\n\nSpecific work is easier for an owner to approve, and easier to admit did not produce a signal after two weeks.",
        pullQuote: "A small business needs fewer missions, each capable of giving an answer."
      },
      {
        heading: "AI prepares the draft. The owner reviews the physical world.",
        body: "AI does not know weekend capacity, an unexpected stock shortage, the delivery radius, or which promise will overwhelm the shop. Listing these as pre-publication checks is more reliable than asking a model to “be more accurate.”\n\nThe owner verifies price, availability, timing, service boundaries, voice, and image rights. Record the reason for each correction as a brand or operating rule so the next mission makes fewer repeated mistakes.",
        pullQuote: "The model organizes language. The owner organizes reality."
      },
      {
        heading: "Review inquiries, bookings, and signups — not output volume.",
        body: "Preserve the landing source and CTA, then record organic visits, button actions, inquiries, bookings, or signups. Reach can show whether a title was seen. A business action shows whether the promise was understood.\n\nIf a page is indexed but earns no impressions, revisit intent and internal links. If it earns impressions but few clicks, revise the title and description. If visits produce no action, fix the promise and CTA before adding more articles.",
        pullQuote: "Publication is where the cost occurs. Outcomes are where learning begins."
      }
    ],
    experimentTitleZh: "不用招内容团队，也能先跑的三个实验",
    experimentTitleEn: "Three tests you can run before hiring a content team",
    experimentsZh: [
      { label: "01 / 记问题", body: "连续五天记录顾客重复问的问题，选出现频率最高且能带来业务下一步的一项。" },
      { label: "02 / 修一页", body: "先在网站回答这个问题并设置明确 CTA，再准备两个平台的内容入口。" },
      { label: "03 / 看动作", body: "两周后比较自然访问、CTA、咨询或预订；没有业务动作就先改承诺。" }
    ],
    experimentsEn: [
      { label: "01 / LOG QUESTIONS", body: "For five days, record repeated customer questions. Choose the most frequent one tied to a business action." },
      { label: "02 / FIX ONE PAGE", body: "Answer it on the website with a clear CTA, then prepare channel-native entry points for two platforms." },
      { label: "03 / WATCH ACTIONS", body: "After two weeks, compare organic visits, CTA actions, inquiries, or bookings. Revise the promise if no action appears." }
    ]
  },
  {
    slug: "human-reviewed-ai-social-media-manager",
    publishedAt: "2026-08-16",
    updatedAt: "2026-08-16",
    platform: "Social Media",
    readingMinutes: 7,
    authorZh,
    authorEn,
    disclosureZh: "产品工作流说明 · 描述 Finfold 的人工审核边界，不构成自动发布承诺、客户证言或平台增长保证。",
    disclosureEn: "Product workflow explanation · describes Finfold's human-review boundary, not an auto-publishing promise, customer testimonial, or platform-growth guarantee.",
    titleZh: "AI 社交媒体经理最重要的能力，是知道什么时候停下来等人",
    titleEn: "A Human-Reviewed AI Social Media Manager Workflow",
    seoTitleZh: "人工审核的 AI 社交媒体经理工作流",
    seoTitleEn: "A Human-Reviewed AI Social Media Manager Workflow",
    descriptionZh: "从证据清单到平台原生草稿，再到人工批准和结果复盘：一套不把品牌交给无人值守发布的 AI 社交媒体流程。",
    descriptionEn: "From an evidence brief to channel-native drafts, human approval, and outcome review: an AI social media workflow without unattended publishing.",
    seoDescriptionZh: "了解人工审核的 AI 社交媒体经理工作流，包括事实核对、平台适配、审批边界、发布记录和结果复盘。",
    seoDescriptionEn: "Learn a human-reviewed AI social media manager workflow covering source verification, channel adaptation, approval boundaries, publication records, and outcome review.",
    kickerZh: "增长现场 09 · 发布按钮前的那次停顿",
    kickerEn: "FIELD NOTE 09 · THE PAUSE BEFORE PUBLISH",
    introZh: "周四下午，系统为一场周末活动准备了 Instagram、LinkedIn 和小红书草稿。画面顺序完整，语气也像品牌，只有一个问题：草稿写着“所有门店均可参加”，而真实活动只有两个城市。\n\n这不是一个更强 prompt 能彻底解决的问题。社交内容会碰到库存、地域、合规、图片授权和品牌承诺。AI 社交媒体经理真正可靠的工作方式，是把来源和不确定项摆在草稿旁边，在关键事实前请求审核，并把人的修改带回下一轮。",
    introEn: "On Thursday afternoon, the system prepares Instagram, LinkedIn, and Xiaohongshu drafts for a weekend event. The visual sequence is complete and the voice feels right. One problem remains: the copy says “available in every store,” while the event exists in only two cities.\n\nA stronger prompt cannot eliminate this class of problem. Social content touches inventory, geography, regulation, image rights, and brand promises. A reliable AI social media manager places sources and uncertainty beside the draft, requests review before important facts, and carries human corrections into the next cycle.",
    sectionsZh: [
      {
        heading: "第一步不是写，而是建立可核对的任务简报",
        body: "任务简报包含目标、受众、平台、事实来源、不能说什么、需要什么图片和希望读者采取的下一步。缺少来源的数字或客户故事，不进入草稿。\n\n同一活动的核心事实只维护一份，避免三个平台各自“补全”成三个版本的现实。",
        pullQuote: "社交草稿可以有很多份，事实底稿只能有一份。"
      },
      {
        heading: "平台原生不是换字数，是换阅读动作",
        body: "LinkedIn 适合解释一次判断及其证据；Instagram 需要让画面顺序先成立；小红书更依赖具体生活场景与移动端节奏；X 可以把主张压成更清楚的取舍。\n\n适配时保留事实、改变入口。简单删字或加 emoji 不是平台策略。",
        pullQuote: "同一个品牌可以换语气的步速，不能换掉事实的地基。"
      },
      {
        heading: "把审核分成事实、品牌与平台三个关口",
        body: "事实审核确认价格、日期、范围、产品能力和引用；品牌审核确认语气、承诺与敏感表达；平台审核确认格式、披露、链接、图片授权和当下规则。\n\nFinfold 准备检查点与内容包，但不把未经审核的草稿当成可无人值守发布的成品。",
        pullQuote: "审批不是一句“看起来可以”，而是三种不同责任的签字。"
      },
      {
        heading: "发布后保留链接与结果，让下一次少猜一点",
        body: "记录最终版本、落地链接、UTM、发布时间和人工修改原因，再比较访问、CTA、高质量回复或注册。确认有效的表达进入品牌规则；一次性的异常不会被直接总结成平台定律。\n\n平台会变化，因此每次建议都要标明它来自事实、支持性假设，还是仍然证据不足。",
        pullQuote: "结果不是给模型发奖状，是给下一次判断减少一点盲区。"
      }
    ],
    sectionsEn: [
      {
        heading: "The first step is not writing. It is a verifiable mission brief.",
        body: "The brief contains the goal, audience, channel, factual sources, forbidden claims, required images, and reader action. A number or customer story without a source does not enter the draft.\n\nMaintain one factual base for the event so three channels cannot each “complete” reality differently.",
        pullQuote: "There can be many social drafts. There should be one factual source of truth."
      },
      {
        heading: "Channel-native does not mean changing the word count.",
        body: "LinkedIn can explain a decision and its evidence. Instagram needs a visual sequence that works first. Xiaohongshu depends on a concrete life situation and mobile rhythm. X can compress the claim into a clear tradeoff.\n\nAdapt the entry point while preserving the facts. Deleting words or adding emoji is not a platform strategy.",
        pullQuote: "A brand can change the pace of its voice without changing the foundation of its facts."
      },
      {
        heading: "Separate review into facts, brand, and platform.",
        body: "Fact review checks price, dates, geography, product capability, and references. Brand review checks voice, promises, and sensitive language. Platform review checks format, disclosure, links, image rights, and current rules.\n\nFinfold prepares checkpoints and the content package. It does not treat an unreviewed draft as a finished asset for unattended publication.",
        pullQuote: "Approval is not one vague ‘looks good.’ It is three kinds of responsibility."
      },
      {
        heading: "Keep the published link and outcome so the next cycle guesses less.",
        body: "Record the final version, landing link, UTMs, publication time, and reason for human edits. Then compare visits, CTA actions, useful replies, or signups. Confirmed expressions can enter brand rules; a one-off anomaly should not become a platform law.\n\nBecause platforms change, label each recommendation as confirmed, a supported hypothesis, or insufficient evidence.",
        pullQuote: "Outcomes are not a report card for the model. They reduce the next decision's blind spots."
      }
    ],
    experimentTitleZh: "发布前给工作流做三次刹车测试",
    experimentTitleEn: "Three brake tests for the workflow",
    experimentsZh: [
      { label: "01 / 抽来源", body: "随机抽一个数字、日期和产品承诺，确认审核者能一眼找到来源。" },
      { label: "02 / 换平台", body: "比较三个平台草稿：核心事实一致，但开场、结构和 CTA 不能只是复制。" },
      { label: "03 / 留痕迹", body: "记录一次人工修改的原因，确认它能进入下一轮品牌或业务规则。" }
    ],
    experimentsEn: [
      { label: "01 / TRACE SOURCES", body: "Pick one number, date, and product claim. Confirm the reviewer can find each source immediately." },
      { label: "02 / SWITCH CHANNELS", body: "Compare three drafts. Facts should match; opening, structure, and CTA should not be copies." },
      { label: "03 / KEEP THE EDIT", body: "Record why a human changed one line and carry that reason into the next brand or operating rule." }
    ]
  },
  {
    slug: "content-repurposing-workflow",
    publishedAt: "2026-08-16",
    updatedAt: "2026-08-16",
    platform: "Content Repurposing",
    readingMinutes: 8,
    authorZh,
    authorEn,
    disclosureZh: "工作流示例 · 以一篇虚构但现实的独立顾问长文为例，不对应客户内容或已验证的流量与转化结果。",
    disclosureEn: "Workflow example · uses a fictional but realistic consultant essay, not customer content or a verified traffic or conversion result.",
    titleZh: "内容复用不是把一篇长文切碎，而是让一个观点在不同平台重新成立",
    titleEn: "Content Repurposing Workflow for Social Media",
    seoTitleZh: "社交媒体内容复用工作流：从长内容到平台原生版本",
    seoTitleEn: "Content Repurposing Workflow for Social Media",
    descriptionZh: "从来源拆解、观点锁定、平台改编到结果记录：把一份长内容变成 LinkedIn、X、Reddit 和小红书各自成立的版本。",
    descriptionEn: "Move from source analysis and idea locking to channel adaptation and outcome records across LinkedIn, X, Reddit, and Xiaohongshu.",
    seoDescriptionZh: "一套可执行的 AI 内容复用工作流，为 LinkedIn、X、Reddit 与小红书生成平台原生草稿，同时保留事实、作者声音和人工审核。",
    seoDescriptionEn: "A practical AI content repurposing workflow for native LinkedIn, X, Reddit, and Xiaohongshu drafts that preserves source facts, author voice, and human review.",
    kickerZh: "增长现场 10 · 一份来源，四种阅读动作",
    kickerEn: "FIELD NOTE 10 · ONE SOURCE, FOUR READING MODES",
    introZh: "一位独立顾问写完 2,800 字复盘：她如何停止按小时收费，哪些客户因此离开，以及为什么最终交付反而更清楚。把全文交给通用 AI 后，得到四份“拥抱价值定价”的正确摘要，代价是故事、犹豫和边界全都不见了。\n\n高价值内容复用不是切片数量，而是先定义什么绝不能丢，再为每个平台重新建立阅读入口。LinkedIn 需要经验与证据，X 需要清晰判断，Reddit 需要上下文与透明身份，小红书需要具体生活场景。它们共享来源，不共享模板。",
    introEn: "An independent consultant finishes a 2,800-word reflection on leaving hourly pricing: which clients walked away, what became clearer, and where value pricing still does not fit. A generic AI returns four correct summaries about “embracing value.” The story, hesitation, and boundaries disappear.\n\nUseful content repurposing is not a slicing contest. First define what must survive, then rebuild the reading entry point for each channel. LinkedIn needs experience and evidence. X needs a clear judgment. Reddit needs context and transparent identity. Xiaohongshu needs a concrete life situation. They share a source, not a template.",
    sectionsZh: [
      {
        heading: "建立来源地图：事实、观点、故事、原话与边界",
        body: "先把原稿分成五类。事实回答发生了什么；观点回答作者相信什么；故事保留时间、动作和代价；原话保留个人声音；边界说明这个经验不适用于哪里。\n\n所有平台版本都必须能追溯到来源地图。需要新增例子时，明确标成待验证素材，而不是让模型补成“真实经历”。",
        pullQuote: "先决定什么不能丢，再讨论一份内容能变成多少份。"
      },
      {
        heading: "每个平台只选择一个最自然的入口",
        body: "LinkedIn 可以从一次职业取舍开始，X 先抛出“按小时收费让效率变成惩罚”的判断，Reddit 交代行业和失败背景，小红书从周五晚上仍在计时的场景开始。\n\n核心结论一致，但证据顺序、长度、画面和 CTA 根据平台改变。平台原生的判断标准，是删掉品牌名后内容仍然值得读。",
        pullQuote: "适配不是换包装，是让同一个观点学会从不同的门进来。"
      },
      {
        heading: "建立两次人工审核：忠于来源，也忠于平台",
        body: "第一次审核只看事实：数字、引语、客户信息、因果和承诺是否来自来源。第二次审核看表达：是否仍像作者、是否尊重社区规范、图片是否有权使用、CTA 是否与读者下一步一致。\n\n如果一个平台版本必须靠虚构冲突才能成立，宁可不发。复用的目标是增加来源的使用价值，不是增加未经证实的故事。",
        pullQuote: "忠于平台不能以背叛来源为代价。"
      },
      {
        heading: "用结果选择下一次扩展，不机械复用每一篇",
        body: "记录每个版本的落地访问、点击、收藏、高质量回复、咨询或注册。某个角度在 X 有回复、在 LinkedIn 有点击，可以分别深化；没有信号的版本先检查入口与受众。\n\n不是每篇长文都值得拆四个平台。只有来源具体、观点清楚、与业务下一步相关的内容，才进入复用队列。",
        pullQuote: "真正的复用系统，也知道哪些内容不值得继续复用。"
      }
    ],
    sectionsEn: [
      {
        heading: "Build a source map: facts, position, story, language, and limits.",
        body: "Separate the source into five groups. Facts say what happened. Position says what the author believes. Story preserves time, action, and cost. Original language protects the voice. Limits show where the lesson does not fit.\n\nEvery channel draft must trace back to this map. If a new example is needed, label it for verification instead of letting the model complete it as lived experience.",
        pullQuote: "Decide what cannot be lost before counting how many assets one source can become."
      },
      {
        heading: "Choose one natural entry point for each channel.",
        body: "LinkedIn can begin with a professional tradeoff. X can lead with the judgment that hourly pricing turns efficiency into a penalty. Reddit needs the industry and failed attempts. Xiaohongshu can open on a Friday night with the timer still running.\n\nThe conclusion remains consistent while evidence order, length, visuals, and CTA change. A channel-native draft should remain useful when the brand name is removed.",
        pullQuote: "Adaptation is not new packaging. It teaches one idea to enter through different doors."
      },
      {
        heading: "Review twice: once for the source, once for the channel.",
        body: "The first review checks whether numbers, quotations, client information, causality, and promises come from the source. The second checks voice, community norms, image rights, and whether the CTA matches the reader's next step.\n\nIf a version needs an invented conflict to work, do not publish it. Repurposing should increase the source's usefulness, not the volume of unverified stories.",
        pullQuote: "Belonging on the channel cannot come at the cost of betraying the source."
      },
      {
        heading: "Let outcomes choose the next expansion.",
        body: "Record landing visits, clicks, saves, useful replies, inquiries, or signups for each version. An angle that earns replies on X and clicks on LinkedIn can be deepened differently. A silent version needs its entry point and audience reviewed first.\n\nNot every long article belongs on four channels. Only specific sources with a clear position and a business next step should enter the repurposing queue.",
        pullQuote: "A real repurposing system also knows which content should not be repurposed again."
      }
    ],
    experimentTitleZh: "拿一篇旧长文跑一次完整复用",
    experimentTitleEn: "Run one old source through the full workflow",
    experimentsZh: [
      { label: "01 / 画来源图", body: "分别标出事实、观点、故事、原话与边界，删除无法追溯的新增细节。" },
      { label: "02 / 开四扇门", body: "为 LinkedIn、X、Reddit 和小红书各写一个不同入口，核心结论保持一致。" },
      { label: "03 / 留结果账", body: "给每个版本记录访问、点击、回复或咨询，下一轮只扩展有证据的角度。" }
    ],
    experimentsEn: [
      { label: "01 / MAP THE SOURCE", body: "Mark facts, position, story, original language, and limits. Remove any new detail that cannot be traced." },
      { label: "02 / OPEN FOUR DOORS", body: "Write distinct LinkedIn, X, Reddit, and Xiaohongshu openings while keeping the core conclusion stable." },
      { label: "03 / KEEP THE LEDGER", body: "Record visits, clicks, replies, or inquiries for each version. Expand only the angles that earn evidence." }
    ]
  }
];
