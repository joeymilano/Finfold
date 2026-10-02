export type CompareFaq = {
  question: string;
  answer: string;
};

export type CompareRow = {
  dimension: string;
  finfold: string;
  competitor: string;
};

export type ComparePageConfig = {
  slug: string;
  updatedAt: string;
  /** Competitor display name; used in headings, verdicts and the table header. */
  competitorName: string;
  /** Short neutral descriptor of the other option (no periods, no digs). */
  competitorLabel: string;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  /** Direct-answer opening paragraph rendered right under the H1 so AI
   * search engines can quote the page's core answer (GEO). ~40-60 words. */
  directAnswer: string;
  verdictFinfoldTitle: string;
  verdictFinfold: string;
  verdictCompetitorTitle: string;
  verdictCompetitor: string;
  rows: CompareRow[];
  faqs: CompareFaq[];
};

export const comparePages: ComparePageConfig[] = [
  {
    slug: "chatgpt",
    updatedAt: "2026-09-10",
    competitorName: "ChatGPT",
    competitorLabel: "General-purpose AI assistant",
    title: "Finfold vs ChatGPT for Marketing",
    description:
      "ChatGPT writes strong individual drafts. Finfold runs the marketing workflow around them: 14 platform-native channels, brand memory, human approval, and outcome learning.",
    eyebrow: "Comparison",
    h1: "Finfold vs ChatGPT for marketing",
    directAnswer:
      "ChatGPT is a general-purpose AI assistant that writes strong individual drafts. Finfold is a reviewable AI marketing agent for small teams: it audits your website, prepares bounded growth missions, drafts platform-native posts for 14 China and global channels, and learns from real outcomes — with humans approving what ships.",
    verdictFinfoldTitle: "Choose Finfold if you",
    verdictFinfold:
      "run weekly, multi-channel marketing and are tired of rebuilding context every session — you want missions, platform rules, approval and outcome feedback in one loop.",
    verdictCompetitorTitle: "Choose ChatGPT if you",
    verdictCompetitor:
      "need a general assistant for exploration and one-off drafts outside a repeatable marketing workflow.",
    rows: [
      {
        dimension: "Primary job",
        finfold: "End-to-end marketing workflow: audit, missions, drafts, outcomes",
        competitor: "General conversation and on-demand drafting"
      },
      {
        dimension: "Platform coverage",
        finfold: "14 channels with platform-native rules, incl. Xiaohongshu, WeChat, Zhihu",
        competitor: "No built-in platform playbooks; you supply format rules each session"
      },
      {
        dimension: "Multi-channel repurposing",
        finfold: "One brief becomes platform-native drafts for every target channel",
        competitor: "One conversation at a time; re-prompt for each platform"
      },
      {
        dimension: "Brand memory",
        finfold: "Persistent Brand Memory reused across missions",
        competitor: "Custom GPTs and chat history; setup repeats per workflow"
      },
      {
        dimension: "Human approval",
        finfold: "Facts and promises are verified before anything ships",
        competitor: "You decide what to copy where"
      },
      {
        dimension: "Outcome learning",
        finfold: "Publish state and real outcomes feed the next mission",
        competitor: "No publish-state or performance feedback loop"
      },
      {
        dimension: "Agent access",
        finfold: "AI agents can call Finfold directly through MCP",
        competitor: "Broad plugin and GPT ecosystem for general tasks"
      }
    ],
    faqs: [
      {
        question: "Can ChatGPT replace an AI marketing agent?",
        answer:
          "For a single draft, often yes — modern chat models write well. The gap is the repeatable workflow: platform-specific formats, saved brand context, approval state, and learning from what actually performed. ChatGPT leaves those to you; Finfold runs them as one reviewable loop."
      },
      {
        question: "Can I use both together?",
        answer:
          "Yes, and many teams do. Use ChatGPT to explore ideas or polish a tricky paragraph, then let Finfold turn the approved brief into platform-native drafts and carry outcomes into the next cycle. If you build your own agents, they can also call Finfold through MCP."
      },
      {
        question: "Which costs less for a small team?",
        answer:
          "ChatGPT Plus is a per-seat subscription (around $20/month in 2026). Finfold has a free plan for testing the full loop, then paid tiers that scale from Starter upward — pricing lives on the site, and every paid plan carries a 3-day no-questions-asked refund."
      }
    ]
  },
  {
    slug: "jasper",
    updatedAt: "2026-09-10",
    competitorName: "Jasper",
    competitorLabel: "Enterprise AI writing platform",
    title: "Finfold vs Jasper for Small-Team Marketing",
    description:
      "Jasper centers on Brand Voice copy for English-first channels. Finfold runs reviewable growth missions across 14 China and global channels, including Xiaohongshu and WeChat.",
    eyebrow: "Comparison",
    h1: "Finfold vs Jasper for small-team marketing",
    directAnswer:
      "Jasper is an enterprise AI writing platform centered on Brand Voice and campaign copy for English-first channels. Finfold is a reviewable AI marketing agent for founders and small teams: bounded growth missions, 14 China and global channels including Xiaohongshu and WeChat, and outcome learning with human approval before publish.",
    verdictFinfoldTitle: "Choose Finfold if you",
    verdictFinfold:
      "are a founder or small team shipping weekly across Chinese and global channels from one brief.",
    verdictCompetitorTitle: "Choose Jasper if you",
    verdictCompetitor:
      "are a larger marketing org with established brand-voice governance and English-first campaign workflows.",
    rows: [
      {
        dimension: "Built for",
        finfold: "Founders and small teams",
        competitor: "Enterprise and mid-market marketing teams"
      },
      {
        dimension: "Core loop",
        finfold: "Audit → bounded missions → platform-native drafts → outcomes",
        competitor: "Brand-Voice copy generation for campaigns"
      },
      {
        dimension: "China channels",
        finfold: "Xiaohongshu, WeChat Official Account, Zhihu, WeChat Moments",
        competitor: "Not a coverage focus"
      },
      {
        dimension: "Global channels",
        finfold: "X, LinkedIn, Reddit, Product Hunt, Instagram, Threads and more",
        competitor: "Strong for English blog, ad and email copy"
      },
      {
        dimension: "Approval workflow",
        finfold: "Mission-level review: humans verify facts and approve promises",
        competitor: "Brand Voice enforced at generation time"
      },
      {
        dimension: "Outcome feedback",
        finfold: "Publish state and real outcomes carry into the next cycle",
        competitor: "Focused on content production"
      },
      {
        dimension: "Free tier",
        finfold: "Free plan to test the workflow end to end",
        competitor: "Trial-based entry"
      }
    ],
    faqs: [
      {
        question: "Is Finfold a Jasper alternative for small teams?",
        answer:
          "For small teams running their own multi-channel growth, yes. Finfold trades enterprise campaign governance for a tighter loop: bounded missions, 14 platform-native channels, human approval, and outcome learning — sized and priced for founders rather than marketing departments."
      },
      {
        question: "Does Jasper support Xiaohongshu or WeChat?",
        answer:
          "Not as a coverage focus. Jasper's strengths sit in English-first campaign content. Finfold drafts natively for Xiaohongshu, WeChat Official Account, Zhihu and WeChat Moments alongside global channels, which is the usual reason cross-border teams add it."
      },
      {
        question: "Can I move my brand voice into Finfold?",
        answer:
          "Yes. Finfold stores your voice, facts and promises as Brand Memory and reuses it across every mission, so approved language stays consistent without re-briefing each time."
      }
    ]
  },
  {
    slug: "multi-channel",
    updatedAt: "2026-09-10",
    competitorName: "Single-market tools",
    competitorLabel: "AI tools that cover one market only",
    title: "One Marketing Agent for China and Global Channels",
    description:
      "Most AI marketing tools cover either global channels or Chinese platforms. Finfold drafts natively for 14 channels across both markets from one brief.",
    eyebrow: "Comparison",
    h1: "AI marketing agent for China and global channels",
    directAnswer:
      "Most AI marketing tools cover either global channels or Chinese platforms — almost none cover both. Finfold is a reviewable AI marketing agent that drafts platform-native content for 14 channels, including Xiaohongshu, WeChat and Zhihu alongside X, LinkedIn, Reddit and Product Hunt, so one brief becomes native posts in every market you sell in.",
    verdictFinfoldTitle: "Choose Finfold if you",
    verdictFinfold:
      "sell in both China and global markets and want one brief, one approval loop and one outcome feed across all of it.",
    verdictCompetitorTitle: "Choose a single-market tool if you",
    verdictCompetitor:
      "work in one market only and prefer a specialist for that market's channels.",
    rows: [
      {
        dimension: "China channels",
        finfold: "Xiaohongshu, WeChat Official Account, Zhihu, WeChat Moments",
        competitor: "Global-market tools typically omit them"
      },
      {
        dimension: "Global channels",
        finfold: "X, LinkedIn, Instagram, Facebook, Reddit, Product Hunt, Threads, Hacker News, Indie Hackers, Medium/Substack",
        competitor: "China-only tools stop at domestic platforms"
      },
      {
        dimension: "One brief, many platforms",
        finfold: "A single brief becomes platform-native drafts for every target channel",
        competitor: "A second tool — and a second workflow — per market"
      },
      {
        dimension: "Native format rules",
        finfold: "Platform-specific tone, length and structure per channel",
        competitor: "Format rules live in your head or your prompts"
      },
      {
        dimension: "Languages",
        finfold: "Chinese and English working surfaces and drafts",
        competitor: "Usually one primary language"
      },
      {
        dimension: "Approval workflow",
        finfold: "Humans verify facts and approve what ships, across markets",
        competitor: "Approval rebuilt per tool"
      },
      {
        dimension: "Outcome feedback",
        finfold: "Real outcomes from every market feed the next mission",
        competitor: "Performance data split across tools"
      }
    ],
    faqs: [
      {
        question: "Which Chinese platforms does Finfold cover?",
        answer:
          "WeChat Official Account, Xiaohongshu (RedNote), Zhihu and WeChat Moments, with platform-native tone and format rules for each."
      },
      {
        question: "Does one brief really become posts on every channel?",
        answer:
          "Yes — that is the core of the workflow. Finfold turns an approved brief into drafts shaped for each platform's native format and audience, then tracks publish state and outcomes per channel."
      },
      {
        question: "Does Finfold write in both Chinese and English?",
        answer:
          "Yes. Working surfaces and drafts run in both languages, which is what cross-border teams need: the same mission can ship a Xiaohongshu post in Chinese and a LinkedIn post in English."
      }
    ]
  }
];

export function getComparePage(slug: string): ComparePageConfig | undefined {
  return comparePages.find((page) => page.slug === slug);
}
