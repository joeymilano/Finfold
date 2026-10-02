import { aiMarketingBlogPosts } from "@/lib/ai-marketing-blog-posts";
import { growthCaseStudyBlogPosts } from "@/lib/growth-case-study-blog-posts";

export type BlogSection = {
  heading: string;
  body: string;
  pullQuote?: string;
};

export type BlogExperiment = {
  label: string;
  body: string;
};

export type BlogSourceKind =
  | "official"
  | "named-firsthand"
  | "public-handle-firsthand"
  | "company-reported"
  | "secondary-analysis";

export type BlogCaseStudy = {
  subjectName: string;
  publicHandle?: string;
  product?: string;
  timeframeZh: string;
  timeframeEn: string;
  verificationZh: string;
  verificationEn: string;
  goalZh: string;
  goalEn: string;
  actionsZh: string[];
  actionsEn: string[];
  resultZh: string;
  resultEn: string;
  failureZh: string;
  failureEn: string;
  sourceUrl: string;
};

export type BlogSource = {
  titleZh: string;
  titleEn: string;
  url: string;
  kind: BlogSourceKind;
  publishedAt?: string;
  accessedAt: string;
  supportsZh: string;
  supportsEn: string;
};

export type BlogPost = {
  slug: string;
  publishedAt: string;
  updatedAt: string;
  platform: string;
  readingMinutes: number;
  authorZh: string;
  authorEn: string;
  disclosureZh: string;
  disclosureEn: string;
  titleZh: string;
  titleEn: string;
  seoTitleZh?: string;
  seoTitleEn?: string;
  descriptionZh: string;
  descriptionEn: string;
  seoDescriptionZh?: string;
  seoDescriptionEn?: string;
  kickerZh: string;
  kickerEn: string;
  introZh: string;
  introEn: string;
  sectionsZh: BlogSection[];
  sectionsEn: BlogSection[];
  experimentTitleZh: string;
  experimentTitleEn: string;
  experimentsZh: BlogExperiment[];
  experimentsEn: BlogExperiment[];
  caseStudies?: BlogCaseStudy[];
  sources?: BlogSource[];
};

const existingBlogPosts: BlogPost[] = [
  {
    slug: "x-twitter-algorithm-playbook",
    publishedAt: "2026-07-08",
    updatedAt: "2026-08-22",
    platform: "X / Twitter",
    readingMinutes: 7,
    authorZh: "Joey Zhao · Finfold 创始人",
    authorEn: "Joey Zhao · Founder of Finfold",
    disclosureZh: "复合场景 · 根据常见独立开发者发布经历创作，不代表某位客户或 Finfold 的真实流量数据。",
    disclosureEn: "Composite scenario · based on common indie-launch patterns, not a customer testimonial or Finfold traffic result.",
    titleZh: "我在 X 上把自己写成了客服：后来才懂，第一行不是钩子，是赌注",
    titleEn: "I Wrote Like Customer Support on X — Then I Learned the First Line Is a Bet",
    seoTitleZh: "X 推文第一行怎么写｜产品更新内容实验与复盘｜Finfold",
    seoTitleEn: "X Post Hooks for Product Updates: A Field Note | Finfold",
    descriptionZh: "一条产品更新发出去只有 17 次浏览。问题不一定是算法，也可能是你从第一行就没给人留下来的理由。",
    descriptionEn: "A product update got 17 views. The algorithm may not be the villain; the first line may simply give nobody a reason to stay.",
    seoDescriptionZh: "一条产品更新发出去只有 17 次浏览。通过这个复合场景，拆解 X（Twitter）推文第一行、冲突与代价、链接位置和具体提问，并给出把产品更新改成单条推文或线程的可运行实验，用真实结果判断问题来自算法还是内容本身。",
    kickerZh: "增长现场 01 · 一条只有 17 次浏览的推文",
    kickerEn: "FIELD NOTE 01 · THE POST THAT GOT 17 VIEWS",
    introZh: "晚上十一点四十七分，我把一条憋了半天的产品更新发到 X。写得很完整：我们做了什么、为什么做、功能在哪里。像一封礼貌、周全、没有一句废话的客服邮件。\n\n第二天醒来，17 次浏览。没有回复，没有转发，连机器人都懒得点赞。那一刻很容易骂算法，但把那条推文重新读一遍，我发现更难堪的真相：它什么都交代了，唯独没交代一个陌生人为什么要停下来。",
    introEn: "At 11:47 p.m. I posted a product update I had polished for hours. It explained what we built, why we built it, and where to find it. Courteous, complete, and lifeless — a customer-support email wearing a social post as a costume.\n\nThe next morning it had 17 views. No replies, no reposts, not even a bot-like. Blaming the algorithm felt good for a minute. Reading it again felt worse: I had explained everything except why a stranger should stop.",
    sectionsZh: [
      {
        heading: "毛病不一定在算法，可能是你太客气了",
        body: "很多产品人写 X，开头总像在敲领导办公室的门：『很高兴地宣布……』『我们最近一直在努力……』礼貌当然没错，但信息流不发礼貌奖。读者只会用半秒问：这跟我有什么关系？\n\n别先报幕，先把矛盾扔到桌上。『我们花三周做的功能，用户根本不想要。』这句话不圆滑，却有一口活气。它让人想知道：然后呢？你们怎么发现的？",
        pullQuote: "信息流不发礼貌奖。第一行不是自我介绍，是你押上去的一枚筹码。"
      },
      {
        heading: "所谓钩子，不是吓人，是把代价说清楚",
        body: "我后来把开头分成三类：一个反常识、一次前后变化、一个带数字的代价。不是为了套模板，而是逼自己回答『这件事到底哪里疼』。\n\n比如别写『分享 5 个内容运营技巧』，写『连续发了 30 天，我们发现最勤奋的动作最没用』。前一句像目录，后一句像有人刚从坑里爬出来，裤腿上还有泥。",
        pullQuote: "人愿意听的不是正确答案，是一个人付过学费之后留下的答案。"
      },
      {
        heading: "链接放正文还是回复？别拜玄学，自己开一局",
        body: "关于链接，江湖规矩多得像算命：有人说正文带链接必死，有人说放回复里才死。可你的账号、受众和内容都不是别人的。拿别人的结论当圣旨，是增长里最省脑子也最贵的习惯。\n\n找两个相近主题，隔几天发。一个正文放链接，一个让主帖自己成立、回复补链接。别只看曝光，同时看点击、回复质量和真正完成注册的人。算法会变，自己的账本不会替你撒谎。",
        pullQuote: "没有自己数据的时候，所有『平台一定会』都只是酒桌消息。"
      },
      {
        heading: "别用『你怎么看』乞讨互动",
        body: "『你怎么看？』通常等于『我也不知道还能说什么了』。真正能让人开口的问题，边界要小到读者不用写论文。比如：『你会先把三个渠道做深，还是十个平台都占个坑？』\n\n更重要的是，你得真的想听答案。有人认真回你，就继续追问，别扔一个爱心表情跑路。X 上最值钱的不是一次爆，是慢慢出现一群知道你在做什么、愿意跟你吵两句的人。",
        pullQuote: "流量是路过的人，回复里那些有来有往，才像邻居。"
      }
    ],
    sectionsEn: [
      {
        heading: "The algorithm may be fine. You may just be too polite.",
        body: "Product people often open an X post like they are knocking on a manager's door: ‘Thrilled to announce’ or ‘We have been working hard.’ Politeness is fine, but the feed does not hand out manners awards. A reader has half a second to ask: why should I care?\n\nSkip the ceremony and put the tension on the table. ‘We spent three weeks building a feature nobody wanted.’ It is not elegant. It is alive — and it makes the next sentence necessary.",
        pullQuote: "The feed does not reward good manners. Your first line is a bet, not a biography."
      },
      {
        heading: "A hook is not hype. It makes the cost visible.",
        body: "I now start with one of three things: a contradiction, a before-and-after, or a cost with a number attached. Not because formulas are magic, but because each forces me to answer what actually hurt.\n\n‘Five content tips’ is a table of contents. ‘After posting for 30 days, our hardest-working habit turned out to be useless’ sounds like somebody climbed out of a hole with mud still on their shoes.",
        pullQuote: "People remember an answer that somebody paid tuition to learn."
      },
      {
        heading: "Links in the post or the reply? Run your own small bet.",
        body: "Link folklore is endless. Your account, audience, and offer are not somebody else's. Publish two comparable ideas a few days apart: one with the link in the post, one with a self-contained post and the link in a reply.\n\nTrack impressions, clicks, reply quality, and real signups. Platforms change; your own ledger is still the least dishonest witness you have.",
        pullQuote: "Without your own data, every ‘the platform always’ is bar-room gossip."
      },
      {
        heading: "Stop begging for engagement with ‘thoughts?’",
        body: "A useful question is narrow enough to answer without writing an essay: ‘Would you go deep on three channels or claim a spot on ten?’ Then stay for the answer. Ask a follow-up. Disagree like a person.\n\nThe durable asset on X is not one viral spike. It is a small group of people who know what you are building and are willing to argue with you about it.",
        pullQuote: "Reach is foot traffic. A real back-and-forth starts to feel like neighbours."
      }
    ],
    experimentTitleZh: "今晚就能做的 20 分钟小赌局",
    experimentTitleEn: "A 20-minute bet you can run tonight",
    experimentsZh: [
      { label: "01 / 翻旧账", body: "找一条最没人看的旧推文，只保留事实，删掉所有报幕。" },
      { label: "02 / 写两刀", body: "分别用『冲突』和『代价』重写第一行，不急着选。" },
      { label: "03 / 看人话", body: "发出更像你会当面说的那版，记录高质量回复，而不只是点赞。" }
    ],
    experimentsEn: [
      { label: "01 / DIG", body: "Find an ignored old post. Keep the fact; delete the ceremony." },
      { label: "02 / CUT TWICE", body: "Rewrite line one once with conflict and once with cost." },
      { label: "03 / WATCH PEOPLE", body: "Post the version you would actually say aloud. Track useful replies, not applause." }
    ]
  },
  {
    slug: "linkedin-algorithm-playbook",
    publishedAt: "2026-07-08",
    updatedAt: "2026-08-03",
    platform: "LinkedIn",
    readingMinutes: 6,
    authorZh: "Joey Zhao · Finfold 创始人",
    authorEn: "Joey Zhao · Founder of Finfold",
    disclosureZh: "复合场景 · 用于解释常见写作问题，文中互动数字不对应某位客户或 Finfold 的真实表现。",
    disclosureEn: "Composite scenario · written to explain a common drafting problem; engagement figures are not a customer or Finfold result.",
    titleZh: "别把 LinkedIn 写成述职报告：没人欠你一个「查看更多」",
    titleEn: "Stop Writing LinkedIn Like a Performance Review. Nobody Owes You ‘See More.’",
    seoTitleZh: "LinkedIn 帖子怎么写｜开场、证据与互动实验｜Finfold",
    seoTitleEn: "How to Write a LinkedIn Post People Keep Reading | Finfold",
    descriptionZh: "那篇端正得像年终总结的帖子，只有同事在点赞。不是人情冷，是读者压根没看见自己。",
    descriptionEn: "The post looked immaculate and only coworkers liked it. The audience was not cold; they simply could not see themselves in it.",
    seoDescriptionZh: "别把 LinkedIn 帖子写成述职报告。用一个复合场景拆解折叠线前的开场、读者问题、真实代价、证据位置和具体提问，并通过小实验观察高质量回复，而不只盯着点赞。",
    kickerZh: "增长现场 02 · 十二个赞，一半来自同事",
    kickerEn: "FIELD NOTE 02 · TWELVE LIKES, HALF FROM COWORKERS",
    introZh: "我见过一篇很典型的 LinkedIn 帖子：四百多字，逻辑严密，数字齐全，感谢了团队，也感谢了客户。读完像参加了一场没有茶歇的季度复盘。\n\n它拿到 12 个赞，其中 6 个来自同事。作者问是不是发布时间不对。其实时间没犯那么大罪，真正的问题是：整篇都在证明『我做得不错』，却没有给读者一个『这也发生在我身上』的入口。",
    introEn: "I once read a textbook LinkedIn post: four hundred careful words, tidy metrics, gratitude for the team, gratitude for customers. It felt like a quarterly review with no coffee break.\n\nIt earned twelve likes; six came from coworkers. The author blamed timing. Timing was not innocent, but the larger problem was simpler: every line proved ‘I did well,’ and none gave the reader a doorway marked ‘this happens to me too.’",
    sectionsZh: [
      {
        heading: "『查看更多』前面，先放一块真肉",
        body: "别拿前三行铺背景。手机屏幕就那么大，读者看不到你的苦心，只看到你还没进入正题。把最反常识的结论、最尴尬的数字，或者最具体的变化提前。\n\n『我们把转化率提高了 31%』不如『我们删掉注册页一半内容，转化反而涨了 31%』。数字不是装饰，变化才是故事。",
        pullQuote: "折叠线不是算法的门槛，是读者耐心的悬崖。"
      },
      {
        heading: "履历放后面，问题放前面",
        body: "很多人一写职业平台就自动穿西装：『作为一名拥有十年经验的……』。可陌生人对你的十年没有义务感兴趣。他先关心自己的十分钟。\n\n先写那个大家正在经历的麻烦，再说明你为什么有资格谈。经历不是开场锣鼓，是证据。这样既不装谦虚，也不端着。",
        pullQuote: "别急着证明你是谁，先证明你真的见过这个问题。"
      },
      {
        heading: "一篇好帖，像一次不浪费时间的咖啡聊天",
        body: "结构不用复杂：先说结论，再讲你撞过的墙，接着给三条带动作的经验，最后告诉人家明天能试什么。最怕那种七条洞察，每一条都像墙上的企业文化。\n\n能删掉的正确废话都删掉。『保持用户中心』不算经验；『我们每周五只看五段用户录屏，不看汇总表』才算。",
        pullQuote: "观点负责让人点头，细节负责让人相信。"
      },
      {
        heading: "别把评论区当掌声区",
        body: "LinkedIn 最好玩的地方，不是你讲完大家鼓掌，而是同行把自己的案例扔进来。结尾可以问一个有取舍的问题：『你会先删功能，还是先改 onboarding？』\n\n有人反对也别急着防守。职业感不是永远正确，是能把分歧继续聊下去。真正的线索，常常不是从『很棒的分享』来，而是从一句『我们刚好相反』开始。",
        pullQuote: "最有价值的评论，往往不是赞同，而是带着自己伤疤的反驳。"
      }
    ],
    sectionsEn: [
      {
        heading: "Put real meat before ‘See more.’",
        body: "Do not spend the first three lines warming up. Put the surprising conclusion, uncomfortable number, or concrete change up front.\n\n‘We improved conversion by 31%’ is a metric. ‘We deleted half the signup page and conversion rose 31%’ is a story. The number decorates; the change creates tension.",
        pullQuote: "The fold is not an algorithm rule. It is the cliff edge of reader patience."
      },
      {
        heading: "Put the problem before the résumé.",
        body: "Professional platforms make people put on a suit: ‘As someone with ten years of experience…’ A stranger does not owe your ten years attention. They care about their next ten minutes.\n\nName the problem first. Then explain why your experience counts as evidence. Credentials are not the opening drumroll; they are the receipt.",
        pullQuote: "Do not prove who you are first. Prove that you have actually met this problem."
      },
      {
        heading: "A good post feels like coffee that did not waste your time.",
        body: "Lead with the conclusion, show the wall you hit, offer three lessons with verbs, and give the reader something to try tomorrow. Delete any wisdom that could hang in a corporate hallway.\n\n‘Stay customer-centric’ is not a lesson. ‘Every Friday we watch five customer recordings and ignore the dashboard’ is.",
        pullQuote: "Opinions make people nod. Details make them believe."
      },
      {
        heading: "Do not turn the comments into an applause section.",
        body: "Ask a question with a tradeoff: ‘Would you remove features first, or change onboarding?’ When somebody disagrees, stay in the conversation.\n\nProfessionalism is not being permanently correct. It is being able to keep a useful disagreement alive. The best lead may begin with: ‘We saw the exact opposite.’",
        pullQuote: "The useful reply is often a disagreement carrying its own scar."
      }
    ],
    experimentTitleZh: "把下一篇帖子从述职稿里救出来",
    experimentTitleEn: "Rescue your next post from performance-review mode",
    experimentsZh: [
      { label: "01 / 砍背景", body: "把前三段删到只剩一句：到底发生了什么变化？" },
      { label: "02 / 补伤口", body: "写下一次错误判断、一次犹豫，或一笔真实代价。" },
      { label: "03 / 留选择题", body: "结尾问一个有取舍的问题，不问空洞的『怎么看』。" }
    ],
    experimentsEn: [
      { label: "01 / CUT CONTEXT", body: "Reduce the opening to one sentence: what actually changed?" },
      { label: "02 / SHOW THE SCAR", body: "Add one wrong call, hesitation, or real cost." },
      { label: "03 / FORCE A CHOICE", body: "End with a tradeoff, not a hollow ‘thoughts?’" }
    ]
  },
  {
    slug: "xiaohongshu-algorithm-playbook",
    publishedAt: "2026-07-08",
    updatedAt: "2026-08-09",
    platform: "小红书",
    readingMinutes: 8,
    authorZh: "Joey Zhao · Finfold 创始人",
    authorEn: "Joey Zhao · Founder of Finfold",
    disclosureZh: "复合场景 · 根据常见产品笔记问题创作，不对应某位真实客户或已验证的投放结果。",
    disclosureEn: "Composite scenario · based on common product-note problems, not a real customer or verified campaign result.",
    titleZh: "小红书不是把广告拆成十段：先让人看见自己的生活",
    titleEn: "Xiaohongshu Is Not an Ad Broken into Ten Paragraphs — Start with Real Life",
    seoTitleZh: "小红书发布前自查清单｜内容写作、披露与人工审核指南",
    seoTitleEn: "Xiaohongshu Content Compliance Checklist & Writing Guide",
    descriptionZh: "一篇笔记最怕什么都对：标题对、emoji 对、话题对，唯独不像一个人真的用过。",
    descriptionEn: "A note can get every template right — title, emoji, topics — and still fail because it never feels genuinely used.",
    seoDescriptionZh: "发布小红书笔记前，用这份实用清单检查身份披露、事实依据、外链、图片授权、个人隐私、话题相关性与平台语境；让场景、文案和图片表达保持一致，并保留最终人工审核。",
    seoDescriptionEn: "Use this Xiaohongshu checklist before publishing: review disclosure, claims, links, image rights, privacy, topics, and the final human edit.",
    kickerZh: "增长现场 03 · 一篇什么都对、就是没人信的笔记",
    kickerEn: "FIELD NOTE 03 · EVERYTHING WAS RIGHT, NOBODY BELIEVED IT",
    introZh: "有次朋友把一篇小红书笔记发给我看。标题有数字，有痛点，有 emoji；正文三行一断，结尾提醒收藏，话题也凑齐了。按网上那些『爆款公式』打分，少说九十分。\n\n可我读完只记住一件事：这东西像是从没被人用过。没有一个具体瞬间，没有一句犹豫，也没有任何不方便。它像样板间——灯很亮，家具很齐，但你知道今晚不会有人在里面睡觉。",
    introEn: "A friend once sent me a Xiaohongshu note for review. The title had a number, a pain point, and an emoji. Paragraphs were short. The ending asked for a save. Every viral checklist gave it an A.\n\nI finished it remembering one thing: nobody seemed to have used the product. No moment, no hesitation, no inconvenience. It was a show apartment — bright, furnished, and obviously empty tonight.",
    sectionsZh: [
      {
        heading: "别先介绍产品，先把人放回生活里",
        body: "『这是一款帮助你提升效率的工具』没有错，但像包装盒背面。真正能让人停住的，是『周日晚上十一点，我还在把同一段发布文案改成第四个版本』。\n\n场景不是文艺修辞，是信任的入口。时间、动作、那一下烦躁，都会让读者认出自己。认出自己以后，产品才有资格上场。",
        pullQuote: "先让读者说『这不就是我吗』，再让产品说『我能帮你』。"
      },
      {
        heading: "别把缺点藏干净，太干净反而像假的",
        body: "真人分享很少只有优点。可能第一次生成要改两句，可能某种语气不适合严肃行业，可能你用了三天才找到顺手的方法。把边界说出来，不会毁掉转化，反而会过滤掉不合适的人。\n\n『适合谁、不适合谁』比『人人都能用』有力量。后者是广告，前者像一个朋友在帮你省钱。",
        pullQuote: "可信不是把产品夸到没有缝，是敢告诉别人缝在哪里。"
      },
      {
        heading: "字数、emoji、话题，都只是碗，不是饭",
        body: "六百字会不会加权、几个 emoji 最好、到底放几个话题，这些问题很诱人，因为它们都有一个看起来精确的答案。可平台没有义务永远遵守昨天的偏方。\n\n先把事情讲明白，再用短段落、小标题和留白照顾手机阅读。话题只选真的描述受众和场景的。别为了蹭热度把一屋子不相干的人骗进来，他们划走得比谁都快。",
        pullQuote: "格式能帮人吃下去，但端上来的还得是饭。"
      },
      {
        heading: "收藏不是求来的，是读者怕自己以后找不到",
        body: "『建议收藏』写十遍也不会凭空产生价值。真正让人收藏的，是一张清单、一个判断框架、几句下次能直接拿走的话。\n\n结尾可以问：『你最烦的是写第一版，还是改成不同平台？』这比『姐妹们觉得呢』诚实得多。把评论当下一篇内容的田野调查，不要当 KPI 的化妆镜。",
        pullQuote: "最好的收藏理由不是提醒，而是读者真的舍不得丢。"
      },
      {
        heading: "小红书发布前自查清单：先挡住六类常见风险",
        body: "发布前逐项检查：一，合作、赠品、佣金或产品归属是否需要明确披露；二，效果、销量和用户结果是否有事实依据，是否删掉了绝对化承诺；三，联系方式、站外链接和导流方式是否符合当下平台规则；四，图片、字体、音乐和他人内容是否拥有使用权；五，是否泄露了客户、员工或未成年人的隐私；六，标题、图片、正文和话题是否在说同一件事。\n\n这是一份编辑自查，不是合规保证。平台规则和法律会变化，医疗、金融、法律等高风险行业还需要结合最新政策与专业意见。最后一关始终是了解真实业务的人做人工审核。",
        pullQuote: "清单负责提醒你停一下；是否能够发布，仍要由知道事实和边界的人决定。"
      }
    ],
    sectionsEn: [
      {
        heading: "Put the person back into real life before introducing the product.",
        body: "‘A tool that improves efficiency’ is accurate and sounds like packaging. ‘At 11 p.m. on Sunday I was rewriting the same launch update for a fourth platform’ gives the reader a room they recognise.\n\nTime, action, and irritation are not decorative storytelling. They are the entrance to trust. Once readers recognise themselves, the product earns its turn.",
        pullQuote: "Let the reader say ‘that is me’ before the product says ‘I can help.’"
      },
      {
        heading: "Do not polish away every limitation.",
        body: "Real recommendations contain edges: the first draft may need two edits; a playful voice may not suit a serious industry; it may take three days to find your rhythm. Saying who it is not for does not kill conversion. It saves the wrong person money.\n\n‘For everyone’ is advertising. A clear boundary feels like advice from a friend.",
        pullQuote: "Trust is not a product without seams. It is being willing to point at the seams."
      },
      {
        heading: "Length, emoji, and topics are bowls — not the meal.",
        body: "Magic numbers are attractive because they feel precise. Platforms are under no obligation to obey yesterday's folklore. Explain the thing fully, then use short paragraphs, subheads, and whitespace for a phone screen.\n\nChoose topics that honestly describe the audience and situation. Irrelevant trend traffic leaves quickly and teaches the system nothing useful.",
        pullQuote: "Formatting helps people eat. You still need to serve food."
      },
      {
        heading: "Saves are earned when the reader is afraid to lose something.",
        body: "Writing ‘save this’ cannot manufacture value. A checklist, decision frame, or phrase somebody can reuse tomorrow can.\n\nAsk which step actually hurts: the first draft, or adapting it across platforms? Treat replies as field research for the next piece, not makeup for a KPI dashboard.",
        pullQuote: "The best reason to save is not a reminder. It is genuine reluctance to lose the note."
      },
      {
        heading: "Xiaohongshu content compliance checklist: six checks before publishing",
        body: "Before publishing, check six things. First, disclose sponsorship, gifts, commission, or your relationship to the product when required. Second, support performance, sales, and customer-result claims; remove absolute guarantees. Third, recheck current rules for contact details, external links, and traffic diversion. Fourth, confirm the rights to images, fonts, music, and quoted material. Fifth, remove private information about customers, employees, or minors. Sixth, make sure the title, visual, body, and topics all describe the same thing.\n\nThis is an editorial pre-publish check, not a compliance guarantee. Platform rules and local laws change. High-risk areas such as medical, finance, and legal content need current policy review and, when appropriate, professional advice. The final decision belongs to a human who understands the facts and the business.",
        pullQuote: "A checklist tells you where to stop. A person who knows the facts still decides whether to publish."
      }
    ],
    experimentTitleZh: "把你的产品文案扔进真实生活里",
    experimentTitleEn: "Drop your product copy back into real life",
    experimentsZh: [
      { label: "01 / 找一个晚上", body: "写下用户通常在什么时间、什么地方，被什么动作烦到。" },
      { label: "02 / 坦白一条边界", body: "明确说出它不适合谁，或者哪一步仍需要人工修改。" },
      { label: "03 / 留一件东西", body: "给读者一张能带走的清单，而不是一句『记得收藏』。" }
    ],
    experimentsEn: [
      { label: "01 / FIND A NIGHT", body: "Name when, where, and during which action the frustration appears." },
      { label: "02 / ADMIT AN EDGE", body: "Say who it is not for or where a human edit is still needed." },
      { label: "03 / LEAVE A TOOL", body: "Give the reader a checklist worth keeping, not an instruction to save." }
    ]
  },
  {
    slug: "reddit-algorithm-playbook",
    publishedAt: "2026-07-08",
    updatedAt: "2026-08-22",
    platform: "Reddit",
    readingMinutes: 8,
    authorZh: "Joey Zhao · Finfold 创始人",
    authorEn: "Joey Zhao · Founder of Finfold",
    disclosureZh: "复合场景 · 根据常见社区推广失误创作；文中账号、时间与漏斗数字均为说明性示例。",
    disclosureEn: "Composite scenario · based on common community-promotion mistakes; account, timing, and funnel numbers are illustrative.",
    titleZh: "Reddit 不讨厌推广，它讨厌你把别人当流量",
    titleEn: "Reddit Does Not Hate Promotion — It Hates Being Treated Like Traffic",
    seoTitleZh: "Reddit 社区推广指南｜规则、身份披露与发帖实验｜Finfold",
    seoTitleEn: "Reddit Promotion Guide: Rules, Disclosure & Value | Finfold",
    descriptionZh: "在 Reddit 上，『一个有网站的 Redditor』和『一个有 Reddit 账号的网站』，是两种完全不同的命运。",
    descriptionEn: "On Reddit, a Redditor with a website and a website with a Reddit account have completely different fates.",
    seoDescriptionZh: "通过一个帖子九分钟后被删的复合场景，学习如何阅读 subreddit 规则、建立真实参与记录、披露创作者身份，并理解 Reddit 常见发帖格式、未加入社区前需要核对的规则，以及怎样写出移除产品链接后仍值得阅读的内容与具体问题。",
    kickerZh: "增长现场 04 · 帖子活了九分钟，然后被删",
    kickerEn: "FIELD NOTE 04 · THE POST LIVED FOR NINE MINUTES",
    introZh: "一个独立开发者把产品介绍认真改成英文，发进一个创业社区。标题克制，正文有细节，末尾只放了一个链接。他觉得自己已经够真诚。九分钟后，帖子被删。\n\n他很生气：『Reddit 就这么排斥创业者吗？』我点开他的主页，过去半年只有三条记录，三条都在推广同一个网站。换个角度看，这不是一个来分享经历的人偶尔提到产品；这是一个网站临时长出了一只手，伸进社区里捞流量。",
    introEn: "An indie founder translated a careful product introduction into English and posted it in a startup community. The title was restrained, the story had detail, and there was only one link. Nine minutes later, moderators removed it.\n\n‘Does Reddit just hate founders?’ he asked. His profile had three posts in six months. All three promoted the same site. This was not a person who sometimes mentioned a product; it was a website that had briefly grown a hand and reached into a community for traffic.",
    sectionsZh: [
      {
        heading: "先看门口贴的规矩，再谈你有多真诚",
        body: "Reddit 不是一个平台，是一堆各有脾气的小镇。r/startups、r/Entrepreneur、r/SideProject 对链接、自我推广和固定展示帖的规矩都不同。你在 A 镇受欢迎，不代表进 B 镇不用敲门。\n\n发之前读规则、置顶帖，再翻十条最近活下来的类似内容。这不是低姿态，是基本礼貌。社区管理员不认识你的初心，只看得见你的行为。",
        pullQuote: "你觉得自己真诚，不等于别人有义务替你补完上下文。"
      },
      {
        heading: "所谓先贡献，不是攒够十条评论再来收割",
        body: "有人把『先参与』理解成做任务：去别的帖子下面凑十条回复，然后第十一条发链接。社区对这种算盘味异常敏感。\n\n真正的贡献，是你没有东西要卖的时候也愿意回答问题。你会因为某个 bug 帮别人排查，会把失败数据贴出来，会在别人被喷时补一句有用的背景。账号历史不是通行证，是你到底把这里当人群还是当渠道的证词。",
        pullQuote: "别把社区贡献做成充值前置任务，人闻得出那股味。"
      },
      {
        heading: "披露身份不会毁掉帖子，装路人才会",
        body: "如果产品是你做的，就说是你做的。『我做了这个，因为……』通常比『最近发现一个神器』体面得多。Reddit 用户不怕利益关系，他们怕被当傻子。\n\n正文先完整提供价值：你遇到什么、试过什么、哪里失败。规则允许再放链接。就算删掉链接，文章也应该值得读；否则它本来就只是广告。",
        pullQuote: "真正的透明，不是一句免责声明，是拿走链接以后内容还站得住。"
      },
      {
        heading: "别问『大家有什么建议』，说清楚你到底卡在哪",
        body: "泛泛求反馈，得到的也只会是泛泛鼓励。你可以说：『我们现在有 43 个周活用户，注册到首次完成的流失是 62%，我怀疑 onboarding 太长，但不确定该砍哪一步。』\n\n具体问题会吸引真正懂的人，也允许别人直接说你判断错了。那种有点刺耳、却带着经验的回复，才是 Reddit 最值钱的东西。别只盯着帖子给网站带来多少访问，也看看它有没有让你少走一个月弯路。",
        pullQuote: "在 Reddit，最贵的流量可能只有 40 个点击；最便宜的建议可能替你省三个月。"
      }
    ],
    sectionsEn: [
      {
        heading: "Read the rules on the door before explaining your good intentions.",
        body: "Reddit is not one platform; it is a collection of towns with different tempers. r/startups, r/Entrepreneur, and r/SideProject differ on links, self-promotion, and showcase threads.\n\nRead the rules, pinned posts, and ten recent examples that survived. Moderators cannot see your intentions. They can only see your behaviour.",
        pullQuote: "Feeling sincere does not oblige strangers to invent the missing context for you."
      },
      {
        heading: "Contributing first is not ten comments before harvest.",
        body: "Some founders turn participation into a checklist: leave ten comments, then drop the link on number eleven. Communities can smell the arithmetic.\n\nReal contribution happens when you have nothing to sell. You debug somebody's issue, share failed numbers, or add useful context when a discussion turns shallow. Your history is testimony about whether you see people or a channel.",
        pullQuote: "Do not turn community contribution into a task required before withdrawal. People smell it."
      },
      {
        heading: "Disclosure does not kill the post. Pretending to be a passer-by does.",
        body: "If you built the product, say so. ‘I built this because…’ has more dignity than ‘I recently discovered an amazing tool.’ Redditors do not fear incentives; they hate being treated as fools.\n\nMake the post useful before the link appears. If removing the link makes the whole thing collapse, it was only an ad.",
        pullQuote: "Real transparency means the post still stands after the link is removed."
      },
      {
        heading: "Do not ask for ‘any feedback.’ Name the exact place you are stuck.",
        body: "A vague request earns vague encouragement. Say: ‘We have 43 weekly active users and lose 62% before first completion. I think onboarding is too long, but I do not know which step to cut.’\n\nSpecific problems attract people with scars. A sharp reply may save you a month even if the post sends only forty visitors.",
        pullQuote: "On Reddit, forty clicks can be expensive and one blunt answer can be cheap."
      }
    ],
    experimentTitleZh: "发帖前，先过这三道土办法",
    experimentTitleEn: "Three unglamorous checks before you post",
    experimentsZh: [
      { label: "01 / 拔掉链接", body: "删掉产品链接再读一遍：这篇东西还值得别人花时间吗？" },
      { label: "02 / 亮明身份", body: "把『发现一个工具』改成『这是我做的，起因是……』。" },
      { label: "03 / 缩小问题", body: "把『求建议』改成一个带数据、能被反驳的具体判断。" }
    ],
    experimentsEn: [
      { label: "01 / PULL THE LINK", body: "Remove the product URL. Is the post still worth a stranger's time?" },
      { label: "02 / NAME YOURSELF", body: "Replace ‘found this tool’ with ‘I built this because…’" },
      { label: "03 / SHRINK THE ASK", body: "Turn ‘feedback?’ into one specific, falsifiable question with numbers." }
    ]
  },
  {
    slug: "product-changelog-to-linkedin-post",
    publishedAt: "2026-08-04",
    updatedAt: "2026-08-22",
    platform: "LinkedIn",
    readingMinutes: 8,
    authorZh: "Joey Zhao · Finfold 创始人",
    authorEn: "Joey Zhao · Founder of Finfold",
    disclosureZh: "第一手产品工作流 · 示例取材自 Finfold 公开更新日志；示例文案不代表已经获得特定曝光、注册或付费结果。",
    disclosureEn: "Firsthand product workflow · the example uses Finfold's public changelog; the draft does not claim any specific reach, signup, or revenue result.",
    titleZh: "产品更新怎么写成 LinkedIn 帖子？从 Changelog 到可发布草稿",
    titleEn: "How to Turn Product Release Notes into a LinkedIn Post",
    seoTitleZh: "Release Notes 怎么转 LinkedIn 帖子｜真实改写示例｜Finfold",
    seoTitleEn: "Turn Release Notes into a LinkedIn Post: Real Example | Finfold",
    descriptionZh: "更新日志负责记录发生了什么，LinkedIn 帖子要说明这件事为什么值得同行关心。用一个真实 Finfold 版本拆解从变化选择、用户经历、因果证据到可验证 CTA 的完整改写过程。",
    descriptionEn: "Release notes record what changed. A LinkedIn post explains why a peer should care. Here is a complete rewrite using a real Finfold release.",
    seoDescriptionZh: "用一份真实 Finfold 更新日志演示如何只选一个用户能感知的变化，把工程清单改成有开场、有因果证据和可验证 CTA 的 LinkedIn 帖子，同时保留事实边界，不虚构曝光、注册或付费结果。",
    seoDescriptionEn: "A step-by-step rewrite of real release notes into a LinkedIn post: choose one user-visible change, preserve the evidence, and end with a testable CTA.",
    kickerZh: "问题型教程 01 · CHANGELOG → LINKEDIN",
    kickerEn: "HOW-TO 01 · CHANGELOG → LINKEDIN",
    introZh: "更新日志写得越完整，越容易在 LinkedIn 上变成一堵墙。修了五个 bug、补了三个接口、调整了两条发布流程——每一项都是真的，但把它们原样贴出去，读者只会看见一张工程清单。\n\n这篇不虚构一个『爆款结果』。我们直接用 Finfold 0.9.0-beta.3 的公开记录做示例：当时内容生成因为模型供应链余额问题整体失败，随后加入免费模型默认值、直连 LLM 兜底和更透明的底层错误。事实已经足够有张力，真正需要做的是选出一个读者能带走的判断。",
    introEn: "The more complete a changelog is, the easier it becomes a wall on LinkedIn. Five bug fixes, three endpoints, and two release checks may all be true. Pasted together, they still read like an engineering inventory.\n\nThis guide will not invent a viral result. It uses Finfold 0.9.0-beta.3: generation failed when a model-provider balance reached zero, so we changed the default model, added a direct-LLM fallback, and exposed the underlying provider error. The facts already contain tension. The job is to choose the lesson a peer can carry away.",
    sectionsZh: [
      {
        heading: "第一步：不要总结整个版本，只选一个变化",
        body: "先把 changelog 分成三栏：用户能感知的变化、团队付出的代价、以后不会再犯的规则。LinkedIn 帖子通常只需要其中一条主线。\n\n这次可以选『AI 产品不能把单一模型供应商当成可靠性』。模型名称、迁移编号和错误码仍然重要，但它们应该成为证据，不应该争抢标题。其他更新继续留在 changelog，不必硬塞进一篇帖子。",
        pullQuote: "更新日志追求完整，社交内容追求一个值得记住的判断。"
      },
      {
        heading: "第二步：把功能名改写成用户经历",
        body: "『新增直连 LLM 兜底』是实现；『主供应商失效时，用户仍然能完成生成』才是体验。先写用户经历，再补技术动作，同行才知道这件事与自己的产品有什么关系。\n\n一个可用开头是：『一次余额耗尽，让我们的 AI 内容生成全部停摆。我们原以为有 Agent 编排就等于有可靠性，后来才承认：编排层不是备用供应商。』它没有夸大结果，只把错误判断和修复方向说清楚。",
        pullQuote: "功能名回答我们做了什么，用户经历回答为什么值得看。"
      },
      {
        heading: "第三步：用三块证据替代十二条功能",
        body: "正文可以只保留三块：发生了什么、为什么原设计没有兜住、现在有哪些独立保护。对应这次更新，就是供应商余额导致拒绝、默认模型和共享 Agent 仍属于同一故障域、直连 GLM 与可见底层错误成为新的保护。\n\n不要把『我们提升了稳定性』写成空结论。写清楚故障域、备用路径和用户现在会看到的错误，读者才能判断这套经验能否迁移到自己的产品。",
        pullQuote: "真正有用的技术内容，不是功能多，而是因果链没有断。"
      },
      {
        heading: "第四步：给一个能验证的下一步，而不是喊口号",
        body: "结尾不必问空泛的『你怎么看 AI 可靠性』。可以让读者检查一件具体的事：关掉主模型供应商，看看试用、正式生成和错误提示分别发生什么。\n\n如果帖子要带产品链接，正文先独立成立，再自然说明完整更新记录或可试用入口。上线后分别记录曝光、链接点击、试用开始、注册与首个内容包，不把点赞当作最终答案。",
        pullQuote: "好 CTA 不是索要注意力，是把读者送到下一次可验证的动作。"
      }
    ],
    sectionsEn: [
      {
        heading: "Step 1: choose one change, not the whole release",
        body: "Sort the changelog into three columns: what users felt, what the team paid, and what rule will prevent a repeat. A LinkedIn post usually needs one thread.\n\nFor this release, the thread is: an AI product cannot treat one model supply chain as reliability. Model names, migration numbers, and error codes remain evidence. They do not all need to compete for the headline.",
        pullQuote: "A changelog aims for completeness. A social post aims for one lesson worth remembering."
      },
      {
        heading: "Step 2: turn the implementation into a user experience",
        body: "‘Added a direct-LLM fallback’ is implementation language. ‘Users can still finish generation when the primary provider fails’ is the experience. Put that first, then explain the technical move.\n\nA defensible opening is: ‘One depleted provider balance stopped every generation. We thought an agent orchestration layer gave us resilience. It did not give us a second supplier.’ It names the mistaken assumption without inventing a business result.",
        pullQuote: "The feature name says what we built. The user experience says why it matters."
      },
      {
        heading: "Step 3: replace twelve bullets with three pieces of evidence",
        body: "Keep three blocks: what failed, why the original design did not contain it, and which independent protections now exist. Here, that means provider rejection, one shared failure domain, and a direct GLM path plus visible underlying errors.\n\nDo not stop at ‘reliability improved.’ Name the failure domain, fallback, and user-visible behaviour so a peer can test whether the lesson transfers to their product.",
        pullQuote: "Useful technical content is not feature-dense. Its causal chain is intact."
      },
      {
        heading: "Step 4: end with a testable next action",
        body: "Do not ask a vague question about AI reliability. Ask the reader to disable their primary model provider and inspect what happens to trials, paid generation, and error messages.\n\nIf the post includes a product link, make the post useful without it first. Then measure impressions, link clicks, trial starts, signups, and first completed work — not likes alone.",
        pullQuote: "A good CTA does not demand attention. It leads to the next testable action."
      }
    ],
    experimentTitleZh: "把下一段 release note 改成一条能验证的帖子",
    experimentTitleEn: "Turn the next release note into a testable post",
    experimentsZh: [
      { label: "01 / 只选一件", body: "圈出用户能感知的一次变化，把其余更新留在 changelog。" },
      { label: "02 / 写出因果", body: "用『错误判断 → 真实代价 → 新保护』写三段，不先写功能清单。" },
      { label: "03 / 追到试用", body: "给链接加 UTM，记录帖子点击、试用开始和注册，而不只看点赞。" }
    ],
    experimentsEn: [
      { label: "01 / PICK ONE", body: "Circle one user-visible change. Leave the rest in the changelog." },
      { label: "02 / KEEP CAUSALITY", body: "Write the mistaken assumption, real cost, and new protection before the feature list." },
      { label: "03 / TRACE THE TRIAL", body: "Add UTMs and track clicks, trial starts, and signups instead of likes alone." }
    ]
  },
  {
    slug: "product-hunt-maker-comment-guide",
    publishedAt: "2026-08-04",
    updatedAt: "2026-08-04",
    platform: "Product Hunt",
    readingMinutes: 7,
    authorZh: "Joey Zhao · Finfold 创始人",
    authorEn: "Joey Zhao · Founder of Finfold",
    disclosureZh: "产品工作示例 · 文案基于 Finfold 的真实能力编写，但不是已发布的 Product Hunt 页面，也不宣称任何榜单或转化结果。",
    disclosureEn: "Product working example · the copy uses real Finfold capabilities, but it is not a live Product Hunt listing and claims no ranking or conversion result.",
    titleZh: "Product Hunt Maker Comment 怎么写？一份不靠夸张词的发布结构",
    titleEn: "How to Write a Product Hunt Maker Comment Without the Hype",
    descriptionZh: "Maker Comment 不是第二份产品介绍。它要让人理解你为什么做、现在真正解决什么、哪些能力已经可以验证，以及你希望首批用户帮忙回答哪个具体问题；这份指南用真实能力替代夸张词。",
    descriptionEn: "A Maker Comment is not a second product description. It explains why you built the product, what it truly solves, and what early users should help validate.",
    kickerZh: "问题型教程 02 · PRODUCT HUNT MAKER COMMENT",
    kickerEn: "HOW-TO 02 · PRODUCT HUNT MAKER COMMENT",
    introZh: "写 Product Hunt 文案最容易出现一种奇怪的紧张：产品明明还在 Beta，句子却已经开始『revolutionize the future』。越担心别人看不懂，越想把所有功能和最高级形容词一起塞进去。\n\n下面用 Finfold 做工作示例，但不虚构它已经在 Product Hunt 获得排名或转化。Finfold 的事实很简单：把一条真实产品信号变成不同平台的文案与视觉，记录发布状态和表现，再把经验带回下一轮。Maker Comment 的任务，是把这条事实背后的人、代价和待验证问题讲清楚。",
    introEn: "Product Hunt copy creates a peculiar panic. The product is still in beta, yet the sentences are already ‘revolutionising the future.’ The harder a maker tries to explain everything, the more features and superlatives crowd the page.\n\nWe will use Finfold as a working example without pretending it has earned a Product Hunt rank or conversion result. The factual promise is simple: turn one real product signal into channel-native copy and visuals, track publication and performance, then carry the learning forward. The Maker Comment should explain the person, cost, and open question behind that promise.",
    sectionsZh: [
      {
        heading: "先把 tagline 写成人能复述的一句话",
        body: "Tagline 不负责讲完产品。它只需要交代对象和变化。比起『The ultimate AI-powered content ecosystem』，更诚实的版本是：『Turn one product update into channel-native launch content.』\n\n检查方法很简单：一个不认识你的人读完，能否用自己的话复述产品帮谁完成什么？如果必须解释 revolutionary、next-generation 或 all-in-one 到底指什么，这句话还没有完成工作。",
        pullQuote: "Tagline 不是把产品抬高，是把理解成本压低。"
      },
      {
        heading: "Maker Comment 先写起因，再写产品",
        body: "开头回答『我们为什么非做不可』，但不要编造戏剧。Finfold 的真实起因可以写：一次产品更新往往要重写成公众号、小红书、X、LinkedIn、Reddit 和 Product Hunt；小团队既维护不了这么多套表达，也很难记住上次什么有效。\n\n这段起因把痛点、受众和产品边界放在一起。它比『AI 正在改变营销』更具体，也允许不需要多平台工作流的人迅速离开。",
        pullQuote: "好起因会筛选用户，不会试图让所有人都点头。"
      },
      {
        heading: "功能只留能证明主张的四件事",
        body: "功能列表不要按开发顺序排列。围绕主张选证据：保存品牌语气、按平台生成独立草稿、一起准备文案与视觉、记录表现并形成下一轮规则。每一项都能在产品里被用户实际操作。\n\n暂未完成或需要人工服务的能力要说清楚。Beta 产品最伤信任的不是功能少，而是把路线图写成现在时。",
        pullQuote: "发布页不是 roadmap 的化妆间，只展示今天真正能交付的东西。"
      },
      {
        heading: "最后只问一个你真的会据此改产品的问题",
        body: "『欢迎任何反馈』看起来谦虚，实际上把工作推给读者。更具体的问题可以是：『第一次使用时，你更想从 changelog 链接自动提取，还是直接粘贴一段更新？』\n\n发布前再次检查 Product Hunt 当天的字段和社区规则，因为平台会变化。发布后分别记录页面访问、工具试用、注册、首个内容包和付费；排名可以庆祝，但不能替代产品学习。",
        pullQuote: "最好的反馈请求，不是礼貌，是一个会改变下一版的选择。"
      }
    ],
    sectionsEn: [
      {
        heading: "Write a tagline another person can repeat",
        body: "A tagline does not finish the product story. It names the audience and change. Instead of ‘The ultimate AI-powered content ecosystem,’ try: ‘Turn one product update into channel-native launch content.’\n\nA stranger should be able to restate who it helps and what changes. If ‘revolutionary,’ ‘next-generation,’ or ‘all-in-one’ needs another explanation, the line has not done its job.",
        pullQuote: "A tagline does not elevate the product. It lowers the cost of understanding it."
      },
      {
        heading: "Start the Maker Comment with the cause, not the product",
        body: "Explain why the product had to exist without manufacturing drama. Finfold's real starting point is enough: one update becomes WeChat, Xiaohongshu, X, LinkedIn, Reddit, and Product Hunt content; a small team cannot maintain every voice or remember what worked last time.\n\nThat origin combines the pain, audience, and boundary. It is more useful than ‘AI is transforming marketing,’ and it lets people without the problem leave quickly.",
        pullQuote: "A good origin filters. It does not make everybody nod."
      },
      {
        heading: "Keep only four features that prove the promise",
        body: "Do not order features by development history. Choose evidence for the claim: saved brand voice, distinct channel drafts, copy and visuals reviewed together, and performance carried into the next rule. Each should be something a user can operate today.\n\nBe explicit about beta limits and human-service boundaries. A beta does not lose trust by being small. It loses trust when the roadmap is written in the present tense.",
        pullQuote: "A launch page is not a dressing room for the roadmap. Show what ships today."
      },
      {
        heading: "Ask one question that could actually change the next release",
        body: "‘All feedback welcome’ sounds humble and gives the reader the work. Ask: ‘On first use, would you rather import a changelog URL or paste the update directly?’\n\nRecheck Product Hunt's current fields and community rules on launch day because platforms change. Then track page visits, tool trials, signups, first completed work, and payment. A rank is worth celebrating; it is not a substitute for product learning.",
        pullQuote: "The best feedback request is not polite. It creates a choice that can change the next build."
      }
    ],
    experimentTitleZh: "发布前，把 Maker Comment 做一次减法",
    experimentTitleEn: "Subtract before publishing the Maker Comment",
    experimentsZh: [
      { label: "01 / 删最高级", body: "删掉所有无法在产品里当场证明的形容词，再读一次。" },
      { label: "02 / 只留四证据", body: "每个功能都必须直接证明核心承诺，否则移到更新日志。" },
      { label: "03 / 问一个选择", body: "把『欢迎反馈』改成一个会影响下一版的具体取舍。" }
    ],
    experimentsEn: [
      { label: "01 / DELETE HYPE", body: "Remove every adjective you cannot prove in the product today." },
      { label: "02 / KEEP FOUR PROOFS", body: "Every feature must prove the central promise or move back to the changelog." },
      { label: "03 / ASK A CHOICE", body: "Replace ‘feedback welcome’ with one tradeoff that could change the next release." }
    ]
  }
];

export const archivedBlogPosts: BlogPost[] = [
  ...aiMarketingBlogPosts,
  ...existingBlogPosts
];

export const blogPosts: BlogPost[] = growthCaseStudyBlogPosts;

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}

const relatedBlogSlugsByPost: Record<string, readonly string[]> = {
  "reddit-shadowban-recovery-cases": [
    "reddit-growth-vote-manipulation-risk",
    "reddit-first-customers-manual-outreach",
    "reddit-post-patterns-popsy-ai"
  ],
  "reddit-growth-vote-manipulation-risk": [
    "reddit-shadowban-recovery-cases",
    "reddit-post-patterns-popsy-ai",
    "reddit-first-customers-manual-outreach"
  ],
  "reddit-first-customers-manual-outreach": [
    "reddit-post-patterns-popsy-ai",
    "reddit-growth-vote-manipulation-risk",
    "validate-demand-before-building"
  ],
  "reddit-post-patterns-popsy-ai": [
    "reddit-first-customers-manual-outreach",
    "reddit-growth-vote-manipulation-risk",
    "content-compounding-founder-system"
  ],
  "validate-demand-before-building": [
    "reddit-first-customers-manual-outreach",
    "content-compounding-founder-system",
    "reddit-post-patterns-popsy-ai"
  ],
  "content-compounding-founder-system": [
    "validate-demand-before-building",
    "reddit-first-customers-manual-outreach",
    "reddit-post-patterns-popsy-ai"
  ],
  "seo-new-keyword-game-case-study": [
    "geo-citation-recommendation-experiment",
    "validate-demand-before-building",
    "content-compounding-founder-system"
  ],
  "geo-citation-recommendation-experiment": [
    "seo-new-keyword-game-case-study",
    "content-compounding-founder-system",
    "validate-demand-before-building"
  ],
  "xiaohongshu-plus-size-fashion-positioning": [
    "xiaohongshu-founder-livestream-case-study",
    "content-compounding-founder-system",
    "validate-demand-before-building"
  ],
  "xiaohongshu-founder-livestream-case-study": [
    "xiaohongshu-plus-size-fashion-positioning",
    "content-compounding-founder-system",
    "validate-demand-before-building"
  ]
};

export function getRelatedBlogPosts(slug: string): BlogPost[] {
  const relatedSlugs = relatedBlogSlugsByPost[slug] ?? [];
  return relatedSlugs
    .map((relatedSlug) => getBlogPost(relatedSlug))
    .filter((post): post is BlogPost => Boolean(post));
}

export const founderMarketingBlogSlugs: ReadonlySet<string> = new Set([
  "reddit-shadowban-recovery-cases",
  "reddit-growth-vote-manipulation-risk",
  "reddit-first-customers-manual-outreach",
  "reddit-post-patterns-popsy-ai",
  "validate-demand-before-building",
  "content-compounding-founder-system",
  "seo-new-keyword-game-case-study",
  "geo-citation-recommendation-experiment",
  "xiaohongshu-plus-size-fashion-positioning",
  "xiaohongshu-founder-livestream-case-study"
]);

export const landingFeaturedBlogSlugs = [
  "content-compounding-founder-system",
  "reddit-growth-vote-manipulation-risk",
  "validate-demand-before-building"
] as const;

export function getLandingFeaturedBlogPosts(): BlogPost[] {
  return landingFeaturedBlogSlugs
    .map((slug) => getBlogPost(slug))
    .filter((post): post is BlogPost => Boolean(post));
}
