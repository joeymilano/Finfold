/**
 * Seeds the three demo lead tools (获客搭子样例) for the primary account
 * and publishes them, so /t/[slug] has real showcase pages the moment the
 * P1 deploy lands. Idempotent: re-running skips tools that already exist.
 *
 * Usage: node scripts/seed-lead-tool-samples.mjs
 * Override the owner with LEAD_TOOL_SEED_USER_ID (otherwise the most
 * recently created auth user is used — this is a single-tenant deploy).
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

function loadEnvLocal() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnvLocal();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
  Prefer: "return=representation"
};

const FINFOLD_SIGNUP = "https://www.finfold.app/signup?utm_source=leadtool_sample";
const FINFOLD_WORKBUDDY = "https://www.finfold.app/workbuddy?utm_source=leadtool_sample";

const samples = [
  {
    title: "你的内容运营，最该先交给 AI 的是哪一环？",
    businessContext: "Finfold 自用样例：面向已经在做内容、但被某个环节拖住的创始人/运营。",
    spec: {
      title: "你的内容运营，最该先交给 AI 的是哪一环？",
      intro: "五道题，两分钟。做完你会知道自己的时间被哪个环节吃掉了，以及第一步可以交出去的是什么。",
      brand: { name: "Finfold 一鱼多吃", tagline: "你的第一位 AI 增长运营员工", accent_color: "#0f766e", logo_url: "", show_finfold_credit: true },
      questions: [
        { id: "q1", text: "「选题」：你多久能定下一个值得写的题目？", help: "", options: [
          { id: "q1a", text: "经常一周憋不出一个", points: 4 },
          { id: "q1b", text: "有想法，但不确定值不值得写", points: 2 },
          { id: "q1c", text: "选题从来不是我的问题", points: 0 }
        ] },
        { id: "q2", text: "「成稿」：一篇能发出去的稿子，你通常要写多久？", help: "", options: [
          { id: "q2a", text: "半天以上，写写改改", points: 4 },
          { id: "q2b", text: "一两个小时", points: 2 },
          { id: "q2c", text: "很快就能写完", points: 0 }
        ] },
        { id: "q3", text: "「多平台」：同一个内容发不同平台时，你怎么处理？", help: "", options: [
          { id: "q3a", text: "每个平台手动重写一遍", points: 4 },
          { id: "q3b", text: "改改标题开头就发", points: 2 },
          { id: "q3c", text: "只发一个平台", points: 0 }
        ] },
        { id: "q4", text: "「评论区」：评论和私信，你跟得上吗？", help: "", options: [
          { id: "q4a", text: "经常没空回，一直攒着", points: 4 },
          { id: "q4b", text: "有空就回，没有规律", points: 2 },
          { id: "q4c", text: "评论不多，能应付", points: 0 }
        ] },
        { id: "q5", text: "「复盘」：内容发出去之后，你会看数据吗？", help: "", options: [
          { id: "q5a", text: "基本不看，发了就算", points: 4 },
          { id: "q5b", text: "看一眼浏览量", points: 2 },
          { id: "q5c", text: "有固定的复盘习惯", points: 0 }
        ] }
      ],
      results: [
        { id: "r_produce", title: "先把「写」和「改」交出去", summary: "成稿和多平台改写已经吃掉了你大部分时间。这两个环节的判断标准最清晰、最容易交给 AI 起步：你说清一条更新，让它按平台出稿，你只做审核。", checklist: ["把最近一条产品更新交给 AI 生成三个平台的版本，自己只改不改得动的地方", "固定一个审核清单：事实、承诺、语气，三项过完才发", "省下来的时间先别急着加产量，用来做选题"], basis: "第 2、3 题得分高，说明成稿与改写是当前最重的负担。", min_score: 14, max_score: 20, entry: "entry_signup" },
        { id: "r_partial", title: "从拖你最重的那一环开始交", summary: "你的整体负担不算失控，但有一两个环节明显在拖。先把那个环节的判断标准写清楚，再交给 AI，比一次性全交更稳。", checklist: ["找出你得分最高的那一题对应的环节", "给这个环节写一句「什么算做得好」", "把这一环交给 AI 跑两周，只看它省了多少时间"], basis: "各题得分有高有低，存在单点瓶颈，适合单环节切入。", min_score: 7, max_score: 13, entry: "entry_signup" },
        { id: "r_direction", title: "你不缺执行力，缺的是方向", summary: "写和发对你都不是难事，难的是不知道什么值得写、写完有没有用。先把选题交给持续扫描，比埋头多写更有效。", checklist: ["列出你业务里客户反复问的三个问题，作为选题底稿", "每周固定一小时只做选题不做执行", "发出去的内容记下带来的咨询或注册，反过来指导下周选题"], basis: "执行类题目得分低，第 1、5 题暴露的是方向与反馈缺失。", min_score: 0, max_score: 6, entry: "entry_signup" }
      ],
      entries: [
        { id: "entry_signup", label: "免费开始第一项任务", url: FINFOLD_SIGNUP, hint: "注册送 50 AI 点数" }
      ]
    }
  },
  {
    title: "你的作品集，现在最该先改哪里？",
    businessContext: "设计服务样例：作品集辅导工作室的获客自测（演示数据）。",
    spec: {
      title: "你的作品集，现在最该先改哪里？",
      intro: "五道题，两分钟，得到一份对应的修改清单。匿名作答，不需要留任何联系方式。",
      brand: { name: "作品集辅导工作室（示例）", tagline: "", accent_color: "#9f1239", logo_url: "", show_finfold_credit: true },
      questions: [
        { id: "q1", text: "你的申请或求职方向明确吗？", help: "指目标国家、公司类型、岗位都已收窄", options: [
          { id: "q1a", text: "明确了，就冲这一类", points: 4 },
          { id: "q1b", text: "大概有个方向", points: 2 },
          { id: "q1c", text: "还在探索", points: 0 }
        ] },
        { id: "q2", text: "你有 2 个以上完整的项目吗？", help: "完整 = 有背景、有你做的事、有结果", options: [
          { id: "q2a", text: "有，都讲得比较完整", points: 4 },
          { id: "q2b", text: "有项目，但讲得零散", points: 2 },
          { id: "q2c", text: "还在攒项目", points: 0 }
        ] },
        { id: "q3", text: "项目里「为什么这么做」讲得清楚吗？", help: "不是只放成果图，而是决策过程", options: [
          { id: "q3a", text: "清楚，每页都有取舍说明", points: 4 },
          { id: "q3b", text: "写了一点，不成体系", points: 2 },
          { id: "q3c", text: "基本只放了成果", points: 0 }
        ] },
        { id: "q4", text: "整个作品集的视觉呈现统一吗？", help: "排版、配色、图标风格是否像一个人做的", options: [
          { id: "q4a", text: "统一，有自己的规范", points: 4 },
          { id: "q4b", text: "大体统一，有细节跳戏", points: 2 },
          { id: "q4c", text: "每个项目各是各的", points: 0 }
        ] },
        { id: "q5", text: "你现在最担心哪个环节？", help: "", options: [
          { id: "q5a", text: "项目够多，就是讲不好", points: 4 },
          { id: "q5b", text: "讲得还行，视觉拿不出手", points: 2 },
          { id: "q5c", text: "不知道从哪开始改", points: 0 }
        ] }
      ],
      results: [
        { id: "r_story", title: "先把项目过程讲清楚", summary: "你目前优先要解决的不是增加项目数量，而是把已有项目的决策过程讲清楚：看作品集的人想看的是你怎么想的，不只是你做出来了什么。", checklist: ["给每个项目补一段「问题定义」：当时面对什么约束", "挑一个关键取舍写清楚：为什么选 A 不选 B", "让结果对应回最初的目标，形成闭环"], basis: "第 2、3 题得分低，说明叙事是当前短板，而不是数量或视觉。", min_score: 0, max_score: 8, entry: "entry_demo" },
        { id: "r_visual", title: "视觉统一度是下一件事", summary: "你的内容和叙事已经有一定基础，现在拖后腿的是呈现：不统一的视觉会让好内容显得业余。", checklist: ["定一套三色以内的配色和两款字体", "统一封面版式，让每个项目入口长得像一家", "删掉风格突兀的装饰元素"], basis: "前几题基础尚可、第 4 题得分低，视觉是当前最短板。", min_score: 9, max_score: 13, entry: "entry_demo" },
        { id: "r_ready", title: "你已经在可以投递的水平线上", summary: "方向、叙事、视觉都有基础了，剩下的是打磨细节和投递节奏，而不是再大改。", checklist: ["按目标岗位定制开篇第一个项目", "找两位目标行业的人各看十分钟，记下他们卡在哪", "定一个两周投递节奏并执行"], basis: "多数题得分较高，整体准备度好，进入打磨阶段。", min_score: 14, max_score: 20, entry: "entry_demo" }
      ],
      entries: [
        { id: "entry_demo", label: "预约一次作品集诊断（示例入口）", url: FINFOLD_WORKBUDDY, hint: "这是演示工具——你可以为自己的业务做一个" }
      ]
    }
  },
  {
    title: "你的产品介绍，客户能不能看懂？",
    businessContext: "小团队通用样例：检验产品介绍清晰度的自测（演示数据）。",
    spec: {
      title: "你的产品介绍，客户能不能看懂？",
      intro: "五道题，两分钟。测的不是文笔，是客户看完知不知道你是干嘛的、该不该找你。",
      brand: { name: "Finfold（示例）", tagline: "小团队通用样例", accent_color: "#1d4ed8", logo_url: "", show_finfold_credit: true },
      questions: [
        { id: "q1", text: "用一句话说清你做什么，你能不假思索说出来吗？", help: "", options: [
          { id: "q1a", text: "能，而且客户听得懂", points: 4 },
          { id: "q1b", text: "能说，但对方常追问「所以你们是干嘛的」", points: 2 },
          { id: "q1c", text: "每次说的都不太一样", points: 0 }
        ] },
        { id: "q2", text: "你的首页或介绍页，客户第一屏看到的是什么？", help: "", options: [
          { id: "q2a", text: "一句话价值 + 一个明确的行动按钮", points: 4 },
          { id: "q2b", text: "产品功能列表", points: 2 },
          { id: "q2c", text: "我们的使命与愿景", points: 0 }
        ] },
        { id: "q3", text: "客户看完你的介绍，下一步动作明确吗？", help: "", options: [
          { id: "q3a", text: "明确，常见动作就是注册或预约", points: 4 },
          { id: "q3b", text: "有按钮，但很少人点", points: 2 },
          { id: "q3c", text: "没有设计下一步", points: 0 }
        ] },
        { id: "q4", text: "你收到过「你们到底是做什么的」这类问题吗？", help: "", options: [
          { id: "q4a", text: "从来没有", points: 4 },
          { id: "q4b", text: "偶尔有", points: 2 },
          { id: "q4c", text: "经常有", points: 0 }
        ] },
        { id: "q5", text: "完全外行的人能看懂你的介绍吗？", help: "", options: [
          { id: "q5a", text: "能，我妈都知道我是干嘛的", points: 4 },
          { id: "q5b", text: "内行懂，外行懵", points: 2 },
          { id: "q5c", text: "得先懂我们的行业才行", points: 0 }
        ] }
      ],
      results: [
        { id: "r_clear", title: "你的介绍已经能打，去放大它", summary: "清晰度不是你的问题。现在的杠杆是把这句话放到更多地方，并验证它在不同渠道是否同样好使。", checklist: ["把这句核心话放进所有渠道的开头，而不是藏在关于页", "同一句话写三个版本，各投放一周看反馈", "让老客户用自己的话复述你的业务，把最准的那句收进介绍"], basis: "各题得分都高，清晰度已过关，进入放大阶段。", min_score: 16, max_score: 20, entry: "entry_demo" },
        { id: "r_mixed", title: "一半清楚一半模糊，先修第一屏", summary: "你知道自己要说什么，但客户第一眼看到的可能不是重点。问题多半出在首屏和组织方式，不用推翻重写。", checklist: ["把「帮谁做什么、得到什么结果」挪到第一屏第一句", "功能列表压到三条以内，其余收进二级页面", "给首页只留一个行动按钮，其余入口弱化"], basis: "第 2、3 题得分偏低，首屏与下一步动作是断点。", min_score: 9, max_score: 15, entry: "entry_demo" },
        { id: "r_muddy", title: "客户大概率没看懂，先把这句话修好", summary: "介绍写清楚之前，投放和销售都会打折。好消息是这通常只需要重写一句话，而不是重做产品。", checklist: ["用这个句式重写：「我们帮〔谁〕做〔什么〕，让他们〔结果〕」", "删掉第一句话里的所有行业术语", "找三位目标客户复述给你听，复述不对就再改"], basis: "多题得分低，语义清晰度是当前最大瓶颈。", min_score: 0, max_score: 8, entry: "entry_demo" }
      ],
      entries: [
        { id: "entry_demo", label: "看看 Finfold 怎么帮你把话说明白（示例入口）", url: FINFOLD_WORKBUDDY, hint: "这是演示工具——你可以为自己的业务做一个" }
      ]
    }
  }
];

function slug10() {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

/** Same invariants as lib/lead-tools/schema validateLeadToolSpec — hard fail if a sample drifts. */
function validateSpec(spec) {
  const maxScore = spec.questions.reduce((sum, q) => sum + Math.max(...q.options.map((o) => o.points)), 0);
  const entryIds = new Set(spec.entries.map((e) => e.id));
  const bands = [...spec.results].sort((a, b) => a.min_score - b.min_score);
  let cursor = 0;
  for (const band of bands) {
    if (band.min_score !== cursor) throw new Error(`${spec.title}: band ${band.id} starts at ${band.min_score}, expected ${cursor}`);
    if (!entryIds.has(band.entry)) throw new Error(`${spec.title}: band ${band.id} references missing entry`);
    cursor = band.max_score + 1;
  }
  if (cursor <= maxScore) throw new Error(`${spec.title}: bands end at ${cursor - 1} but max possible is ${maxScore}`);
  if (spec.questions.length < 3 || spec.questions.length > 7) throw new Error(`${spec.title}: question count`);
}

async function main() {
  // Resolve owner: explicit id, else the newest auth user (single-tenant deploy).
  let userId = process.env.LEAD_TOOL_SEED_USER_ID;
  if (!userId) {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=2`, { headers });
    const body = await response.json();
    if (!response.ok) throw new Error(`admin users: ${response.status} ${JSON.stringify(body)}`);
    const users = (body.users ?? []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    if (!users.length) throw new Error("No auth users found.");
    userId = users[0].id;
    console.log(`Owner: newest auth user ${userId} (${users[0].email ?? "no email"})`);
  }

  for (const sample of samples) {
    validateSpec(sample.spec);

    const existing = await fetch(
      `${supabaseUrl}/rest/v1/lead_tools?select=id,slug&user_id=eq.${userId}&title=eq.${encodeURIComponent(sample.title)}`,
      { headers }
    ).then((r) => r.json());
    if (existing.length) {
      console.log(`SKIP (exists): ${sample.title} -> /t/${existing[0].slug}`);
      continue;
    }

    const toolId = randomUUID();
    const versionId = randomUUID();
    const slug = slug10();

    const insertTool = await fetch(`${supabaseUrl}/rest/v1/lead_tools`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: toolId,
        user_id: userId,
        slug,
        title: sample.title,
        business_context: sample.businessContext,
        spec: sample.spec,
        published_spec: sample.spec,
        status: "published",
        latest_version_id: versionId
      })
    });
    if (!insertTool.ok) throw new Error(`insert tool: ${insertTool.status} ${await insertTool.text()}`);

    const insertVersion = await fetch(`${supabaseUrl}/rest/v1/lead_tool_versions`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        id: versionId,
        tool_id: toolId,
        user_id: userId,
        version: 1,
        spec: sample.spec,
        note: "样例种子"
      })
    });
    if (!insertVersion.ok) throw new Error(`insert version: ${insertVersion.status} ${await insertVersion.text()}`);

    console.log(`SEEDED: ${sample.title} -> https://www.finfold.app/t/${slug} (draft+published, v1)`);
  }

  console.log("\nAll samples are live-ready. They appear under 运营 → 获客搭子 once P1 deploys.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
