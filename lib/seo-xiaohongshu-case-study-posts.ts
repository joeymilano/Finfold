import type { BlogPost } from "@/lib/blog-posts";

const authorZh = "Finfold 编辑部";
const authorEn = "Finfold Editorial";
const accessedAt = "2026-08-24";

export const seoXiaohongshuCaseStudyPosts: BlogPost[] = [
  {
    slug: "seo-new-keyword-game-case-study",
    publishedAt: "2026-08-24",
    updatedAt: "2026-08-24",
    platform: "SEO",
    readingMinutes: 11,
    authorZh,
    authorEn,
    disclosureZh: "公开账号自述和原始后台截图 · 100 万 UV、290 万 PV 等数字来自作者小虎的 30 天复盘，未做独立审计。Google 规则以官方文档为准。",
    disclosureEn: "Public-handle account and original dashboard screenshots · the 1M users and 2.9M pageviews figures come from Xiaohu's 30-day retrospective and are not independently audited. Google guidance comes from official documentation.",
    titleZh: "凌晨四点上线的小游戏，30 天跑到 100 万 UV，也在第十天突然掉下去",
    titleEn: "A Game Shipped at 4 A.M. Reached 1M Users in 30 Days, Then Fell Off a Cliff on Day Ten",
    seoTitleZh: "出海 SEO 真实案例｜小游戏 30 天 100 万 UV 的起落",
    seoTitleEn: "International SEO Case Study: A Game's Run to 1M Users",
    descriptionZh: "小虎追到一个刚冒头的新词，连夜做站，四天后单日接近 10 万 UV。流量随后塌下去，他在广告、UGC、多语言和页面结构之间来回排查，却没法替下跌找到唯一答案。",
    descriptionEn: "Xiaohu found a rising query, built through the night, and reported nearly 100K daily users by day four. Then traffic collapsed, leaving ads, UGC, localization, and page structure tangled in one imperfect diagnosis.",
    seoDescriptionZh: "复盘一个出海 SEO 小游戏从新词发现、凌晨上线、四天接近 10 万单日 UV，到点击率跌至 0.1% 后清理广告、UGC 与多语言页面的完整过程。",
    seoDescriptionEn: "An international SEO case covering new-query discovery, an overnight launch, 100K daily users, a 0.1% CTR crash, UGC cleanup, and multilingual recovery.",
    kickerZh: "增长案例 16 · 流量先冲上去，诊断还留在地面",
    kickerEn: "GROWTH CASE 16 · TRAFFIC TOOK OFF BEFORE THE DIAGNOSIS WAS READY",
    introZh: "5 月 5 日晚上十一点，小虎在找新词。他先看了最近二十四小时和四小时的趋势，又翻搜索结果，发现这个词正在涨，排在前面的页面却没有接住用户想玩的那件事。域名买下来以后，他一直写到凌晨四点才把小游戏交出去。域名里还拼错了一个字母。\n\n5 月 7 日，他记录到 6000 UV。第二天是 1.6 万。5 月 9 日接近 10 万。这个开头很适合被剪成一条励志帖，后半段却更值得读。Supabase 在高峰里倒下，主词点击率一度掉到 0.1%，他同时撤广告、清 UGC、加语言页、改链接。排名后来回来了，他仍然没把功劳硬塞给某一个动作。",
    introEn: "At 11 p.m. on May 5, Xiaohu was looking for new queries. He checked the last 24 hours and four hours in Trends, then read the search results and saw a rising term whose leading pages did not match what users wanted to play. He bought a domain and kept building until 4 a.m. The domain also contained a typo.\n\nHe recorded 6,000 users on May 7, 16,000 the next day, and nearly 100,000 on May 9. That opening could be cut into a tidy motivational post. The second half is more useful. Supabase fell over at peak load, the main query's click-through rate reached 0.1%, and he removed ads, cleaned UGC, added languages, and changed links at the same time. Rankings later returned, but he did not pretend one change deserved all the credit.",
    sectionsZh: [
      {
        heading: "那个拼错的域名先带来流量，也留下了一笔修复账",
        body: "小虎上线后才发现域名拼错。他没有换一个全新站点重来，而是保留已经被发现的页面，再用 301 把访问导向正确地址。他称这段拼写错误后来仍带来数万次访问。这个结果带着很强的偶然性，不能拿来当选域名的方法。\n\n能复用的部分发生在买域名前。他看的是新需求有没有持续抬头，搜索结果有没有答错意图，自己能不能在几个小时内给出可玩的页面。新词给了时间差，页面还得把承诺兑现。",
        pullQuote: "拼写错误是插曲，发现搜索意图的时间差才是工作。"
      },
      {
        heading: "访问涨到十万以后，最先报警的是数据库",
        body: "网站不只放了一个游戏。小虎加了分享、留言墙和排行榜，先做前 50，随后扩到前 100，又按用户时区补了历史榜和每日榜。用户有了回来看的理由，读写请求也跟着放大。5 月 9 日前后，Supabase 撑不住了。他人在徒步，只能用手机重启服务，之后再处理并发和防滥用。\n\n这段经历把一个常被忽略的成本摊开了。抢到新词只是入口，互动功能会把一个静态页面变成需要值守的产品。排行榜、评论审核和机器人防护都要算进上线清单。",
        pullQuote: "搜索把人送到门口，数据库决定门会不会当场掉下来。"
      },
      {
        heading: "第十天的下跌没有等来一个漂亮答案",
        body: "小虎接入过 Adsterra，排名下滑后又撤掉，因为那点收入不值得继续冒险。Search Console 截图显示，5 月 16 日主词有 19292 次展示，点击只有 25 次，点击率是 0.1%。与此同时，用户名和几小时前之类的 UGC 文案在页面里反复出现，冲淡了主题词。\n\n他把排行榜和评论从承担搜索内容的文档里拆开，又根据用户地区补德语、西班牙语、葡萄牙语和俄语页面，并配置 sitemap 与 hreflang。问题在于这些动作和 Google 更新挤在一起。5 月 21 日前后主词回到约 1.x 位，公开材料仍不足以证明是哪一步救了它。",
        pullQuote: "同时改四件事，能救火，却很难留下干净的因果。"
      },
      {
        heading: "一百万 UV 之后，普通团队该留下什么预期",
        body: "小虎最终自报 30 天约 100 万 UV、290 万 PV。早期 GA4 截图显示 86.8 万活跃用户和 240 万浏览，Search Console 另一张截图显示 102 万点击。这些后台图彼此接近，仍旧属于作者公开的自报数据。\n\n主词最差的时候，其他语言和长尾词让网站维持约两万日访问。对下一个小站来说，更稳妥的目标是先找到一个意图缺口，交付能用的页面，再观察七天索引和四周查询变化。短期爆发可能发生，不能写进预算表。",
        pullQuote: "把百万流量当故事读，把意图、稳定性和长尾当作业做。"
      }
    ],
    sectionsEn: [
      {
        heading: "The misspelled domain brought traffic and left a repair bill",
        body: "Xiaohu noticed the domain typo only after launch. He kept the page that search had already found and used a 301 redirect toward the correct address. He says the misspelling later generated tens of thousands of visits. That outcome is too accidental to become domain-selection advice.\n\nThe reusable work happened before the purchase. He checked whether demand kept rising, whether results missed the user's intent, and whether he could ship a playable answer in hours. The query created a time window. The page still had to fulfill its promise.",
        pullQuote: "The typo was an accident. The useful work was spotting the intent gap early."
      },
      {
        heading: "When daily users approached 100,000, the database complained first",
        body: "The site grew beyond one game. Xiaohu added sharing, a message wall, and leaderboards, moving from a top 50 to a top 100 and then historical and daily boards based on user time zones. Return reasons also multiplied reads and writes. Around May 9, Supabase failed. He was hiking and restarted it from his phone before addressing concurrency and abuse prevention.\n\nThe episode exposes a cost that keyword stories often omit. A new query is only the entrance. Interactive features turn a static page into a product that needs coverage, moderation, and bot protection.",
        pullQuote: "Search brought people to the door. The database decided whether the door stayed attached."
      },
      {
        heading: "The day-ten drop never produced a neat answer",
        body: "Xiaohu tried Adsterra and removed it after rankings fell because the revenue was not worth the risk. A Search Console screenshot shows 19,292 impressions and 25 clicks for the main query on May 16, a 0.1% CTR. Meanwhile, usernames and phrases such as 'hours ago' repeated through the UGC and diluted the page topic.\n\nHe separated leaderboards and comments from the search document, added German, Spanish, Portuguese, and Russian pages based on user geography, and configured sitemaps and hreflang. These changes overlapped with a Google update. The term returned to roughly position 1.x around May 21, but the public record cannot isolate the cause.",
        pullQuote: "Changing four things can stop a fire and still leave no clean causal story."
      },
      {
        heading: "A realistic expectation after the million-user headline",
        body: "Xiaohu ultimately reported about one million users and 2.9 million pageviews in 30 days. An earlier GA4 screenshot shows 868,000 active users and 2.4 million views, while another Search Console image shows 1.02 million clicks. The screenshots are directionally consistent but remain author-reported.\n\nWhen the main query was weakest, other languages and long-tail queries reportedly kept the site near 20,000 daily visits. A safer target for another small site is to find one intent gap, ship a useful page, watch indexing for seven days, and review query movement over four weeks. A spike may happen. It does not belong in the forecast.",
        pullQuote: "Read the million-user figure as a story. Treat intent, resilience, and long tail as the work."
      }
    ],
    experimentTitleZh: "用四周做一次不混因果的新词测试",
    experimentTitleEn: "Run a four-week new-query test without tangling the causes",
    experimentsZh: [
      { label: "01 / 留意图", body: "保存趋势、搜索结果和用户任务截图，写下页面要补的空位。" },
      { label: "02 / 控变量", body: "一周只改一类页面因素，广告、UGC 和语言页分开记录。" },
      { label: "03 / 算值守", body: "上线前测数据库、审核和防滥用，给突然上涨留一条退路。" }
    ],
    experimentsEn: [
      { label: "01 / SAVE INTENT", body: "Save Trends, result-page, and user-task evidence before defining the missing answer." },
      { label: "02 / SEPARATE CHANGES", body: "Change one page factor per week and log ads, UGC, and localization separately." },
      { label: "03 / PRICE OPERATIONS", body: "Load-test the database, moderation, and abuse controls before a spike arrives." }
    ],
    caseStudies: [
      {
        subjectName: "小虎",
        publicHandle: "野生小虎",
        product: "公开复盘中的网页小游戏",
        timeframeZh: "2026 年 5 月起的 30 天",
        timeframeEn: "Thirty days beginning in May 2026",
        verificationZh: "公开账号自述和后台截图",
        verificationEn: "Public-handle account with dashboard screenshots",
        goalZh: "用新词意图缺口验证第一次出海 SEO",
        goalEn: "Test a first international SEO project through a new-query intent gap",
        actionsZh: ["检查短期趋势与竞争", "连夜上线可玩页面", "补排行榜与分享", "清理 UGC 并增加语言页"],
        actionsEn: ["Checked short-term trends and competition", "Shipped a playable page overnight", "Added leaderboards and sharing", "Cleaned UGC and added language pages"],
        resultZh: "作者自报 30 天 100 万 UV、290 万 PV，主词经历急跌后恢复",
        resultEn: "The author reported 1M users and 2.9M pageviews in 30 days, with the main term recovering after a sharp fall",
        failureZh: "数据库中断，多项修复同时发生，无法确认单一恢复原因",
        failureEn: "The database failed and multiple fixes overlapped, preventing a single-cause diagnosis",
        sourceUrl: "https://new.web.cafe/topic/vs1k9fojsk"
      }
    ],
    sources: [
      { titleZh: "小虎的 30 天出海 SEO 复盘", titleEn: "Xiaohu's 30-day international SEO retrospective", url: "https://new.web.cafe/topic/vs1k9fojsk", kind: "public-handle-firsthand", accessedAt, supportsZh: "支撑时间线、后台截图、技术故障、调整动作和作者自报结果。", supportsEn: "Supports the timeline, dashboard screenshots, technical failure, changes, and author-reported outcome." },
      { titleZh: "Google 多语言页面说明", titleEn: "Google guidance on localized page versions", url: "https://developers.google.com/search/docs/advanced/crawling/localized-versions", kind: "official", accessedAt, supportsZh: "支撑独立语言 URL、hreflang 和 sitemap 的官方边界。", supportsEn: "Supports official guidance for separate locale URLs, hreflang, and sitemaps." },
      { titleZh: "Google 搜索垃圾内容政策", titleEn: "Google Search spam policies", url: "https://developers.google.com/search/docs/essentials/spam-policies", kind: "official", accessedAt, supportsZh: "支撑用户生成垃圾内容和操纵搜索的风险边界。", supportsEn: "Supports policy boundaries for user-generated spam and search manipulation." }
    ]
  },
  {
    slug: "geo-citation-recommendation-experiment",
    publishedAt: "2026-08-24",
    updatedAt: "2026-08-24",
    platform: "GEO / AI Search",
    readingMinutes: 10,
    authorZh,
    authorEn,
    disclosureZh: "公司实验与公开方法 · 34 个页面、9886 份回答和结果图表由 Ahrefs 团队发布，实验使用自家 Brand Radar，未经过独立复现，也没有提供收入归因。",
    disclosureEn: "Company-run experiment with a public method · Ahrefs published the 34 pages, 9,886 answers, and charts using its own Brand Radar. The work has not been independently replicated and includes no revenue attribution.",
    titleZh: "他发了 34 个自荐页面，AI 引用以后却有 43% 没提自己的会",
    titleEn: "He Published 34 Self-Promotional Pages. AI Cited Them and Still Skipped His Conference 43% of the Time",
    seoTitleZh: "GEO 真实实验｜AI 引用网页后为何没有推荐品牌",
    seoTitleEn: "GEO Experiment: Why an AI Citation May Not Recommend Your Brand",
    descriptionZh: "Ahrefs 团队追了近四个月的 ChatGPT、Gemini、Perplexity 与 Copilot 回答。新会议从零进入 72 个问答空位，页面被引用以后，竞争对手仍可能拿走推荐。",
    descriptionEn: "Ahrefs tracked nearly four months of answers across ChatGPT, Gemini, Perplexity, and Copilot. A new conference entered 72 empty prompt slots, yet cited pages still handed recommendations to competitors.",
    seoDescriptionZh: "拆解 Ahrefs 34 个自荐页面与 9886 份 AI 回答实验，区分引用、品牌提及和推荐，并解释 43% 引用后未提品牌及引用反复消失的现实。",
    seoDescriptionEn: "A sourced GEO experiment covering 34 self-promotional pages and 9,886 AI answers, separating citation, brand mention, recommendation, backfire, and citation churn.",
    kickerZh: "增长案例 17 · 拿到引用，品牌还没进答案",
    kickerEn: "GROWTH CASE 17 · THE CITATION ARRIVED BEFORE THE RECOMMENDATION",
    introZh: "Mateusz Makosiewicz 想验证一件很诱人的事。品牌自己写一份最佳清单，把自己放进去，ChatGPT、Gemini、Perplexity 或 Copilot 会不会顺手推荐它。Ahrefs 团队为 Brand Radar 和新会议 Evolve 做了 34 个自荐页面，分布在 5 个域名上，从 2 月 7 日追到 5 月 31 日，一共分析 9886 份回答。\n\n新会议确实挤进了 72 个原本没有它的位置，其中 82% 的新提及出现在引用了自家页面的回答里。麻烦也在同一张表上。AI 引用会议页面时，有 43% 的回答仍没提 Evolve，反倒可能推荐清单里的其他会议。页面拿到脚注，品牌留在门外。",
    introEn: "Mateusz Makosiewicz tested a tempting idea. If a brand publishes a best-of list and includes itself, will ChatGPT, Gemini, Perplexity, or Copilot recommend it? The Ahrefs team created 34 self-promotional pages for Brand Radar and its new Evolve conference across five domains, then tracked 9,886 answers from February 7 through May 31.\n\nThe new conference did enter 72 prompt-engine slots where it had previously been absent. Eighty-two percent of those new mentions appeared in answers citing an owned page. The catch sits in the same dataset. When an AI assistant cited a conference page, 43% of answers still omitted Evolve and could recommend another event from the list. The page earned a footnote while the brand stayed outside the answer.",
    sectionsZh: [
      {
        heading: "自荐内容对新名字有用，对熟名字只推了一小步",
        body: "Evolve 在基线期没有出现，发布页面以后进入 72 个新的查询和引擎组合。82% 的新提及带着团队页面的引用。换到已经有知名度的 Ahrefs Brand Radar，情况就淡了许多。它进入新位置时，只有 6% 的提及引用自家页面，94% 来自第三方内容。\n\n同一种页面放到两个品牌上，作用差得很远。自荐页更像一张新名片，能补上某个具体类别里的认知空白。已经被大量第三方资料覆盖的品牌，靠多发几篇自荐文很难制造同样的变化。",
        pullQuote: "新名字缺一张名片，老名字缺的往往是别人愿意怎么介绍它。"
      },
      {
        heading: "引用和推荐之间，隔着清单里的所有竞争对手",
        body: "会议页面的反噬率是 43%。这里的反噬有一个很窄的定义。AI 引用了推广 Evolve 的页面，回答里却没有出现 Evolve。工具页面的同类比例只有 11%。\n\n原因未被实验直接证明，页面结构已经给出风险。最佳清单为了显得完整，会认真介绍同类选择。AI 可以把它当资料库，再挑另一个名字回答用户。做 GEO 复盘时，只数引用会把这段漏掉。品牌提及、推荐位置和实际点击需要各记一栏。",
        pullQuote: "脚注证明页面被用过，不能证明品牌被选中。"
      },
      {
        heading: "有些引用只出现一天，第二天就换了人",
        body: "约四分之一的页面在某个查询和引擎组合里只被引用一次，之后再没回来。能够重复出现的引用也很零碎，从首次到末次之间，平均只有约三分之一的可观察日期能看到它。最长的一组连续维持了 52 天，主要集中在 Copilot 和边界很窄的会议或替代品查询。\n\n这意味着周一拿到一张截图，远远不够宣布赢下答案。同一个问题要按固定频率重测，记录模型、日期、国家和回答措辞。页面没有改，引用也可能自己消失。",
        pullQuote: "AI 搜索里的位置更像轮值座位，很少是一块永久门牌。"
      },
      {
        heading: "一个小团队能做的 GEO，不需要先造三十多个页面",
        body: "先选三个和购买或比较有关的窄问题，每周在两种引擎各测两次。记录谁被提到、谁被推荐、引用了哪一页。随后只写一篇有独立价值的比较或经验页，把选择条件、限制和数据来源写完整。\n\n四周后仍没有任何新提及，可以检查页面有没有进入索引，问题和品牌是否匹配，外部资料是否太少。Google 的公开说明也写得很直白，AI 功能沿用搜索的基础做法，没有一套额外的特殊门槛。这个实验能观察变化，不能承诺销售。",
        pullQuote: "先盯住三个问题，比分散写三十四篇更容易看清变化。"
      }
    ],
    sectionsEn: [
      {
        heading: "Self-promotion helped the new name more than the familiar one",
        body: "Evolve was absent during the baseline and later entered 72 new prompt-engine combinations. Eighty-two percent of those mentions appeared with a citation to a team page. The established Ahrefs Brand Radar brand barely moved the same way. Only 6% of its new-slot mentions cited an owned page, while 94% came from third parties.\n\nThe same format played very different roles. A self-promotional page can serve as a new category card when an assistant has little material connecting a brand to a narrow topic. An established brand already covered by third parties has less of that gap to fill.",
        pullQuote: "A new name may need a category card. A known name needs credible people to describe it well."
      },
      {
        heading: "Every competitor on the list stands between a citation and a recommendation",
        body: "Conference pages had a 43% backfire rate under a narrow definition. An assistant cited a page promoting Evolve but did not mention Evolve in its answer. The comparable figure for tool-promoting pages was 11%.\n\nThe experiment does not prove why, but the page structure exposes the risk. A useful best-of list describes alternatives. An assistant can use that page as research and select another name. A GEO review that counts citations alone misses the decision. Brand mention, recommendation position, and click behavior need separate columns.",
        pullQuote: "A footnote proves the page was used. It does not prove the brand was chosen."
      },
      {
        heading: "Some citations appeared once and changed seats the next day",
        body: "About one quarter of pages were cited once for a prompt-engine combination and never returned. Recurring citations were patchy too, appearing on roughly one in three eligible days between first and last observation. The longest uninterrupted run lasted 52 days and clustered around Copilot and narrow conference or alternative queries.\n\nA Monday screenshot cannot establish ownership of an answer. Repeat the same prompt on a schedule and store the model, date, market, and wording. A citation may disappear without any page change.",
        pullQuote: "AI-search visibility behaves more like a rotating seat than a permanent sign."
      },
      {
        heading: "A small team can test GEO without publishing 34 pages",
        body: "Choose three narrow comparison or purchase questions and test them twice a week in two assistants. Record which brands are mentioned, which are recommended, and which pages are cited. Then publish one comparison or experience page with standalone value, explicit selection criteria, limits, and sources.\n\nAfter four weeks without a new mention, check indexing, query-brand fit, and the shortage of third-party evidence. Google's own guidance says its AI features retain foundational SEO practices and add no special eligibility layer. The test can observe movement. It cannot promise sales.",
        pullQuote: "Watching three questions closely teaches more than scattering 34 pages at once."
      }
    ],
    experimentTitleZh: "把引用、提及和推荐拆成三本账",
    experimentTitleEn: "Keep separate ledgers for citation, mention, and recommendation",
    experimentsZh: [
      { label: "01 / 固定问题", body: "选三个窄问题，固定引擎、国家和每周检查时间。" },
      { label: "02 / 写一页", body: "只发布一篇有选择标准、限制和来源的比较页。" },
      { label: "03 / 分开记", body: "引用、品牌提及、推荐次序和点击各自记录。" }
    ],
    experimentsEn: [
      { label: "01 / FIX PROMPTS", body: "Choose three narrow questions and keep engines, market, and check times stable." },
      { label: "02 / PUBLISH ONE", body: "Create one useful comparison with criteria, limits, and sources." },
      { label: "03 / SPLIT METRICS", body: "Record citations, mentions, recommendation order, and clicks separately." }
    ],
    caseStudies: [
      {
        subjectName: "Mateusz Makosiewicz",
        product: "Ahrefs Evolve 与 Brand Radar",
        timeframeZh: "2026 年 2 月 7 日至 5 月 31 日",
        timeframeEn: "February 7 to May 31, 2026",
        verificationZh: "公司运行并公开方法的实验",
        verificationEn: "Company-run experiment with a public method",
        goalZh: "检验自荐页面能否让 AI 助手推荐品牌",
        goalEn: "Test whether self-promotional pages can earn AI-assistant recommendations",
        actionsZh: ["在 5 个域名发布 34 页", "跟踪四种 AI 助手", "分析 9886 份回答", "区分被发现、被引用和被提及"],
        actionsEn: ["Published 34 pages across five domains", "Tracked four AI assistants", "Analyzed 9,886 answers", "Separated found, cited, and mentioned states"],
        resultZh: "Evolve 进入 72 个空位，82% 的新提及引用自家页面",
        resultEn: "Evolve entered 72 empty slots and 82% of new mentions cited an owned page",
        failureZh: "引用会议页的回答中有 43% 仍未提 Evolve，引用也频繁消失",
        failureEn: "Forty-three percent of answers citing conference pages still omitted Evolve, and citations frequently disappeared",
        sourceUrl: "https://ahrefs.com/blog/self-promotional-content-ai-seo-experiment/"
      }
    ],
    sources: [
      { titleZh: "Ahrefs 自荐内容 AI 搜索实验", titleEn: "Ahrefs self-promotional content AI-search experiment", url: "https://ahrefs.com/blog/self-promotional-content-ai-seo-experiment/", kind: "named-firsthand", publishedAt: "2026-07-06", accessedAt, supportsZh: "支撑方法、72 个空位、82%、43%、11% 和引用持续性数据。", supportsEn: "Supports the method, 72 empty slots, 82%, 43%, 11%, and citation persistence results." },
      { titleZh: "26383 个来源 URL 的自荐清单研究", titleEn: "Study of 26,283 source URLs in self-promotional best lists", url: "https://ahrefs.com/blog/best-lists-research/", kind: "company-reported", publishedAt: "2025-12-04", accessedAt, supportsZh: "提供自荐最佳清单被 AI 使用的更大样本背景。", supportsEn: "Provides broader company-reported context on AI use of self-promotional best lists." },
      { titleZh: "Google AI 功能与网站说明", titleEn: "Google guidance for AI features and websites", url: "https://developers.google.com/search/docs/appearance/ai-features", kind: "official", publishedAt: "2025-12-10", accessedAt, supportsZh: "说明 AI 概览和 AI 模式沿用基础 SEO，且没有额外技术门槛。", supportsEn: "States that AI Overviews and AI Mode use foundational SEO practices without extra technical requirements." }
    ]
  },
  {
    slug: "xiaohongshu-plus-size-fashion-positioning",
    publishedAt: "2026-08-24",
    updatedAt: "2026-08-24",
    platform: "小红书 / Xiaohongshu",
    readingMinutes: 10,
    authorZh,
    authorEn,
    disclosureZh: "实名商家与服务商公开访谈 · 粉丝和销售数字来自小红书方及服务商对媒体的披露，未做独立审计。封面是公开文章保存的王微小红书主页截图。",
    disclosureEn: "Named merchant and operator interviews · follower and sales figures were disclosed to media by Xiaohongshu and the service provider and are not independently audited. The cover is a profile screenshot preserved in a public article.",
    titleZh: "王微做了二十多年女装，账号起量先从一条不太好看的腰围说起",
    titleEn: "Wang Wei Spent Two Decades in Womenswear. Her Xiaohongshu Growth Began With an Unflattering Waistline",
    seoTitleZh: "小红书运营真实案例｜王微微胖女装定位与直播测款复盘",
    seoTitleEn: "Xiaohongshu Case Study: Wang Wei's Plus-Size Positioning",
    descriptionZh: "王微有供应链和选款经验，早期却把女装做得太宽。团队从直播成交里发现裙装更强，把内容收窄到 40 岁以上微胖女性，再让她本人讲清腰围、舒适和显瘦。",
    descriptionEn: "Wang Wei had supply-chain and merchandising experience, but her early offer was too broad. Live-sales evidence narrowed the account to dresses for plus-size women over 40, with Wang explaining waist, comfort, and fit herself.",
    seoDescriptionZh: "复盘王微 WHICH 从全品类女装到 40 岁以上微胖显瘦穿搭的定位过程，包括直播测款、主理人出镜、笔记与直播分配，以及粉丝销售数字的自报边界和验证方法。",
    seoDescriptionEn: "A Xiaohongshu operations case on Wang Wei WHICH, covering live SKU tests, plus-size positioning, founder-led content, note-to-live allocation, and reported results.",
    kickerZh: "增长案例 18 · 定位写进了腰围和试穿",
    kickerEn: "GROWTH CASE 18 · THE POSITIONING SHOWED UP IN THE WAISTBAND",
    introZh: "王微在女装供应链里做了二十多年，也开过四季青档口。刚做小红书时，这些经验没有自动变成一个清楚的账号。货盘铺得很宽，内容也容易落进所有女装都能说的那几句话。服务团队先看直播里什么真的卖动，发现裙装表现更强，才把方向收进 40 岁以上微胖女性的显瘦穿搭。\n\n这个人群不是会议室里想出来的。王微自己就是同类身材，知道腰围卡在哪里，面料贴上去舒不舒服。小红书 COO Conan 在一次公开对谈里回忆，她直播时会掀起上衣，让观众看见自己的肚子。画面没有精修感，问题因此变得很具体。",
    introEn: "Wang Wei spent more than two decades in womenswear supply chains and once ran a stall in Hangzhou's Sijiqing market. That experience did not automatically produce a clear Xiaohongshu account. The initial assortment was broad and the content could have belonged to any womenswear shop. Her operator studied which items actually converted in live sessions, saw stronger dress performance, and narrowed the account to slimming outfits for plus-size women over 40.\n\nThe audience was not invented in a meeting. Wang shares the body type and knows where a waistband catches and whether a fabric feels comfortable. In a public conversation, Xiaohongshu COO Conan recalled that she would lift her top during a live session to show her stomach. The image was not polished. The problem became specific.",
    sectionsZh: [
      {
        heading: "第一版定位太宽，直播成交先替团队删掉一半",
        body: "服务商青让的创始人塞塞对媒体说，王微早期做的是全品类女装。团队没有靠一条爆款笔记猜定位，而是看直播里的 SKU 表现。裙装成交更突出以后，方向逐渐收窄为 40 岁以上微胖姐姐的显瘦穿搭。\n\n这次收窄同时改了人和货。年龄、身材、场景写进内容，核心品类也跟着减少。定位能被验证，因为下一场直播会告诉团队，同一人群是不是继续停留和下单。",
        pullQuote: "先让成交帮你删品类，再让内容把留下的人说清楚。"
      },
      {
        heading: "她敢把肚子露出来，二十年的经验才有了落点",
        body: "王微能讲面料和版型，观众还需要知道这些知识和自己有什么关系。她本人试穿，直接展示腹部，再解释某条腰线为什么舒服。那一刻，供应链经验从一段履历落到了一个身体问题上。\n\n公开材料没有证明某一个动作单独带来多少销售。它能证明的是内容找到了可核对的对象。观众可以看版型落在真实身材上的样子，再决定这位主理人的判断值不值得信。",
        pullQuote: "经验写在简介里很轻，落到一条勒不勒肚子的裙子上才有分量。"
      },
      {
        heading: "主理人要直播，笔记就得做成她能重复的样子",
        body: "塞塞提到，主理人大部分时间被直播占住，拍内容的时间有限。青让为王微承担了内容框架、笔记与直播分配等工作，笔记做得相对简单，让主理人能持续出现。公开截图里，主页一句话就写着 40+ 微胖和会挑衣服的大姐姐。\n\n媒体文章曾记录她运营约六个月、粉丝刚过一万时，月销售接近 300 万。另一篇较晚的主页截图已经显示 3.1 万粉丝。两个时间点不能拼成一条稳定增长曲线，销售也属于平台和服务商自报。",
        pullQuote: "能重复的内容，才配得上一个每周要进直播间的人。"
      },
      {
        heading: "七天找不到定位，可以先找一句反复出现的麻烦",
        body: "从最近十场咨询或直播评论里，抄下用户描述身材和场景的原话。把出现最多的一类问题配上三个 SKU，让主理人逐件试穿，记录停留、追问和成交。下一周只围绕表现最清楚的一类继续拍。\n\n七天够删掉一个太宽的说法，还不够证明账号已经找到长期定位。粉丝增长也不能直接当销售证据。先看同一类人是否重复提问，直播里的货是否继续卖动，退货原因有没有改善。",
        pullQuote: "定位的第一步常常是删掉一句谁都能用的话。"
      }
    ],
    sectionsEn: [
      {
        heading: "The first positioning was too broad, so live sales removed half of it",
        body: "Qingrang founder Saise told media that Wang initially sold across womenswear categories. The team did not guess positioning from one popular note. It watched SKU performance in live sessions. As dresses converted more strongly, the account narrowed toward slimming outfits for plus-size women over 40.\n\nThe edit changed both audience and assortment. Age, body type, and use case entered the content while the core product range shrank. The next live session could test whether the same people stayed and bought again.",
        pullQuote: "Let conversion remove categories, then let content describe the people who remain."
      },
      {
        heading: "Showing her stomach gave two decades of experience somewhere to land",
        body: "Wang could explain fabric and construction, but viewers still needed to connect that knowledge to their own bodies. She tried garments on herself, showed her stomach, and explained why a waistline felt comfortable. Supply-chain experience became attached to a visible problem.\n\nThe public evidence cannot assign sales to that single act. It does show a claim becoming inspectable. A viewer could see a cut on a relevant body and decide whether the merchant's judgment deserved trust.",
        pullQuote: "Experience is light in a bio. It gains weight on a waistband that does or does not pinch."
      },
      {
        heading: "A founder who must go live needs notes she can repeat",
        body: "Saise said founders spend much of their time live and have limited room for filming. Qingrang handled Wang's content framework and the allocation between notes and live sessions, keeping the format simple enough to sustain. A public profile screenshot states the positioning plainly: plus-size women over 40 and an older sister who knows how to choose clothes.\n\nOne media account reported nearly RMB 3 million in monthly sales after roughly six months, when the account had just over 10,000 followers. A later screenshot shows 31,000 followers. Those moments do not form an audited growth curve, and the sales figure remains platform- and operator-reported.",
        pullQuote: "Repeatable content earns its place in a founder's live-heavy week."
      },
      {
        heading: "If positioning feels vague, start with one repeated complaint",
        body: "Copy the exact language from ten recent consultations or live-session comments about body type and occasion. Match the most repeated problem with three SKUs, have the founder try each one, and log retention, questions, and purchases. Continue next week only with the clearest problem.\n\nSeven days can remove one vague statement. It cannot prove a durable position. Follower growth is not sales evidence either. Watch whether the same group asks again, whether the items continue converting, and whether return reasons improve.",
        pullQuote: "Positioning often begins by deleting a sentence that any seller could use."
      }
    ],
    experimentTitleZh: "用十条原话和三件商品找一个窄位置",
    experimentTitleEn: "Use ten customer phrases and three products to find a narrow position",
    experimentsZh: [
      { label: "01 / 抄原话", body: "从咨询和评论里收十句身材、年龄或场景描述。" },
      { label: "02 / 试三件", body: "让主理人用三件商品回答同一个具体麻烦。" },
      { label: "03 / 看后果", body: "分开记录停留、追问、成交和退货原因。" }
    ],
    experimentsEn: [
      { label: "01 / COPY LANGUAGE", body: "Collect ten exact phrases about body type, age, or occasion from comments and consultations." },
      { label: "02 / TRY THREE", body: "Have the founder answer one concrete problem with three products." },
      { label: "03 / WATCH OUTCOMES", body: "Track retention, questions, purchases, and return reasons separately." }
    ],
    caseStudies: [
      {
        subjectName: "王微",
        publicHandle: "王微 WHICH",
        product: "WHICH 女装",
        timeframeZh: "公开报道中的前六个月及后续主页截图",
        timeframeEn: "The first six reported months and a later profile screenshot",
        verificationZh: "实名商家、平台方和服务商公开叙述",
        verificationEn: "Named merchant with platform and operator accounts",
        goalZh: "为有供应链经验的女装主理人找到清楚的小红书人群",
        goalEn: "Find a clear Xiaohongshu audience for an experienced womenswear merchant",
        actionsZh: ["用直播 SKU 测试品类", "收窄到 40+ 微胖女性", "主理人本人试穿", "分配笔记和直播内容"],
        actionsEn: ["Tested categories through live SKU sales", "Narrowed to plus-size women over 40", "Put the founder in try-on content", "Allocated notes and live content"],
        resultZh: "媒体记录约六个月、刚过一万粉丝时月销售接近 300 万元，均为自报",
        resultEn: "Media reported nearly RMB 3M monthly sales after about six months at just over 10K followers, all self-reported",
        failureZh: "早期全品类定位太宽，内容能力和商业化表达偏弱",
        failureEn: "The initial all-category position was too broad and content commercialization was weak",
        sourceUrl: "https://www.36kr.com/p/2873157549707400"
      }
    ],
    sources: [
      { titleZh: "小红书 COO 对谈中的王微案例", titleEn: "Wang Wei case in a conversation with Xiaohongshu COO Conan", url: "https://www.36kr.com/p/2873157549707400", kind: "company-reported", accessedAt, supportsZh: "支撑供应链经历、微胖人群、直播展示和粉丝销售自报。", supportsEn: "Supports supply-chain experience, plus-size audience, live demonstration, and reported follower and sales figures." },
      { titleZh: "青让服务王微的运营复盘", titleEn: "Qingrang's operations account for Wang Wei", url: "https://www.flipboard.cn/a/97bd180b834fafe667f48e518ca5affc", kind: "named-firsthand", accessedAt, supportsZh: "支撑主理人定位、内容框架、直播笔记分配和公开主页截图。", supportsEn: "Supports the founder positioning, content framework, note-to-live allocation, and public profile screenshot." },
      { titleZh: "从全品类到微胖显瘦的服务商拆解", titleEn: "Operator breakdown from all-category fashion to plus-size slimming", url: "https://t.cj.sina.com.cn/articles/view/1771650130/69993c5200101vjyu", kind: "secondary-analysis", accessedAt, supportsZh: "支撑直播测款、裙装表现与定位收窄过程。", supportsEn: "Supports live SKU testing, stronger dress performance, and the positioning change." }
    ]
  },
  {
    slug: "xiaohongshu-founder-livestream-case-study",
    publishedAt: "2026-08-24",
    updatedAt: "2026-08-24",
    platform: "小红书 / Xiaohongshu",
    readingMinutes: 11,
    authorZh,
    authorEn,
    disclosureZh: "实名主理人公开采访与品牌授权图片 · 粉丝、销售和复购数字来自隋美芝及平台相关报道，未做独立审计。封面为公开小红书视频画面。",
    disclosureEn: "Named-founder interviews and brand-authorized imagery · follower, sales, and repeat-purchase figures come from Sui Meizhi and platform-related reporting and are not independently audited. The cover is a frame from a public Xiaohongshu video.",
    titleZh: "四位博士主播讲了一年没讲动，隋美芝自己上镜九十分钟后破了千粉",
    titleEn: "Four PhD Hosts Spent a Year Explaining the Product. Sui Meizhi Crossed 1,000 Followers in Her First 90-Minute Live",
    seoTitleZh: "小红书主理人直播真实案例｜隋美芝首次上镜与破千粉复盘",
    seoTitleEn: "Xiaohongshu Founder Livestream Case Study: Sui Meizhi",
    descriptionZh: "知和无尤请过四位年轻主播讲知识，近一年没有得到预期结果。2022 年 12 月 3 日，觉得自己不上镜的隋美芝第一次亲自直播，把六年种玫瑰和创业过程讲了九十分钟。",
    descriptionEn: "Zhihe Wuyou hired four young expert hosts and saw little progress for nearly a year. On December 3, 2022, camera-shy founder Sui Meizhi went live herself and spent 90 minutes explaining six years of roses and product work.",
    seoDescriptionZh: "复盘知和无尤从四位博士主播效果不佳，到隋美芝首次 90 分钟主理人直播破千粉的过程，并核对六年种植、后续销售自报、可复用边界和直播准备方法。",
    seoDescriptionEn: "A Xiaohongshu founder-live case covering failed expert hosts, Sui Meizhi's first 90-minute live, six years of roses, reported sales, and practical limits.",
    kickerZh: "增长案例 19 · 产品讲了很久，做产品的人终于坐到镜头前",
    kickerEn: "GROWTH CASE 19 · THE PRODUCT HAD BEEN EXPLAINED. THEN ITS MAKER SAT DOWN",
    introZh: "知和无尤先请了四位年轻、学历高、形象好的主播。她们讲精油、纯露和配方，做了接近一年，效果没有达到预期。隋美芝一直觉得自己不上镜，也没有直播经验。2022 年 12 月 3 日，她还是坐到了镜头前。\n\n那场直播约九十分钟。她从辞去上市公司高管工作讲起，讲孕期过敏，也讲团队怎样花六年种大马士革玫瑰。讲到创业细节时，她多次落泪。报道说，账号在这场直播后首次突破 1000 粉丝。这个案例容易被误读成真情流露的技巧，前面那六年产品工作才是她当晚有话可讲的原因。",
    introEn: "Zhihe Wuyou first hired four young, highly educated, camera-ready hosts. They explained essential oils, hydrosols, and formulations for nearly a year without the expected result. Sui Meizhi believed she was not photogenic and had no live-streaming experience. On December 3, 2022, she sat in front of the camera anyway.\n\nThe session lasted about 90 minutes. She described leaving an executive role at a listed company, skin allergies during pregnancy, and the team's six years of work growing Damascus roses. She cried more than once while discussing the startup. Reports say the account crossed 1,000 followers for the first time after that live. It is easy to misread the case as a technique for displaying emotion. Six years of product work gave her something worth saying that night.",
    sectionsZh: [
      {
        heading: "她能讲九十分钟，因为玫瑰已经种了六年",
        body: "隋美芝先在烟台尝试种植，2017 年把大马士革玫瑰带到湖北恩施周唐村。2020 年第一批产品面市，2021 年开始在小红书发内容，2022 年底才亲自直播。公开报道给出的时间线很慢。\n\n这段慢，替直播提供了原料。她能回答花期、产地和纯露的问题，也能说清自己为什么做。换一个没有参与产品的人，即使把知识背得更熟，也很难交代那些选择是怎么发生的。",
        pullQuote: "九十分钟的内容，早在六年的花田里写了一大半。"
      },
      {
        heading: "四位博士主播没有错，她们缺的是决策留下的痕迹",
        body: "年轻主播能把成分知识讲准确，观众听到的仍是一堂课。隋美芝讲的是自己花掉积蓄、换产地、改产品，再坐到镜头前的经过。两种内容都可能有用，承担的任务不同。\n\n前一种回答产品是什么，后一种让人看见谁愿意为它负责。她流泪是发生过的细节，不该被抄成直播脚本。能复用的动作是把创始人做过的关键选择、付出的时间和失败过的方法整理出来。",
        pullQuote: "别学她哭，把那些只有做产品的人才知道的选择找出来。"
      },
      {
        heading: "从几千一场到两百万，数字要放回时间线上",
        body: "36kr 的报道写道，首次直播后，单场销售从几千元逐步到 5 万和 10 万。品牌第一次月销售过百万时，粉丝约 8000。后来的双十一单场超过 200 万时，粉丝约 1.5 万。另一篇 2024 年报道也记录了单日成交突破 200 万。\n\n这些数字都来自品牌或平台相关采访，没有后台审计，也不能证明首次直播直接造成后续成交。中间还有花期供应、产品迭代、平台活动和运营指导。把九十分钟和两百万连成一条直线，会删掉近两年的工作。",
        pullQuote: "第一次直播打开了门，后面的销售走了很长一段路。"
      },
      {
        heading: "下一场直播先准备五个决策，别准备五十句煽情话",
        body: "把产品从起点到现在列成时间线，挑五个会改变结果的决定。每个决定写下当时有什么选项、为什么这么选、后来付了什么代价。直播只讲其中两个，再留十分钟回答用户追问。\n\n首场可以看停留、有效问题、加群和首单，别拿一次粉丝上涨预估全年销售。有人愿意回来问第二次，说明故事和产品有连接。只有情绪高点，没有产品问题，下一场应该补证据。",
        pullQuote: "主理人直播的准备表，最好长得像产品档案。"
      }
    ],
    sectionsEn: [
      {
        heading: "She could speak for 90 minutes because the roses had been growing for six years",
        body: "Sui first experimented with cultivation in Yantai, then brought Damascus roses to Zhoutang Village in Enshi in 2017. The first products appeared in 2020, Xiaohongshu content began in 2021, and she went live herself near the end of 2022. The reported timeline is slow.\n\nThat slowness supplied the live session. She could answer questions about the flowering window, origin, and hydrosol while explaining why the company existed. A host who had not made those choices could learn the facts but would struggle to show how the decisions happened.",
        pullQuote: "Much of the 90-minute live had already been written in six years of fields."
      },
      {
        heading: "The PhD hosts were not wrong. They lacked the marks left by decisions",
        body: "The young hosts could teach ingredients accurately, but viewers still heard a lesson. Sui described spending savings, changing locations, revising products, and finally sitting before the camera. Both forms can be useful, but they do different jobs.\n\nOne explains what a product is. The other shows who will answer for it. Her tears are a reported detail, not a script to copy. The reusable preparation is to collect the founder's consequential choices, elapsed time, and failed approaches.",
        pullQuote: "Do not copy the tears. Find the decisions only the maker can explain."
      },
      {
        heading: "Sales grew from thousands to two million, and the timeline matters",
        body: "36kr reported that session sales rose from several thousand yuan to RMB 50,000 and RMB 100,000 after the first live. The brand first crossed RMB 1 million in monthly sales at about 8,000 followers. A later Singles' Day session exceeded RMB 2 million at roughly 15,000 followers. Another 2024 report recorded more than RMB 2 million in one day.\n\nThese are brand- or platform-related interview figures without dashboard auditing. They do not prove that the first live directly produced later sales. Seasonal supply, product iteration, platform events, and operating support sit in between. Connecting 90 minutes straight to RMB 2 million erases almost two years of work.",
        pullQuote: "The first live opened a door. The later sales traveled a much longer road."
      },
      {
        heading: "Prepare five decisions for the next live, not fifty emotional lines",
        body: "Put the product history on a timeline and choose five decisions that changed the outcome. For each, note the available options, the reason for the choice, and the later cost. Tell two of them in the live session and reserve ten minutes for product questions.\n\nFor a first session, watch retention, substantive questions, group joins, and initial orders. Do not annualize one follower increase. A returning question suggests a connection between story and product. An emotional peak without product questions calls for more evidence next time.",
        pullQuote: "A founder-live preparation sheet should look like a product record."
      }
    ],
    experimentTitleZh: "把一次主理人直播做成产品档案的公开答疑",
    experimentTitleEn: "Turn one founder live into a public Q&A for the product record",
    experimentsZh: [
      { label: "01 / 画时间线", body: "写下五个改变产品方向的决定和当时的代价。" },
      { label: "02 / 讲两个", body: "直播只讲两个决定，给用户追问留出十分钟。" },
      { label: "03 / 看回来", body: "记录有效问题、加群、首单和下次是否再次出现。" }
    ],
    experimentsEn: [
      { label: "01 / DRAW THE LINE", body: "List five decisions that changed the product and the cost at the time." },
      { label: "02 / TELL TWO", body: "Explain only two decisions and leave ten minutes for user questions." },
      { label: "03 / WATCH RETURNS", body: "Track substantive questions, group joins, first orders, and repeat attendance." }
    ],
    caseStudies: [
      {
        subjectName: "隋美芝",
        publicHandle: "种玫瑰的咪咪妈妈",
        product: "知和无尤",
        timeframeZh: "2017 年种植至 2024 年公开报道",
        timeframeEn: "From 2017 cultivation through public reporting in 2024",
        verificationZh: "实名采访和品牌授权图片",
        verificationEn: "Named interviews and brand-authorized imagery",
        goalZh: "让用户理解大马士革玫瑰产品和创始人选择",
        goalEn: "Help users understand the Damascus rose product and its founder's choices",
        actionsZh: ["种植与改产品六年", "先尝试四位专业主播", "主理人首次直播 90 分钟", "继续运营笔记、直播和群聊"],
        actionsEn: ["Spent six years on cultivation and product work", "First tried four expert hosts", "Ran a 90-minute first founder live", "Continued notes, live sessions, and group conversations"],
        resultZh: "首次直播后粉丝首破 1000，后续单场和单日 200 万元等均为品牌或平台自报",
        resultEn: "Followers first crossed 1,000 after the initial live; later RMB 2M session and daily figures are brand- or platform-reported",
        failureZh: "专业主播近一年没有达到预期，后续销售不能只归因于首次直播",
        failureEn: "Expert hosts underperformed for nearly a year, and later sales cannot be attributed only to the first founder live",
        sourceUrl: "https://www.36kr.com/p/3038278872330498"
      }
    ],
    sources: [
      { titleZh: "36kr 对隋美芝主理人直播的报道", titleEn: "36kr report on Sui Meizhi's founder live", url: "https://www.36kr.com/p/3038278872330498", kind: "named-firsthand", accessedAt, supportsZh: "支撑主播试错、首次直播、粉丝节点和后续销售自报。", supportsEn: "Supports the host experiment, first live, follower milestone, and later reported sales." },
      { titleZh: "隋美芝 2022 年首次直播采访", titleEn: "Interview on Sui Meizhi's first 2022 live", url: "https://www.sohu.com/a/825814821_197955", kind: "named-firsthand", publishedAt: "2024-11-11", accessedAt, supportsZh: "支撑 2022 年 12 月 3 日、90 分钟、破千粉和六年种植。", supportsEn: "Supports December 3, 2022, the 90-minute session, 1,000-follower milestone, and six years of cultivation." },
      { titleZh: "南都对玫瑰种植和小红书经营的采访", titleEn: "Nandu interview on rose cultivation and Xiaohongshu operations", url: "https://m.mp.oeeee.com/a/BAAFRD0000202409141000328.html", kind: "named-firsthand", publishedAt: "2024-09-14", accessedAt, supportsZh: "支撑 2017、2020、2021、2022 的产品与内容时间线。", supportsEn: "Supports the 2017, 2020, 2021, and 2022 product and content timeline." }
    ]
  }
];
