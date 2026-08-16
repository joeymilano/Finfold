export type UseCaseStep = {
  titleZh: string;
  titleEn: string;
  bodyZh: string;
  bodyEn: string;
};

export type UseCaseFaq = {
  questionZh: string;
  questionEn: string;
  answerZh: string;
  answerEn: string;
};

export type UseCaseGuideItem = {
  titleZh: string;
  titleEn: string;
  bodyZh: string;
  bodyEn: string;
};

export type UseCaseSearchGuide = {
  definitionTitleZh: string;
  definitionTitleEn: string;
  definitionBodyZh: string;
  definitionBodyEn: string;
  principles: UseCaseGuideItem[];
  decisionTitleZh: string;
  decisionTitleEn: string;
  decisionIntroZh: string;
  decisionIntroEn: string;
  goodFitZh: string[];
  goodFitEn: string[];
  poorFitZh: string[];
  poorFitEn: string[];
  guardrailZh: string;
  guardrailEn: string;
};

export type UseCasePageConfig = {
  slug: string;
  updatedAt: string;
  image: string;
  imageAltZh: string;
  imageAltEn: string;
  sceneLabelZh: string;
  sceneLabelEn: string;
  disclosureZh: string;
  disclosureEn: string;
  quoteZh: string;
  quoteEn: string;
  timeCostZh: string;
  timeCostEn: string;
  titleZh: string;
  titleEn: string;
  searchTitleZh?: string;
  searchTitleEn?: string;
  descriptionZh: string;
  descriptionEn: string;
  searchDescriptionZh?: string;
  searchDescriptionEn?: string;
  eyebrowZh: string;
  eyebrowEn: string;
  heroZh: string;
  heroEn: string;
  introZh: string;
  introEn: string;
  inputLabelZh: string;
  inputLabelEn: string;
  inputExampleZh: string;
  inputExampleEn: string;
  outputLabelZh: string;
  outputLabelEn: string;
  outputsZh: string[];
  outputsEn: string[];
  problemsZh: string[];
  problemsEn: string[];
  steps: UseCaseStep[];
  outcomesZh: string[];
  outcomesEn: string[];
  searchGuide?: UseCaseSearchGuide;
  faqs: UseCaseFaq[];
};

export const useCasePages: UseCasePageConfig[] = [
  {
    slug: "ai-marketing-for-founders",
    updatedAt: "2026-08-12",
    image: "/use-cases/founder-midnight-launch.webp",
    imageAltZh: "深夜厨房里，刚部署完产品的独立开发者面对空白发布稿和冷掉的面",
    imageAltEn: "An indie founder at a kitchen table after midnight, facing a blank launch draft and a cold bowl of noodles",
    sceneLabelZh: "一个独立开发者的凌晨 12:43",
    sceneLabelEn: "12:43 a.m. in an indie founder's kitchen",
    disclosureZh: "复合场景 · 为说明常见工作流而创作，不对应某位真实客户",
    disclosureEn: "Composite scenario · created to show a common workflow, not a real customer testimonial",
    quoteZh: "“我不是不想做营销。我只是每次做完产品，已经没有第二个脑子了。”",
    quoteEn: "“It isn't that I don't want to market the product. By the time I ship, I just don't have a second brain left.”",
    timeCostZh: "过去：一次产品更新，通常还要再熬 3–5 小时",
    timeCostEn: "Before: another 3–5 hours after every product update",
    titleZh: "凌晨 12:43，产品上线了，发布稿还是空的",
    titleEn: "12:43 a.m. The product is live. The launch post is still blank.",
    searchTitleZh: "创始人 AI 营销：把产品更新变成多平台发布内容 | Finfold",
    searchTitleEn: "AI Marketing for Founders Without a Content Team | Finfold",
    descriptionZh: "一个人把版本推上线之后，怎样把一周的提交、用户追问和艰难取舍，变成不同平台上有人愿意读的发布内容。",
    descriptionEn: "How a solo founder turns a week of commits, customer questions, and hard decisions into launch stories people will actually read.",
    searchDescriptionZh: "没有内容团队，也能把产品更新、用户问题和发布说明整理成 LinkedIn、X、Product Hunt 与小红书的原生文案和视觉方向。",
    searchDescriptionEn: "Turn one product update into launch posts and visuals for LinkedIn, X, Product Hunt, and Xiaohongshu—without rebuilding brand context in every AI chat.",
    eyebrowZh: "创始人 AI 营销 · 深夜发布",
    eyebrowEn: "AI marketing for founders · late-night launch",
    heroZh: "创始人 AI 营销：产品已经上线，内容团队还没来。",
    heroEn: "AI marketing for founders who ship before they have a content team.",
    introZh: "他把冷掉的面推到一边，准备写发布帖。四十分钟后，第一句还是“我们很高兴地宣布……”。\n\n这周明明发生了很多事：一次砍功能的决定、三个用户反复追问的问题、还有终于修好的那个怪 Bug。不是没有内容，是到了深夜，他已经没有力气把同一件事重新讲四遍。Finfold 接手的，正是这段最耗人的翻译工作。",
    introEn: "He pushes the cold noodles aside and opens a launch draft. Forty minutes later, the first line still reads, “We're excited to announce…”\n\nPlenty happened this week: one painful feature cut, three customers asking the same question, and a strange bug finally fixed. The story exists. At midnight, he simply has no energy to retell it four different ways. Finfold takes over that draining translation work.",
    inputLabelZh: "那晚手里有什么",
    inputLabelEn: "What he has that night",
    inputExampleZh: "我们刚上线团队协作功能：可以共享品牌资料、审批草稿，并追踪每个平台的发布状态。",
    inputExampleEn: "We just shipped team collaboration: shared brand context, draft approvals, and publishing status for every channel.",
    outputLabelZh: "一小时后手里有什么",
    outputLabelEn: "What he can have an hour later",
    outputsZh: ["Product Hunt tagline 与 Maker Comment", "LinkedIn 创始人复盘帖", "X 发布线程与短帖", "小红书图文结构与封面方向"],
    outputsEn: ["Product Hunt tagline and Maker Comment", "Founder-led LinkedIn launch post", "X launch thread and short updates", "Xiaohongshu note structure and cover direction"],
    problemsZh: ["版本上线只是下班的错觉，发布内容才是第二班", "GitHub、聊天记录和脑子里各藏着一块故事", "同一件事换个平台，又得从头找语气、配图和长度", "发完看一眼点赞就算了，下次还是凭感觉重来"],
    problemsEn: ["Shipping only creates the illusion that the day is over", "GitHub, chat logs, and one tired brain each hold a different piece of the story", "Every new channel means rebuilding the voice, image, and length", "A glance at likes replaces learning, so the next launch starts from instinct again"],
    steps: [
      {
        titleZh: "先把这周真正发生的事捞出来",
        titleEn: "Pull the real week back out of the mess",
        bodyZh: "放入发布说明、功能更新、用户原话或创始人观点。保留具体变化和证据，不先把它压缩成一条广告。",
        bodyEn: "Start with release notes, a feature update, customer language, or a founder point of view. Keep the concrete change and evidence before reducing it to promotional copy."
      },
      {
        titleZh: "同一个事实，换四种讲法",
        titleEn: "Tell the same fact four different ways",
        bodyZh: "Finfold 调用保存的品牌语气、受众和禁用词，再根据不同平台的阅读习惯生成独立草稿，而不是把同一段话复制十四次。",
        bodyEn: "Finfold applies saved voice, audience, and no-go words, then creates a distinct draft for each channel instead of copying the same paragraph fourteen times."
      },
      {
        titleZh: "文案和图，一起过一遍",
        titleEn: "Review the words and pictures in one pass",
        bodyZh: "为需要图片的平台准备封面、配图方向和常用尺寸，让审核发生在一个内容包里。",
        bodyEn: "Prepare covers, visual direction, and common platform sizes so review happens inside one coherent content package."
      },
      {
        titleZh: "下次别再从零猜",
        titleEn: "Stop guessing from zero next time",
        bodyZh: "记录链接和表现，比较哪些角度、格式和平台更有效，再把经过确认的经验加入品牌规则。",
        bodyEn: "Record links and performance, compare which angles and formats worked, and adopt confirmed lessons into the brand rules for the next update."
      }
    ],
    outcomesZh: ["每次产品更新都有清晰的对外叙事", "品牌语气不必在每个 AI 对话里重建", "国内与海外渠道可以由同一信号启动", "营销从临时任务变成可复盘的发布循环"],
    outcomesEn: ["Every release has a clear external narrative", "Brand voice does not need to be rebuilt in every AI chat", "China and global channels can start from the same signal", "Marketing becomes a reviewable publishing loop, not an emergency task"],
    searchGuide: {
      definitionTitleZh: "创始人 AI 营销，不是让机器人替你到处发帖",
      definitionTitleEn: "What AI marketing for founders actually means",
      definitionBodyZh: "创始人 AI 营销，是把你本来就拥有的产品证据——更新日志、用户原话、客服问题、产品取舍和创始人观点——整理成清晰定位、平台原生内容和可复盘的发布循环。AI 可以压缩研究、起草、跨平台改写和审核准备的时间；事实、立场、承诺与最终发布决定，仍然必须由创始人负责。",
      definitionBodyEn: "AI marketing for founders is not autopilot for every social account. It is a small operating system for turning evidence you already have — release notes, customer language, support questions, product decisions, and founder insight — into clear positioning, channel-native content, and a feedback loop. AI can compress research, drafting, adaptation, and review preparation. The founder still owns the facts, point of view, promises, and final decision to publish.",
      principles: [
        {
          titleZh: "先有信号，再写 prompt",
          titleEn: "Start with a signal, not a prompt",
          bodyZh: "输入一次真实变化：为什么做、替谁解决什么、有哪些限制。没有事实的长 prompt，只会更快地产出听起来正确的空话。",
          bodyEn: "Begin with one real change: why it exists, who it helps, what changed, and where the limits are. A longer prompt without evidence only produces polished emptiness faster."
        },
        {
          titleZh: "一条主线，不是十四份复制粘贴",
          titleEn: "Keep one narrative, not fourteen copies",
          bodyZh: "核心事实保持一致，但 Product Hunt 解释起因，LinkedIn 提炼经验，X 抛出判断，小红书需要具体场景与移动端节奏。",
          bodyEn: "Keep the central facts consistent while changing the entry point. Product Hunt explains the origin, LinkedIn carries the lesson, X sharpens the judgment, and Xiaohongshu needs a concrete scene and mobile rhythm."
        },
        {
          titleZh: "把人工判断放在正确的位置",
          titleEn: "Put human judgment at the checkpoints",
          bodyZh: "AI 可以整理和改写，但创始人要核对产品事实、删掉无法证明的承诺、选择真正要说的观点，并在发布前做最后审核。",
          bodyEn: "AI can organize and adapt. The founder verifies product facts, removes promises that cannot be proved, chooses the position worth taking, and makes the final review before anything goes live."
        },
        {
          titleZh: "让结果进入下一轮，而不是躺在后台",
          titleEn: "Carry the result into the next release",
          bodyZh: "记录链接、点击、试用、注册和高质量回复。把确认过的经验沉淀为品牌规则，而不是看到几个点赞就宣布找到了公式。",
          bodyEn: "Record links, clicks, trial starts, signups, and useful replies. Turn confirmed lessons into brand rules instead of declaring a formula after a handful of likes."
        }
      ],
      decisionTitleZh: "什么时候值得用，什么时候 AI 只会放大问题",
      decisionTitleEn: "When founder-led AI marketing fits — and when it amplifies the wrong problem",
      decisionIntroZh: "最适合被自动化的是重复整理和跨平台转换，不是还没有想清楚的定位。先判断团队现在卡在执行，还是卡在产品与市场本身。",
      decisionIntroEn: "The best work to automate is repeated organization and channel adaptation, not positioning that nobody has resolved. First decide whether the constraint is execution or the product-market story itself.",
      goodFitZh: [
        "产品频繁更新，但没有完整内容团队",
        "手里有真实发布说明、客户问题或创始人观点",
        "同一事实需要进入两到四个不同渠道",
        "愿意人工审核并记录点击、试用和注册结果"
      ],
      goodFitEn: [
        "You ship often but do not have a full content team",
        "You have real release notes, customer questions, or founder insight",
        "One product truth needs to travel across two to four channels",
        "You will review the drafts and measure clicks, trials, and signups"
      ],
      poorFitZh: [
        "团队还说不清产品到底为谁解决什么",
        "希望 AI 无人审核地批量自动发帖",
        "没有办法核实生成内容里的事实与承诺",
        "期待仅靠增加发布数量保证流量或收入"
      ],
      poorFitEn: [
        "The team cannot yet say who the product is for or what changes",
        "The goal is unattended, high-volume auto-posting",
        "Nobody can verify the facts and promises in generated copy",
        "More posts are expected to guarantee reach or revenue"
      ],
      guardrailZh: "Finfold 可以缩短从产品信号到可审核内容包的距离，但不会替你创造产品市场匹配、真实客户证据或平台分发。生成速度是杠杆；输入事实、人工判断和持续验证决定杠杆会把什么放大。",
      guardrailEn: "Finfold can shorten the distance from a product signal to a reviewable content package. It cannot manufacture product-market fit, customer evidence, or distribution. Generation speed is leverage; source quality, human judgment, and repeated measurement decide what that leverage amplifies."
    },
    faqs: [
      {
        questionZh: "Finfold 和直接使用 ChatGPT 有什么区别？",
        questionEn: "How is Finfold different from using ChatGPT directly?",
        answerZh: "ChatGPT 很适合生成单篇草稿。Finfold 负责草稿之外的重复工作流：保存品牌资料、按平台生成文案与视觉、记录发布状态和表现，并把确认过的经验带到下一次生成。",
        answerEn: "ChatGPT is useful for an individual draft. Finfold handles the repeatable workflow around it: saved brand context, channel-specific copy and visuals, publishing status, performance feedback, and lessons carried into the next generation."
      },
      {
        questionZh: "没有专职营销人员的小团队能用吗？",
        questionEn: "Can a team use Finfold without a full-time marketer?",
        answerZh: "可以。它面向需要持续宣传产品、但没有完整内容团队的创始人和精简团队。人工仍负责事实、判断和最终审核，Finfold 负责组织与加速重复步骤。",
        answerEn: "Yes. It is designed for founders and lean teams that need consistent product marketing without a full content department. Humans still own the facts, judgment, and final approval; Finfold organizes and accelerates the repeatable steps."
      },
      {
        questionZh: "创始人应该先把哪些材料交给 AI？",
        questionEn: "What should a founder give the AI first?",
        answerZh: "从一个具体信号开始：更新日志、客户反复提出的问题、一次产品取舍、演示录屏的转写或一段创始人观点。补充目标受众、已验证事实、不能承诺的边界和希望读者采取的下一步，比写一个很长但没有证据的 prompt 更有效。",
        answerEn: "Start with one concrete signal: release notes, a repeated customer question, a product tradeoff, a demo transcript, or a founder point of view. Add the target audience, verified facts, claims you cannot make, and the next action you want. That is more useful than a long prompt with no evidence."
      },
      {
        questionZh: "早期创始人应该同时运营多少个平台？",
        questionEn: "How many marketing channels should an early-stage founder use?",
        answerZh: "通常先选择一到三个受众真实出现、且团队能持续参与的平台。发布页、专业网络和目标社区承担的任务不同。Finfold 可以准备更多渠道版本，但更多产出不等于更好的分发策略。",
        answerEn: "Usually start with one to three places where the audience already spends time and where the team can keep participating. A launch directory, professional network, and target community serve different jobs. Finfold can prepare more versions, but more output is not a distribution strategy."
      },
      {
        questionZh: "AI 营销可以替代产品定位吗？",
        questionEn: "Can AI marketing replace product positioning?",
        answerZh: "不能。AI 可以帮助比较表达、整理客户语言和生成待测试的角度，但谁最需要产品、为什么现在需要、哪些承诺真实可信，仍要通过客户访谈、产品使用和市场反馈确认。",
        answerEn: "No. AI can compare expressions, organize customer language, and draft angles to test. Who needs the product most, why now, and which promises are credible still have to be learned through customer conversations, product use, and market response."
      }
    ]
  },
  {
    slug: "ai-marketing-for-small-business",
    updatedAt: "2026-08-16",
    image: "/use-cases/small-business-closing-review.webp",
    imageAltZh: "打烊后的小店里，一位经营者对照顾客便笺，审核电脑上准备好的营销任务",
    imageAltEn: "A small-business owner reviewing an AI-prepared marketing mission against customer notes after closing",
    sceneLabelZh: "一家小店打烊后的晚上 8:46",
    sceneLabelEn: "8:46 p.m. after a small shop closes",
    disclosureZh: "复合场景 · 为说明常见工作流而创作，不对应某位真实客户或业绩",
    disclosureEn: "Composite scenario · created to explain a common workflow, not a customer testimonial or performance claim",
    quoteZh: "“我需要有人把下一步准备好，但最终说什么，还是要由我决定。”",
    quoteEn: "“I need the next move prepared. I still need to decide what we actually say.”",
    timeCostZh: "过去：打烊以后再凭感觉想选题、写文案、找图片",
    timeCostEn: "Before: guessing at topics, copy, and visuals after closing",
    titleZh: "晚上 8:46，门已经关了，营销才刚轮到她",
    titleEn: "8:46 p.m. The shop is closed. Marketing is only just starting.",
    searchTitleZh: "小企业 AI 营销智能体｜可审核的增长工作流 | Finfold",
    searchTitleEn: "AI Marketing for Small Business | Finfold",
    descriptionZh: "没有内容团队的小企业，如何从网站诊断开始，把真实经营信号变成可审核的增长任务、平台原生内容和下一轮复盘。",
    descriptionEn: "A reviewable AI marketing workflow for small businesses: audit the website, prepare growth missions, create channel-native content, and learn from real outcomes.",
    searchDescriptionZh: "了解小企业如何使用 AI 营销智能体审查网站、准备增长任务、人工审核多平台内容，并用真实结果决定下一步。",
    searchDescriptionEn: "See how a small business can use an AI marketing agent to audit its website, prepare reviewable growth missions, and learn from outcomes without unattended publishing.",
    eyebrowZh: "小企业 AI 营销 · 人工审核",
    eyebrowEn: "AI marketing for small business · human reviewed",
    heroZh: "为没有内容团队的小企业准备下一步增长机会，并把决定权留给人。",
    heroEn: "A reviewable AI marketing agent for small businesses without a content team.",
    introZh: "她关掉门口的灯，桌上还留着今天顾客问过的三个问题：周末能不能预订、哪款适合送礼、有没有更小的包装。网站上没有答案，社交账号也已经十天没更新。\n\n她不缺一个会批量写帖的机器人。她缺的是有人先审查网站和真实经营信号，找出值得做的下一件事，准备好任务、内容和检查点，再由她判断是否准确、是否值得发布。Finfold 承担准备工作，不替经营者做无人值守的承诺。",
    introEn: "She switches off the front light. Three customer questions remain on the counter: Can I preorder for the weekend? Which option works as a gift? Is there a smaller pack? The website answers none of them, and the social account has been quiet for ten days.\n\nShe does not need a robot that posts at volume. She needs the website and real business signals reviewed, the next worthwhile opportunity identified, and a mission prepared with drafts and checkpoints. Finfold prepares that work. The owner verifies the facts, approves the promise, and decides whether anything should be published.",
    inputLabelZh: "经营者已经拥有的真实信号",
    inputLabelEn: "The real signals the owner already has",
    inputExampleZh: "网站页面、产品与服务信息、顾客反复提出的问题、门店活动、已发布内容，以及希望增加的预订或咨询。",
    inputExampleEn: "Website pages, products or services, repeated customer questions, store events, existing posts, and the booking or inquiry the business wants to improve.",
    outputLabelZh: "一组可审核的增长任务",
    outputLabelEn: "A reviewable growth mission",
    outputsZh: ["网站机会与证据清单", "一个有边界的增长任务", "适合目标平台的文案与视觉方向", "人工检查项、CTA 与结果记录"],
    outputsEn: ["A website opportunity and evidence list", "One bounded growth mission", "Channel-native copy and visual direction", "Human checks, CTA, and outcome tracking"],
    problemsZh: ["网站、顾客问题和社交内容彼此断开", "一天结束后才轮到营销，最容易变成临时发帖", "通用 AI 草稿不知道门店限制和真实承诺", "发布后只看点赞，无法判断是否带来咨询或预订"],
    problemsEn: ["The website, customer questions, and social content live in separate places", "Marketing starts after the working day and collapses into improvised posting", "Generic AI drafts do not know the shop's limits or verified promises", "Likes are checked, but inquiries, bookings, and useful replies are not carried forward"],
    steps: [
      {
        titleZh: "先审查网站，不先要求发帖",
        titleEn: "Audit the website before asking for posts",
        bodyZh: "检查定位、页面承诺、CTA、内容缺口和基础可发现性，并把每个机会对应到可见证据。没有证据的问题不会被包装成确定结论。",
        bodyEn: "Review positioning, claims, calls to action, content gaps, and basic discoverability. Tie every opportunity to visible evidence instead of dressing assumptions up as certainty."
      },
      {
        titleZh: "一次只准备一个值得验证的增长任务",
        titleEn: "Prepare one worthwhile growth mission at a time",
        bodyZh: "明确目标受众、业务目标、平台、事实边界、所需资产和成功信号，让任务小到可以审核，也小到可以在结果出来后调整。",
        bodyEn: "Define the audience, business goal, channel, factual limits, required assets, and success signal. Keep the mission small enough to review and revise when evidence returns."
      },
      {
        titleZh: "让经营者在关键承诺前停一下",
        titleEn: "Pause for the owner at every important promise",
        bodyZh: "Finfold 准备平台原生草稿和视觉方向；经营者核对价格、库存、服务范围、品牌语气和发布时机。未经人工批准，不把内容视为可发布。",
        bodyEn: "Finfold prepares channel-native drafts and visual direction. The owner verifies price, availability, service boundaries, voice, and timing. Nothing is treated as publishable without human approval."
      },
      {
        titleZh: "用真实结果决定下一轮",
        titleEn: "Let real outcomes choose the next move",
        bodyZh: "记录落地页访问、CTA、咨询、预订和高质量回复。确认有效的角度可以复用；没有反应的任务先调整承诺或渠道，而不是继续堆内容。",
        bodyEn: "Record landing visits, CTA actions, inquiries, bookings, and useful replies. Reuse angles that earn evidence. When a mission stalls, adjust the promise or channel before producing more content."
      }
    ],
    outcomesZh: ["网站问题与营销任务由同一证据连接", "每轮只执行一个可审核、可复盘的增长机会", "多平台内容共享事实，但保持平台原生表达", "点击、咨询或预订结果进入下一轮判断"],
    outcomesEn: ["Website issues and marketing missions share the same evidence", "Each cycle focuses on one reviewable opportunity", "Channel content shares facts without becoming copy-paste", "Clicks, inquiries, or bookings inform the next decision"],
    searchGuide: {
      definitionTitleZh: "什么是小企业 AI 营销智能体？",
      definitionTitleEn: "What is an AI marketing agent for small business?",
      definitionBodyZh: "小企业 AI 营销智能体是一套由 AI 加速、由经营者审核的营销工作流。它从网站和经营信号中发现机会，准备有目标、有证据、有边界的增长任务，再生成适合具体平台的待审核内容。它不是无人值守的社交媒体机器人，也不保证排名、流量或收入。",
      definitionBodyEn: "An AI marketing agent for small business is an AI-assisted, owner-reviewed workflow. It finds opportunities in the website and real operating signals, prepares a bounded growth mission with evidence, and creates channel-native content for review. It is not an unattended social-media bot, and it cannot guarantee rankings, traffic, or revenue.",
      principles: [
        { titleZh: "机会要能指出证据", titleEn: "Every opportunity needs evidence", bodyZh: "把页面缺口、顾客问题或内容表现与任务连接；无法确认的判断标记为假设。", bodyEn: "Connect each mission to a page gap, customer question, or observed outcome. Label anything unconfirmed as a hypothesis." },
        { titleZh: "任务要有业务下一步", titleEn: "A mission needs a business next step", bodyZh: "明确希望读者预约、咨询、注册还是阅读，而不是只追求发布数量。", bodyEn: "Define whether the reader should book, inquire, sign up, or learn more instead of optimizing for posting volume." },
        { titleZh: "内容要适配平台", titleEn: "Content must belong on the channel", bodyZh: "事实保持一致，开场、结构、画面和 CTA 根据平台与场景重新组织。", bodyEn: "Keep facts consistent while adapting the opening, structure, visual, and CTA to the channel and situation." },
        { titleZh: "结果要回到下一轮", titleEn: "Outcomes must return to the loop", bodyZh: "把点击、咨询、预订和真实回复带回判断，不把单次点赞当作增长证明。", bodyEn: "Carry clicks, inquiries, bookings, and real replies into the next decision instead of treating a few likes as proof of growth." }
      ],
      decisionTitleZh: "适合哪些小企业，不适合哪些目标？",
      decisionTitleEn: "Which small businesses fit — and which goals do not?",
      decisionIntroZh: "这套工作流适合已经有真实产品、服务和客户信号，但缺少持续营销执行能力的小团队。它不能替代产品质量、客户理解或人工责任。",
      decisionIntroEn: "This workflow fits small teams with a real product or service and some customer signal, but too little capacity for consistent marketing. It cannot replace product quality, customer understanding, or human responsibility.",
      goodFitZh: ["没有专职内容团队，但需要持续获得咨询或注册", "网站和顾客问题里已经有真实营销素材", "愿意一次验证一个明确任务", "有人可以审核事实、承诺与最终发布"],
      goodFitEn: ["No dedicated content team, but a need for steady inquiries or signups", "The website and customer questions already contain real source material", "A willingness to test one bounded mission at a time", "A human can verify facts, promises, and the final publication"],
      poorFitZh: ["希望完全无人审核地自动发帖", "没有人能确认价格、库存或服务承诺", "只想增加内容数量，不跟踪业务下一步", "期待 AI 保证搜索排名、流量或收入"],
      poorFitEn: ["The goal is completely unattended auto-posting", "Nobody can confirm price, availability, or service claims", "The only goal is more output with no business action measured", "AI is expected to guarantee search rankings, traffic, or revenue"],
      guardrailZh: "Finfold 可以准备任务和内容，但经营者必须核对事实、选择承诺并批准发布。复合场景与产品工作流不构成客户业绩证明。",
      guardrailEn: "Finfold can prepare missions and content. The owner must verify facts, choose the promise, and approve publication. Composite scenarios and product workflows are not customer performance evidence."
    },
    faqs: [
      { questionZh: "小企业如何使用 AI 做营销？", questionEn: "How can a small business use AI for marketing?", answerZh: "从一个真实业务目标和一组可核实材料开始，例如希望增加预约、网站页面、顾客常见问题和现有内容。让 AI 帮助审查、整理和起草，再由经营者核对事实并批准一次有边界的测试。", answerEn: "Start with one real business goal and verifiable source material, such as a booking target, website pages, common customer questions, and existing content. Let AI help audit, organize, and draft; then have the owner verify the facts and approve one bounded test." },
      { questionZh: "AI 营销智能体和营销自动化有什么区别？", questionEn: "How is an AI marketing agent different from marketing automation?", answerZh: "自动化通常执行预先定义的规则，例如在表单提交后发送邮件。AI 营销智能体还会根据上下文准备建议和内容，但输出具有不确定性，因此需要证据、边界和人工审核。", answerEn: "Automation usually executes predefined rules, such as sending an email after a form submission. An AI marketing agent also prepares recommendations and content from context, but its output is uncertain and therefore needs evidence, boundaries, and human review." },
      { questionZh: "Finfold 会自动发布社交媒体内容吗？", questionEn: "Does Finfold publish social content automatically?", answerZh: "不会把无人值守发布作为产品承诺。Finfold 准备任务、草稿和视觉方向；经营者应在发布前确认事实、语气、平台规则和业务承诺。", answerEn: "Unattended publishing is not the product promise. Finfold prepares missions, drafts, and visual direction; the owner should confirm facts, voice, platform rules, and business claims before publication." },
      { questionZh: "没有营销人员也能使用吗？", questionEn: "Can a business use it without a marketer?", answerZh: "可以，前提是仍有一位了解业务的人负责提供材料和做最终审核。Finfold 减少重复研究、整理和跨平台起草，不消除经营者的判断责任。", answerEn: "Yes, as long as someone who understands the business provides source material and performs final review. Finfold reduces repeated research, organization, and channel drafting; it does not remove the owner's responsibility for judgment." },
      { questionZh: "应该用什么结果判断是否有效？", questionEn: "What outcomes should a small business measure?", answerZh: "根据任务记录自然落地访问、CTA、咨询、预订、注册或高质量回复。曝光和点赞可以辅助判断，但不能替代与业务目标直接相关的结果。", answerEn: "Track organic landing visits, CTA actions, inquiries, bookings, signups, or useful replies according to the mission. Reach and likes can add context, but they do not replace outcomes tied to the business goal." }
    ]
  },
  {
    slug: "content-repurposing-for-solopreneurs",
    updatedAt: "2026-08-16",
    image: "/use-cases/solopreneur-content-studio.webp",
    imageAltZh: "晨光里的居家工作室，一位独立创作者把一篇长文拆成纸片、语音和画面顺序",
    imageAltEn: "A creator in a sunlit home studio turning one long essay into voice, paper, and visual sequences",
    sceneLabelZh: "一个一人公司的周三上午 10:17",
    sceneLabelEn: "10:17 a.m. on a solopreneur's Wednesday",
    disclosureZh: "复合场景 · 为说明常见工作流而创作，不对应某位真实客户",
    disclosureEn: "Composite scenario · created to show a common workflow, not a real customer testimonial",
    quoteZh: "“我想复用的是观点，不是把自己复印四份。”",
    quoteEn: "“I want to reuse the idea, not photocopy myself four times.”",
    timeCostZh: "过去：一篇长文拆四个平台，常常吃掉整个下午",
    timeCostEn: "Before: repurposing one essay could swallow an entire afternoon",
    titleZh: "周三上午 10:17，她不想把同一篇文章再说四遍",
    titleEn: "10:17 on Wednesday. She refuses to say the same essay four times.",
    searchTitleZh: "内容复用工作流｜一人公司 AI 多平台内容运营 | Finfold",
    searchTitleEn: "AI Content Repurposing Workflow for Solopreneurs | Finfold",
    descriptionZh: "一篇认真写完的长文，怎样变成四个平台各自成立的内容，又不把作者本人的声音磨成模板。",
    descriptionEn: "How one carefully written essay becomes four native pieces without sanding the creator's voice into a template.",
    searchDescriptionZh: "一套为一人公司设计的 AI 内容复用工作流：保留核心观点，并将长内容改编为 LinkedIn、X、Instagram 与小红书原生内容。",
    searchDescriptionEn: "A practical AI content repurposing workflow for turning one substantial source into native LinkedIn, X, Instagram, and Xiaohongshu content without flattening your voice.",
    eyebrowZh: "一人公司 · AI 内容复用工作流",
    eyebrowEn: "Solopreneur · AI content repurposing workflow",
    heroZh: "一套不把你写成模板的 AI 内容复用工作流。",
    heroEn: "An AI content repurposing workflow that does not flatten your voice.",
    introZh: "两千八百字终于写完了。里面有她报价太低吃过的亏，也有第一次拒绝烂项目时手心冒汗的细节。\n\n可一想到还要改 LinkedIn、X、Instagram 和小红书，她就开始烦：AI 很会切段，却常把那些真正像她的句子切没了。Finfold 先帮她守住那个不能丢的观点，再为每个平台重新找入口——不是把人复印四遍。",
    introEn: "The 2,800-word essay is finally done. It contains the cost of underpricing her work and the sweaty-palmed moment she first turned down a bad client.\n\nThen come LinkedIn, X, Instagram, and Xiaohongshu. AI is good at chopping paragraphs, but it often chops out the lines that sound most like her. Finfold protects the idea that must survive, then finds a different entry point for each channel.",
    inputLabelZh: "她舍不得丢掉的原稿",
    inputLabelEn: "The source she refuses to flatten",
    inputExampleZh: "一篇关于我如何从自由职业转向一人公司的复盘：三个错误、一次定价调整，以及最终留下的工作方式。",
    inputExampleEn: "An essay about moving from freelancing to a one-person company: three mistakes, one pricing change, and the operating system that remained.",
    outputLabelZh: "四种不同的讲法",
    outputLabelEn: "Four genuinely different tellings",
    outputsZh: ["LinkedIn 经验型长帖", "X 观点线程与短句", "Instagram 轮播结构和配图方向", "小红书故事型笔记"],
    outputsEn: ["Experience-led LinkedIn post", "X point-of-view thread and short posts", "Instagram carousel structure and visual direction", "Story-led Xiaohongshu note"],
    problemsZh: ["长文刚写完，人已经被掏空了", "复制粘贴很快，但每个平台都看得出它是外来户", "AI 最先删掉的，往往正是那些不规整却像本人的句子", "忙着多发几条，却没空记住哪句话真的打动过人"],
    problemsEn: ["The long essay is done, and so is most of her attention", "Copy-paste is quick, but it makes the work feel foreign everywhere", "AI often deletes the untidy lines that sound most like the author", "Publishing more leaves no time to remember which sentence actually moved somebody"],
    steps: [
      {
        titleZh: "先圈出那句绝不能丢的话",
        titleEn: "Circle the one line that must survive",
        bodyZh: "标出核心结论、证据、故事节点和你真正使用的语言。平台格式可以变化，但这些内容不应被模板替换。",
        bodyEn: "Mark the central conclusion, evidence, story beats, and language you actually use. The platform format can change; those elements should not be replaced by a template."
      },
      {
        titleZh: "四个平台，四个不同的开场",
        titleEn: "Four channels, four honest openings",
        bodyZh: "LinkedIn 可以从职业经验切入，X 可以先给尖锐结论，Instagram 需要可视化顺序，小红书更重视具体场景与移动端阅读。",
        bodyEn: "LinkedIn can open with professional experience, X with the sharp conclusion, Instagram with a visual sequence, and Xiaohongshu with a concrete situation and mobile reading rhythm."
      },
      {
        titleZh: "像同一个人，但别像同一张复印件",
        titleEn: "Sound like one person, not one photocopy",
        bodyZh: "保存常用语气、受众、范文和禁用词。每个平台的表达可以变化，但读者仍能认出是同一个人。",
        bodyEn: "Save tone, audience, approved examples, and no-go words. The expression can change by platform while still sounding recognizably like the same person."
      },
      {
        titleZh: "把真正打动人的那一段留下来",
        titleEn: "Keep the part that actually moved people",
        bodyZh: "比较哪些主题带来收藏、回复、点击或咨询。下一次优先扩展被验证的角度，而不是机械增加发布频率。",
        bodyEn: "Compare which themes produce saves, replies, clicks, or conversations. Expand validated angles next time instead of mechanically increasing posting frequency."
      }
    ],
    outcomesZh: ["一个长内容形成一组有区别的发布资产", "个人语气在不同平台保持可识别", "配图与画布尺寸进入同一复用流程", "表现好的观点可以被持续深化"],
    outcomesEn: ["One substantial piece becomes a differentiated publishing set", "Your voice stays recognizable across channels", "Visual direction and canvas sizes join the same workflow", "Ideas that perform well can be developed further"],
    searchGuide: {
      definitionTitleZh: "什么是内容复用工作流？",
      definitionTitleEn: "What is a content repurposing workflow?",
      definitionBodyZh: "内容复用是从一份有证据、有观点的原始内容中提取不可丢失的事实、故事和表达，再按照各平台的阅读方式重新组织。AI 内容复用可以加速分析、起草与格式适配，但不应把同一段文字机械复制到每个平台，也不应凭空补充来源中没有的事实。",
      definitionBodyEn: "Content repurposing extracts the facts, stories, and point of view that must survive from one substantial source, then rebuilds them for the reading behavior of each channel. AI content repurposing can accelerate analysis, drafting, and format adaptation. It should not copy one paragraph everywhere or invent facts that were never in the source.",
      principles: [
        { titleZh: "先锁定不可丢失的信息", titleEn: "Lock the non-negotiable source", bodyZh: "圈出核心观点、证据、原话与限制，让平台改编不改变事实。", bodyEn: "Mark the central claim, evidence, original language, and limits so channel adaptation cannot change the facts." },
        { titleZh: "按平台重建开场", titleEn: "Rebuild the opening for the channel", bodyZh: "同一观点在 LinkedIn、X、Instagram 和小红书需要不同的阅读入口，而不是统一模板。", bodyEn: "The same idea needs a different entry point on LinkedIn, X, Instagram, and Xiaohongshu instead of one universal template." },
        { titleZh: "文案与视觉一起适配", titleEn: "Adapt copy and visuals together", bodyZh: "让画面顺序、封面和常见尺寸承接正文证据，减少发布前的二次返工。", bodyEn: "Make the visual sequence, cover, and common canvas sizes carry the evidence in the copy, reducing last-mile rework." },
        { titleZh: "保留表现证据", titleEn: "Keep outcome evidence", bodyZh: "记录点击、收藏、回复或咨询，判断应该扩展哪个观点，而不是只统计发了多少条。", bodyEn: "Record clicks, saves, replies, or inquiries to decide which idea deserves expansion instead of counting how many posts were produced." }
      ],
      decisionTitleZh: "哪些内容适合复用，哪些不适合？",
      decisionTitleEn: "Which source material is ready to repurpose?",
      decisionIntroZh: "高价值内容复用需要一份足够具体的来源。原稿越接近真实经验、产品事实或客户问题，跨平台改编越有辨识度。",
      decisionIntroEn: "Useful content repurposing needs a specific source. The closer it is to real experience, product facts, or customer questions, the more distinctive each channel adaptation can remain.",
      goodFitZh: ["已经发布或即将发布的深度文章", "有细节与取舍的产品更新", "访谈、播客或演示的完整转写", "包含真实问题与回答的活动复盘"],
      goodFitEn: ["A substantial article that is published or nearly ready", "A product update with concrete detail and tradeoffs", "A complete interview, podcast, or demo transcript", "An event recap containing real questions and answers"],
      poorFitZh: ["只有一句宽泛主题，没有事实来源", "需要编造客户故事或业绩数据", "要求所有平台完全使用同一段文案", "希望无人审核地批量自动发布"],
      poorFitEn: ["A broad topic with no factual source", "A request to invent customer stories or performance data", "A requirement to use identical copy everywhere", "A goal of unattended high-volume publishing"],
      guardrailZh: "Finfold 复用的是已提供的事实、观点和故事，不会把生成速度当成原创证据。发布前仍需人工核对引用、产品承诺和平台语境。",
      guardrailEn: "Finfold repurposes supplied facts, ideas, and stories; generation speed is not original evidence. A human should still verify references, product claims, and channel context before publication."
    },
    faqs: [
      {
        questionZh: "Finfold 能复用哪些内容？",
        questionEn: "What content can Finfold repurpose?",
        answerZh: "可以从产品更新、文章、用户反馈、活动复盘、个人观点或一段原始说明开始。输入越具体，生成内容越容易保留真实细节和独特立场。",
        answerEn: "You can start from a product update, article, customer insight, event recap, point of view, or a detailed rough note. More specific source material makes it easier to preserve real detail and a distinct position."
      },
      {
        questionZh: "内容会在所有平台完全一样吗？",
        questionEn: "Will the content be identical on every platform?",
        answerZh: "不会。核心事实和观点保持一致，但开头、长度、结构、视觉方向和行动引导会根据平台与目标调整。",
        answerEn: "No. The central facts and point of view remain consistent, while the opening, length, structure, visual direction, and next action adapt to the channel and goal."
      },
      {
        questionZh: "AI 内容复用和摘要有什么区别？",
        questionEn: "How is AI content repurposing different from summarization?",
        answerZh: "摘要主要压缩原文；内容复用会为新的平台和目标重新组织叙事，同时保留关键事实和观点。一个好的平台版本可以比摘要更短，也可以因为补充必要上下文而更具体。",
        answerEn: "A summary primarily compresses. Content repurposing rebuilds the narrative for a new channel and goal while preserving the essential facts and point of view. A useful channel version may be shorter, or more specific when context is needed."
      },
      {
        questionZh: "一篇内容应该复用到多少个平台？",
        questionEn: "How many channels should one piece be repurposed for?",
        answerZh: "选择受众真实出现、且你能持续参与的两到四个平台通常更可控。Finfold 可以准备更多格式，但渠道数量不应替代对受众和目标的判断。",
        answerEn: "Two to four channels where the audience actually spends time and where you can keep participating are usually manageable. Finfold can prepare more formats, but channel count should not replace audience and goal decisions."
      },
      {
        questionZh: "Finfold 会虚构原文没有的例子吗？",
        questionEn: "Will Finfold invent examples that are not in the source?",
        answerZh: "工作流要求把来源事实与待验证假设分开。任何新增例子、数字或承诺都应被标记并由人工核对；缺少证据时，应删除或改写为明确假设。",
        answerEn: "The workflow separates source facts from hypotheses. Any new example, number, or promise should be flagged and reviewed by a human; without evidence, it should be removed or stated clearly as a hypothesis."
      }
    ]
  },
  {
    slug: "ecommerce-product-launch-content",
    updatedAt: "2026-08-03",
    image: "/use-cases/ecommerce-dawn-launch.webp",
    imageAltZh: "清晨仓库里，两人跨境团队在货架和纸箱之间拍摄一只可折叠旅行杯",
    imageAltEn: "A two-person ecommerce team photographing a collapsible travel cup among shelves and boxes at dawn",
    sceneLabelZh: "一个两人跨境团队的清晨 6:20",
    sceneLabelEn: "6:20 a.m. for a two-person cross-border team",
    disclosureZh: "复合场景 · 为说明常见工作流而创作，不对应某位真实客户",
    disclosureEn: "Composite scenario · created to show a common workflow, not a real customer testimonial",
    quoteZh: "“同一个杯子，不该在两个市场里活成两个产品。”",
    quoteEn: "“The same cup shouldn't turn into two different products in two markets.”",
    timeCostZh: "过去：中英文各改各的，卖点越改越散",
    timeCostEn: "Before: separate China and global drafts slowly pulled the product story apart",
    titleZh: "早上 6:20，仓库要开门了，两套发布文案还在打架",
    titleEn: "6:20 a.m. The warehouse is opening. Two launch stories still disagree.",
    descriptionZh: "两个人、一个新品、两套市场语言。怎样在开门前守住同一组产品事实，又让各个平台说人话。",
    descriptionEn: "Two people, one launch, two markets: keep the same product facts while making every channel sound local and human.",
    eyebrowZh: "跨境电商 · 新品首发",
    eyebrowEn: "Ecommerce · product launch",
    heroZh: "杯子只有一个。中文稿和英文稿，却快把它写成了两个产品。",
    heroEn: "There is one cup. The China and global drafts have nearly turned it into two products.",
    introZh: "仓库还有四十分钟开门。阿晴在补小红书封面，Leo 刚把英文稿里的主卖点改成“省背包空间”。中文稿却还在讲食品级硅胶，桌上两张卖点表越改越不像一家人。\n\n问题不在翻译，而在大家各自拿着半套事实往前冲。Finfold 先锁住材质、尺寸、限制和真实用户反馈，再让不同市场选择各自最能打动人的场景。",
    introEn: "The warehouse opens in forty minutes. One teammate is fixing a Xiaohongshu cover while the other changes the English lead benefit to “saves bag space.” The Chinese draft still leads with food-grade silicone. Their two message boards barely look related.\n\nTranslation isn't the real problem. Each person is racing ahead with half the facts. Finfold locks the materials, dimensions, limitations, and real customer language first, then lets each market choose the situation that matters most.",
    inputLabelZh: "清晨桌上的新品事实",
    inputLabelEn: "The product facts on the table",
    inputExampleZh: "一款可折叠旅行咖啡杯：食品级硅胶、收纳后高度 5 厘米、可放洗碗机，首批用户最常提到的是节省背包空间。",
    inputExampleEn: "A collapsible travel coffee cup: food-grade silicone, five centimeters tall when packed, dishwasher safe, with early customers repeatedly mentioning saved bag space.",
    outputLabelZh: "开门前对齐的渠道资产",
    outputLabelEn: "Aligned assets before the doors open",
    outputsZh: ["Instagram 场景化图文与视觉顺序", "Facebook 产品故事与卖点说明", "小红书体验型笔记和 3:4 封面", "公众号新品介绍长文结构"],
    outputsEn: ["Instagram use-case caption and visual sequence", "Facebook product story and benefit explanation", "Xiaohongshu experience note and 3:4 cover", "WeChat launch article structure"],
    problemsZh: ["参数表写得很全，用户为什么要买却说不清", "中英文各改各的，最后像在卖两件东西", "一边补尺寸、一边找旧图，开卖前永远差最后一块", "首发评论里藏着好素材，忙完就再也没人回头看"],
    problemsEn: ["The spec sheet is complete, but the reason to buy is still missing", "China and global drafts drift until they sound like different products", "Someone is always hunting for the final crop, size, or old image before launch", "Useful language appears in launch comments and then rots in the dashboard"],
    steps: [
      {
        titleZh: "先把不能写错的事实钉死",
        titleEn: "Nail down the facts that cannot be wrong",
        bodyZh: "先整理材质、尺寸、功能、适用场景、限制和已有客户原话，避免在生成过程中把推测写成产品承诺。",
        bodyEn: "Organize materials, dimensions, functions, use cases, limitations, and real customer language first so generation does not turn an assumption into a product promise."
      },
      {
        titleZh: "同一个卖点，在不同市场落到不同生活里",
        titleEn: "Put the same benefit into different lives",
        bodyZh: "同一卖点可以对应通勤、旅行、送礼或环保等不同场景。根据目标受众选择主线，而不是直译同一个标题。",
        bodyEn: "The same feature can support commuting, travel, gifting, or waste-reduction stories. Choose the lead situation for the target audience instead of translating one headline."
      },
      {
        titleZh: "卖点、画面和尺寸一起对上",
        titleEn: "Line up the benefit, image, and canvas",
        bodyZh: "让文案的证据点与图片顺序对应，并按平台准备 1:1、3:4、9:16 等常见画布，减少后期重新排版。",
        bodyEn: "Match proof points in the copy to the visual sequence, then prepare common 1:1, 3:4, and 9:16 canvases to reduce downstream reformatting."
      },
      {
        titleZh: "别让首发评论烂在后台里",
        titleEn: "Do not let launch comments rot in the dashboard",
        bodyZh: "记录用户反复提到的疑问、场景和表达，确认哪些可以成为后续内容规则，哪些只是一次性反馈。",
        bodyEn: "Record repeated questions, situations, and customer language, then decide which should become future content rules and which are one-off feedback."
      }
    ],
    outcomesZh: ["中英文渠道共享同一组产品事实", "新品卖点与真实使用场景建立联系", "文案、封面和配图方向同步审核", "客户反馈成为后续常青内容的素材"],
    outcomesEn: ["China and global channels share one product fact base", "Product benefits connect to a real customer situation", "Copy, covers, and visual direction are reviewed together", "Customer feedback becomes source material for evergreen content"],
    faqs: [
      {
        questionZh: "Finfold 是商品详情页生成器吗？",
        questionEn: "Is Finfold a product-description generator?",
        answerZh: "它可以生成产品内容，但重点是跨平台发布工作流：从同一份新品资料出发，生成不同渠道的文案与视觉方向，并记录发布后的表现。商品参数和合规承诺仍应由团队核对。",
        answerEn: "It can generate product content, but its focus is the cross-channel publishing workflow: one launch source becomes channel-specific copy and visual direction, followed by performance tracking. Your team should still verify specifications and compliance claims."
      },
      {
        questionZh: "是否支持中文和海外平台？",
        questionEn: "Does it support both China and global channels?",
        answerZh: "支持。Finfold 覆盖小红书、公众号、朋友圈，以及 X、LinkedIn、Instagram、Facebook、Reddit、Product Hunt 等渠道，并让同一品牌资料服务于不同语言与市场。",
        answerEn: "Yes. Finfold covers Xiaohongshu, WeChat Official Account and Moments, plus X, LinkedIn, Instagram, Facebook, Reddit, Product Hunt, and other channels, with shared brand context across languages and markets."
      }
    ]
  }
];

export function getUseCasePage(slug: string): UseCasePageConfig | undefined {
  return useCasePages.find((page) => page.slug === slug);
}
