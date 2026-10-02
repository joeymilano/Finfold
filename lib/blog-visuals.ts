export type BlogVisual = {
  src: string;
  altZh: string;
  altEn: string;
  captionZh: string;
  captionEn: string;
  sourceLabelZh: string;
  sourceLabelEn: string;
  sourceUrl: string;
};

const fallbackVisual: BlogVisual = {
  src: "/editorial/growth-field-notes.webp",
  altZh: "一张正在修改中的内容草稿",
  altEn: "A content draft being revised",
  captionZh: "Finfold 编辑部图片",
  captionEn: "Finfold editorial image",
  sourceLabelZh: "Finfold",
  sourceLabelEn: "Finfold",
  sourceUrl: "/blog"
};

const visualsBySlug: Record<string, BlogVisual> = {
  "content-compounding-founder-system": {
    src: "/editorial/real-cases/josh-ho-buffer.webp",
    altZh: "Buffer 的 Josh Ho 访谈封面",
    altEn: "Buffer interview cover featuring Josh Ho",
    captionZh: "Josh Ho 把创始人日常工作变成播客、通讯和社交内容。图片来自 Buffer 对他的实名访谈。",
    captionEn: "Josh Ho turns everyday founder work into podcasts, newsletters, and social posts. Image from Buffer's named interview.",
    sourceLabelZh: "Buffer 原始访谈",
    sourceLabelEn: "Original Buffer interview",
    sourceUrl: "https://buffer.com/resources/creators-unlocked-josh-ho/"
  },
  "reddit-growth-vote-manipulation-risk": {
    src: "/editorial/real-cases/romain-gojiberry.webp",
    altZh: "Gojiberry AI 联合创始人 Romain 在 Starter Story 访谈中展示数据面板",
    altEn: "Gojiberry AI cofounder Romain showing a dashboard in a Starter Story interview",
    captionZh: "Romain 在 Starter Story 视频里展示产品数据。展示、访问与收入数字均为访谈中的当事人自报。",
    captionEn: "Romain shows product data in a Starter Story video. Reach, traffic, and revenue figures are founder-reported in the interview.",
    sourceLabelZh: "Starter Story 原始访谈",
    sourceLabelEn: "Original Starter Story interview",
    sourceUrl: "https://www.starterstory.com/roman"
  },
  "validate-demand-before-building": {
    src: "/editorial/real-cases/felix-hacker-news.webp",
    altZh: "Felix Heikka 在 Hacker News 公开的早期用户增长复盘",
    altEn: "Felix Heikka's public early-user growth retrospective on Hacker News",
    captionZh: "Felix 在 Hacker News 公开写下问卷、前 100 个用户和后续增长数据。截图保留原始口径，数据未经独立审计。",
    captionEn: "Felix documented the survey, first 100 users, and later growth on Hacker News. The screenshot preserves his wording; the figures are not independently audited.",
    sourceLabelZh: "Hacker News 原帖",
    sourceLabelEn: "Original Hacker News post",
    sourceUrl: "https://news.ycombinator.com/item?id=42821678"
  },
  "reddit-shadowban-recovery-cases": {
    src: "/editorial/real-cases/reddit-restoration.webp",
    altZh: "Damariobros 在 Reddit 求助恢复旧帖的公开页面",
    altEn: "Damariobros's public Reddit thread asking for old-post restoration",
    captionZh: "Damariobros 公开说明申诉成功后旧帖仍未恢复。页面里的管理员回复写明问题已经修复。",
    captionEn: "Damariobros reported that old posts remained missing after a successful appeal. An administrator reply on the page says the issue was fixed.",
    sourceLabelZh: "Reddit 公开原帖截图",
    sourceLabelEn: "Screenshot of the public Reddit thread",
    sourceUrl: "https://www.reddit.com/r/reddithelp/comments/1uoguyr/need_help_restoring_posts_after_successful/"
  },
  "reddit-post-patterns-popsy-ai": {
    src: "/editorial/real-cases/popsy-reddit-analysis.webp",
    altZh: "Popsy AI 在 Reddit 公开的高互动帖子分析",
    altEn: "Popsy AI's public analysis of high-engagement Reddit posts",
    captionZh: "Popsy AI 在公开帖子里展示五类内容结构。样本规模和分析能力来自公司账号自报。",
    captionEn: "Popsy AI presented five content structures in a public post. Dataset size and analysis capability are company-reported.",
    sourceLabelZh: "Reddit 公开原帖截图",
    sourceLabelEn: "Screenshot of the public Reddit thread",
    sourceUrl: "https://www.reddit.com/r/SaaS/comments/1ljh5ia/i_analyzed_10k_top_posts_on_rsaas_5_post_types/"
  },
  "reddit-first-customers-manual-outreach": {
    src: "/editorial/real-cases/firsteyes-deleted-source.webp",
    altZh: "firsteyes AI 早期获客复盘在 Reddit 的公开页面",
    altEn: "The public Reddit page for firsteyes AI's early-customer retrospective",
    captionZh: "页面标题和讨论仍可见，正文抓取时已经删除。文章因此保留当事人自报的边界，不把 40 位付费用户当成已核准业绩。",
    captionEn: "The title and discussion remain visible, while the body had been deleted when captured. The article therefore treats 40 paying users as an unverified firsthand report.",
    sourceLabelZh: "Reddit 公开页面截图",
    sourceLabelEn: "Screenshot of the public Reddit page",
    sourceUrl: "https://www.reddit.com/r/saasbuild/comments/1vnirnl/crossed_40_paying_customers_with_my_saas_heres/"
  },
  "seo-new-keyword-game-case-study": {
    src: "/editorial/real-cases/webcafe-seo-game-gsc.webp",
    altZh: "小游戏出海 SEO 复盘公开的 Search Console 点击率曲线",
    altEn: "Search Console CTR chart published with an international SEO game retrospective",
    captionZh: "小虎公开的 Search Console 主词曲线显示 5 月 16 日有 19292 次展示、25 次点击和 0.1% 点击率。数据为作者自报。",
    captionEn: "Xiaohu's public Search Console chart shows 19,292 impressions, 25 clicks, and a 0.1% CTR on May 16. The figures are author-reported.",
    sourceLabelZh: "Web.Cafe 原始复盘",
    sourceLabelEn: "Original Web.Cafe retrospective",
    sourceUrl: "https://new.web.cafe/topic/vs1k9fojsk"
  },
  "geo-citation-recommendation-experiment": {
    src: "/editorial/real-cases/ahrefs-geo-backfire.webp",
    altZh: "Ahrefs 实验中 AI 引用页面后是否提及品牌的对比图",
    altEn: "Ahrefs chart comparing whether AI named a brand after citing its page",
    captionZh: "Ahrefs 的公司实验显示，引用会议推广页的回答有 43% 没有提 Evolve；工具推广页的同类比例是 11%。",
    captionEn: "Ahrefs' company-run experiment found that 43% of answers citing conference pages omitted Evolve, compared with 11% for tool pages.",
    sourceLabelZh: "Ahrefs 原始实验",
    sourceLabelEn: "Original Ahrefs experiment",
    sourceUrl: "https://ahrefs.com/blog/self-promotional-content-ai-seo-experiment/"
  },
  "xiaohongshu-plus-size-fashion-positioning": {
    src: "/editorial/real-cases/xiaohongshu-wangwei-positioning.webp",
    altZh: "王微 WHICH 的小红书主页定位截图",
    altEn: "Positioning shown on the Xiaohongshu profile of Wang Wei WHICH",
    captionZh: "公开文章保存的王微 WHICH 主页截图，把人群写成 40+ 微胖，把身份写成会挑衣服的大姐姐。",
    captionEn: "A public article preserved Wang Wei WHICH's profile, describing an audience over 40 and a founder who knows how to choose clothes for plus-size bodies.",
    sourceLabelZh: "亿邦动力公开文章截图",
    sourceLabelEn: "Screenshot in Ebrun's public report",
    sourceUrl: "https://www.flipboard.cn/a/97bd180b834fafe667f48e518ca5affc"
  },
  "xiaohongshu-founder-livestream-case-study": {
    src: "/editorial/real-cases/xiaohongshu-sui-founder-live.webp",
    altZh: "隋美芝在小红书视频中拿着知和无尤玫瑰产品",
    altEn: "Sui Meizhi holding Zhihe Wuyou rose products in a Xiaohongshu video",
    captionZh: "隋美芝以种玫瑰的咪咪妈妈出镜讲产品。画面来自 36kr 公开报道保存的小红书视频。",
    captionEn: "Sui Meizhi appears as the rose-growing founder behind the product. The frame comes from a Xiaohongshu video preserved in 36kr's public report.",
    sourceLabelZh: "36kr 公开报道画面",
    sourceLabelEn: "Frame in 36kr's public report",
    sourceUrl: "https://www.36kr.com/p/3038278872330498"
  }
};

export function getBlogVisual(slug: string): BlogVisual {
  return visualsBySlug[slug] ?? fallbackVisual;
}
