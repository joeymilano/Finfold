import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, CircleDot } from "@/components/ui/icons";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { MarketingLandingTracker } from "@/components/marketing/MarketingLandingTracker";
import { TrackedCtaLink } from "@/components/marketing/TrackedCtaLink";
import { brand } from "@/lib/brand";

const PAGE_PATH = "/en/learn/what-is-an-ai-marketing-agent";
const PAGE_UPDATED = "2026-09-10";

const TITLE = "What Is an AI Marketing Agent — and How to Choose One";
const DESCRIPTION =
  "An AI marketing agent moves a team from evidence to reviewable action: audit, missions, channel-native content, outcome learning. Definition, comparisons, and a buying checklist.";

const DIRECT_ANSWER =
  "An AI marketing agent moves a team from evidence to reviewable marketing action: it inspects a website, prepares bounded growth missions, creates channel-native content for each platform, and carries confirmed outcomes into the next cycle. Consequential actions and publishing stay under human approval.";

type LearnSection = {
  heading: string;
  paragraphs?: string[];
  checklist?: string[];
  closing?: string;
};

const SECTIONS: LearnSection[] = [
  {
    heading: "What an AI marketing agent actually does",
    paragraphs: [
      "The label gets applied to everything from chatbots to schedulers, so the useful definition is structural. An AI marketing agent runs a loop with four parts: it observes evidence (your site, your past posts, your analytics), it plans a bounded action (a growth mission with a stated goal), it produces the work (channel-native drafts, not generic text), and it learns from what actually happened after publishing.",
      "The last two parts are what separate an agent from a chat window. Producing channel-native work means the output already fits the platform — a Xiaohongshu post reads like a Xiaohongshu post, a Reddit post survives a Reddit audience. Learning from outcomes means this week's mission starts from what last week's posts actually did, not from zero context.",
      "A defining constraint of a serious agent is that it is reviewable: humans verify facts, approve promises, and decide what gets published. The agent removes the repetitive middle of marketing — rebuilding context, reformatting, tracking state — not the judgment.",
      "Concretely, one loop looks like this: you ship a product update; the agent notices it, proposes a mission covering the channels you run; it drafts a Xiaohongshu post, a LinkedIn post and a Reddit post from that single brief, each in the platform's native shape; you review for a few minutes and approve; a week later the agent reads what performed and proposes the next mission accordingly. The pattern matters more than the tools inside it — evidence in, bounded action out, outcomes back in."
    ]
  },
  {
    heading: "AI marketing agent vs AI writing tool",
    paragraphs: [
      "An AI writing tool answers the question \"write this for me.\" You bring the brief, the platform knowledge, and the publish decision; it returns text. That is genuinely useful for a landing page paragraph or an email variant — and it is exactly where general assistants such as ChatGPT excel.",
      "An AI marketing agent owns the workflow around the writing: saved brand memory so voice stays consistent without re-briefing, platform-specific format rules so each draft is native rather than adapted, publish state so nothing ships twice, and outcome feedback so the next round starts informed. If you spend your week moving drafts between a chat window, a doc, and five platforms, the workflow — not the prose — is the bottleneck an agent removes."
    ]
  },
  {
    heading: "AI marketing agent vs marketing automation",
    paragraphs: [
      "Classic marketing automation — email drips, post schedulers, workflow rules — executes deterministic logic a human configured. It is reliable, boring in the good way, and blind to content: it will send exactly what you wrote to exactly whom you told it, on schedule, forever.",
      "An AI marketing agent handles the open-ended parts automation cannot: reading a site and proposing what to do, writing the variant for each channel, adjusting tone when the platform culture differs. The two compose well — automation handles routing and schedules, the agent handles creation and planning. Teams that try to use automation alone end up writing everything by hand; teams that try to use an agent alone give up the reliability of configured rules."
    ]
  },
  {
    heading: "What to check when choosing one",
    checklist: [
      "Human approval: can you verify facts and block a publish, per mission, without fighting the tool?",
      "Channel coverage: does it write natively for the platforms you actually sell on — including non-English ones if you sell there?",
      "Brand memory: does voice and product context persist across missions, or do you re-brief every time?",
      "Outcome learning: do real publish results feed the next cycle, or does every week start from zero?",
      "Bounded actions: does it propose missions with clear scope instead of freewheeling campaigns you have to audit after the fact?",
      "Agent access: can your other AI tools call it (for example over MCP), or is it another silo?",
      "Pricing shape: does a free tier let you test the full loop before paying, and does pricing fit a small team rather than a department?"
    ],
    closing:
      "Use the list as red lines, not a scorecard. A tool that fails the approval test will eventually embarrass you publicly; one that fails brand memory quietly costs you an hour every week; one that fails channel coverage silently pushes you back to manual work for half your platforms. Everything else is a preference you can trade off."
  },
  {
    heading: "Where Finfold fits",
    paragraphs: [
      "Finfold is a reviewable AI marketing agent for founders and small teams. It audits your website, prepares bounded growth missions, drafts platform-native content for 14 China and global channels — including Xiaohongshu, WeChat and Zhihu alongside X, LinkedIn, Reddit and Product Hunt — and carries real outcomes into the next cycle.",
      "That last combination is the unusual part: almost no tool covers both Chinese and global channels natively, which is why cross-border teams adopt Finfold first. A free plan covers testing the whole loop, paid tiers scale from Starter upward, and AI agents can call Finfold directly through MCP. Humans verify facts and approve what ships — the agent compounds the work, not the risk."
    ]
  }
];

const FAQS = [
  {
    q: "What is an AI marketing agent?",
    a: "An AI marketing agent helps a team move from evidence to a reviewable marketing action: it can inspect a website, prepare a growth mission, create channel-native deliverables, and carry confirmed outcomes into the next cycle. Finfold keeps consequential actions and publishing under human approval."
  },
  {
    q: "Can Claude or ChatGPT replace an AI marketing agent?",
    a: "Claude and ChatGPT can generate strong individual drafts. An agent handles the repeatable workflow around them: saved brand memory, platform rules, copy and visual deliverables, publish state, performance feedback, and next-cycle learning."
  },
  {
    q: "How many platforms should an AI marketing agent cover?",
    a: "The ones you actually publish on. Finfold covers 14 across China and global channels — WeChat Official Account, Xiaohongshu, Zhihu, WeChat Moments, X, LinkedIn, Instagram, Facebook, Reddit, Product Hunt, Threads, Hacker News, Indie Hackers, and Medium/Substack."
  },
  {
    q: "Does an AI marketing agent publish without approval?",
    a: "A reviewable one does not. It prepares editable missions, copy, and visuals; a human verifies the facts, approves consequential actions, and decides what is published."
  }
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_PATH,
    locale: "en_US",
    type: "article",
    images: [{ url: brand.socialImage.url, alt: brand.socialImage.alt }]
  }
};

function buildSchema() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: TITLE,
        description: DESCRIPTION,
        url: `${brand.siteUrl}${PAGE_PATH}`,
        inLanguage: "en",
        dateModified: PAGE_UPDATED,
        about: {
          "@type": "SoftwareApplication",
          name: brand.name,
          url: brand.siteUrl,
          applicationCategory: "BusinessApplication"
        }
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${brand.siteUrl}/en` },
          { "@type": "ListItem", position: 2, name: "Learn", item: `${brand.siteUrl}/en` },
          { "@type": "ListItem", position: 3, name: TITLE, item: `${brand.siteUrl}${PAGE_PATH}` }
        ]
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: { "@type": "Answer", text: faq.a }
        }))
      }
    ]
  };
}

export default function WhatIsAnAiMarketingAgentPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildSchema()) }}
      />
      <main className="min-h-screen bg-bg">
        <MarketingLandingTracker contentType="other" contentSlug="what-is-an-ai-marketing-agent" locale="en" />
        <PublicSiteHeader locale="en" />

        <article className="mx-auto max-w-3xl px-5 pb-16 pt-10 lg:pt-16">
          <p className="eyebrow">Learn</p>
          <h1 className="mt-4 text-balance text-4xl font-bold leading-[1.12] text-fg sm:text-5xl">
            What is an AI marketing agent?
          </h1>
          <p className="mt-6 text-base leading-8 text-fg-muted">{DIRECT_ANSWER}</p>
          <p className="mt-4 text-sm text-fg-subtle">Updated {PAGE_UPDATED}</p>

          {SECTIONS.map((section) => (
            <section key={section.heading} className="mt-14">
              <h2 className="text-2xl font-bold leading-tight text-fg sm:text-3xl">
                {section.heading}
              </h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-5 text-base leading-8 text-fg-muted">
                  {paragraph}
                </p>
              ))}
              {section.checklist ? (
                <ul className="mt-6 grid gap-3">
                  {section.checklist.map((item) => (
                    <li key={item} className="panel flex items-start gap-3 p-4 text-sm leading-6 text-fg-muted">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-brand" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {section.closing ? (
                <p className="mt-6 text-base leading-8 text-fg-muted">{section.closing}</p>
              ) : null}
            </section>
          ))}

          <section className="mt-14">
            <h2 className="text-2xl font-bold leading-tight text-fg sm:text-3xl">
              Frequently asked questions
            </h2>
            <div className="mt-6 grid gap-4">
              {FAQS.map((faq) => (
                <article key={faq.q} className="panel p-6">
                  <h3 className="text-base font-semibold text-fg">{faq.q}</h3>
                  <p className="mt-3 text-sm leading-7 text-fg-muted">{faq.a}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-14 border-t border-hairline pt-10">
            <h2 className="text-xl font-semibold text-fg">See it applied</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Link href="/en/compare/chatgpt" className="panel panel-hover block p-5">
                <span className="text-xs font-semibold uppercase tracking-wide text-brand">
                  Comparison
                </span>
                <span className="mt-2 block text-lg font-semibold text-fg">
                  Finfold vs ChatGPT for marketing
                </span>
              </Link>
              <Link href="/en/use-cases/ai-marketing-for-small-business" className="panel panel-hover block p-5">
                <span className="text-xs font-semibold uppercase tracking-wide text-brand">
                  Use case
                </span>
                <span className="mt-2 block text-lg font-semibold text-fg">
                  AI marketing for small business
                </span>
              </Link>
            </div>
          </section>

          <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-hairline pt-10">
            <TrackedCtaLink
              href="/signup"
              sourceType="landing"
              sourceSlug="learn-what-is-an-ai-marketing-agent"
              destination="signup"
              locale="en"
              className="btn-primary focus-ring inline-flex items-center gap-2 px-5 py-3 text-sm"
            >
              Try Finfold free
              <ArrowRight className="h-4 w-4" />
            </TrackedCtaLink>
            <span className="flex items-center gap-2 text-sm text-fg-subtle">
              <CircleDot className="h-4 w-4" />
              Humans approve what ships
            </span>
          </div>
        </article>
      </main>
      <SiteFooter locale="en" />
    </>
  );
}
