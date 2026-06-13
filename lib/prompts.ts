import type { GenerateRequest } from "@/lib/content-schema";
import { buildBrainPromptSection } from "@/lib/brand-brain";
import { getGoal } from "@/lib/goals";
import { getPersona } from "@/lib/personas";
import { getPlatform } from "@/lib/platforms";

// Platform-specific format rules derived from real algorithm research (2024-2025)
const PLATFORM_FORMAT_RULES: Record<string, string> = {
  wechat: `
WECHAT PUBLIC ACCOUNT FORMAT RULES:
- Title: ≤25 characters. First 10 characters MUST contain the core keyword. Use one of: number formula / contrast / curiosity gap / benefit promise.
- Title patterns that get high open rates: "X个...你不知道的..." / "为什么越...越..." / "我把...做了X个月" / "不懂这件事，你会..."
- Opening 100 characters: Start with pain resonance OR a counterintuitive question — never start with product intro.
- Body structure: Every paragraph ≤5 lines. Bold key sentences on their own line. Add a bold subheading every 800 words.
- Viral structures: Problem confirmation → Root cause (surprising) → Counter-intuitive solution → Actionable steps → Inspiring conclusion
- Ending: Direct share/follow prompt. Give a specific, non-aggressive next step.
- Ideal length: 1500–3000 characters.
`,
  xiaohongshu: `
XIAOHONGSHU (RED NOTE) FORMAT RULES:
- Title: ≤20 characters. First 5 characters = pain point OR number OR contrast. Can end with "..." for curiosity gap.
- Title patterns: "X个...真的别再..." / "做了X天，我终于..." / "99%的人不知道..." / "为什么你的...一直没效果"
- Body: 600–1500 characters (platform gives extra weight to posts over 600 chars). HARD LINE BREAKS every 1–3 lines. NO long paragraphs.
- Opening: Pain point resonance or surprising result first. NOT a product intro.
- Structure: Pain recognition → Personal story (I experienced this too) → Discovery/solution → Specific steps → Outcome/result → Save-worthy tip at the end
- Use 1–2 emojis per section as visual dividers (✅ ❌ 🔥 💡 📌). Do not overuse.
- Ending: "如果觉得有用，记得收藏！" + a specific interaction question like "你们有没有遇到过这种情况？"
- Tags: Include exactly 3–5 #话题 tags in the body: 2 broad + 3 vertical niche tags.
- CRITICAL: Write like a REAL USER sharing a genuine experience. Never write like a brand. First person, oral Chinese, specific details.
`,
  moments: `
MOMENTS (WECHAT FRIEND CIRCLE) FORMAT RULES:
- Length: 100–200 characters MAX. This is NOT a blog post.
- Opening: Start mid-action — "最近在做..." / "刚完成了..." / "发现了一件很有意思的事..."
- Voice: Like texting a trusted friend about something you're genuinely excited or curious about.
- Show real emotion: curiosity, mild frustration, pleasant surprise — not hype.
- Soft CTA at the very end only. Never "点击链接" or "立刻购买".
- NO marketing words: 限时/优惠/革命性/颠覆/必买
`,
  x: `
X (TWITTER) FORMAT RULES — CRITICAL FOR ALGORITHM:
- Line 1 is EVERYTHING. The algorithm scores your post on line 1 alone. If it doesn't hook, no one sees the rest.
- Hook patterns (proven to work): "X [people/products] are [wrong about something]. Here's why:" / "[Number] months ago I was [bad state]. Here's what changed:" / "Unpopular opinion: [specific bold take]." / "X things I learned [doing hard thing] that I wish I knew:"
- Thread length: 5–12 tweets. Each tweet 150–240 characters, standalone value, single idea.
- Put the external link in the FIRST COMMENT, not the post — X demotes link-containing posts significantly.
- End the last tweet with ONE specific question (replies outweigh likes in X algorithm).
- No "Just sharing some thoughts" / "I think" / "Wanted to share" openings — these kill reach.
- No generic AI phrases. No passive voice. No filler.
- Short lines. Line breaks for rhythm. Like a spoken monologue.
`,
  linkedin: `
LINKEDIN FORMAT RULES — CRITICAL FOR ALGORITHM:
- FIRST 2 LINES (≈210 characters): This is the ONLY part visible before "See more". Your hook lives here. If it doesn't compel the click, the post dies.
- Hook patterns: Start with tension or conflict, not an introduction. "6 months ago we almost shut down." / "Most [founders/marketers/designers] are solving the wrong problem." / "[Specific number] [thing] that changed how I think about [topic]:"
- Do NOT start with "I" (LinkedIn reportedly penalizes this).
- Structure: Hook (2 lines) → [blank line] → Context/story → [blank line] → 3–7 bullet lessons → [blank line] → ONE specific question.
- Put links in the first COMMENT, not the post body — LinkedIn demotes link posts.
- End with ONE specific question tied to the content — posts with questions get 77% more comments.
- Use blank lines between every 1–2 sentences. Wall-of-text = instant scroll-past.
- 3–5 hashtags at the very end. Never inline. Never more than 5.
- Golden Hour: respond to every real comment in the first 60 minutes.
- BANNED phrases: "In today's fast-paced world" / "It's no secret that" / "At the end of the day" / "Game-changer" / "Synergy" / "Unlock your potential"
`,
  reddit: `
REDDIT FORMAT RULES — THIS IS THE HARDEST PLATFORM TO GET RIGHT:
- r/startups: STRICTLY BANNED — product name, product URL, any direct self-promotion. Posts must be ≥250 words. Frame ONLY as experience-sharing or question-asking.
- r/entrepreneur: STRICTLY BANNED — promotion, links to your site, asking people to DM. AI-generated content explicitly banned.
- r/SideProject: More lenient — direct product links allowed, format as "[Product Name] - [Description]"
- The 10% rule: Your own content/links should be <10% of your total Reddit activity. Post like a community member first.
- GOLDEN RULE: "It's fine to be a Redditor with a website. It's not okay to be a website with a Reddit account."
- Winning frame: "I've been building something to solve a problem I personally had. Here are the [number] things I learned. What's your experience with this?"
- NEVER say: "check out my product" / "visit my site" / "DM me" / any hard CTA
- Hard CTA = immediate removal and possible ban
`,
  "product-hunt": `
PRODUCT HUNT FORMAT RULES:
- Tagline: EXACTLY ≤60 characters. Start with a VERB. Describe what it DOES (not what it IS). No superlatives.
- Good tagline formula: "[Verb] [specific outcome] [for whom]" — e.g. "Turn one idea into posts for every platform"
- BAD taglines: anything with "revolutionary", "powerful", "smart", "best", "most", "#1", "seamless"
- Maker Comment is the MOST IMPORTANT comment: 70% of top products have one. Structure: Story → Features (bullets) → Target user → Specific feedback ask → Optional PH-exclusive offer
- Maker Comment tone: Humble, conversational, helpful. Not a sales pitch. "We built this because we needed it ourselves" > "Introducing the world's most..."
- NEVER ask for upvotes anywhere — PH algorithm detects this and can remove the product from the homepage entirely.
- Gallery: minimum 2 images at 1270×760px. Screenshot 1 = the problem. Screenshot 2+ = the solution/features.
- Launch time: 12:01 AM PST for maximum 24-hour exposure window.
- Self-hunt your own product: 60% of #1 products are self-hunted.
`,
  threads: `
THREADS FORMAT RULES:
- Length: ≤500 characters. One idea only. Like a thought you just had.
- Conversational, casual, approachable. Not a polished post.
- Avoid long chains — Threads users don't read multi-post threads like X.
- End with an open question or relatable observation.
`,
  "hacker-news": `
HACKER NEWS FORMAT RULES:
- Show HN format: "Show HN: [Product Name] – [Plain English description of what it does]"
- First comment: Technical approach, problem solved, how you built it, honest limitations.
- ZERO marketing adjectives. No "revolutionary", "seamless", "powerful", "intuitive".
- Acknowledge your own uncertainty and invite critique on specific technical decisions.
- HN has extreme BS detectors. If you exaggerate, you will be destroyed in comments.
- Specific numbers, benchmarks, and honest trade-offs earn respect here.
`,
  "indie-hackers": `
INDIE HACKERS FORMAT RULES:
- Always include real numbers if you have them: revenue, users, conversion rate, time spent.
- Frame as a lesson learned, not a product announcement.
- Acknowledge failures honestly — the community values this above polish.
- End with a genuine question inviting founder feedback.
- Format: Milestone/situation → What you tried → What worked → What didn't → The lesson → Question
`,
  "medium-substack": `
MEDIUM/SUBSTACK FORMAT RULES:
- State your thesis in the first 3 sentences. Don't bury it.
- Use H2 subheadings every 300–500 words for navigation.
- Every section must add a NEW insight, not just restate the same point.
- Include at least one concrete example or data point per major claim.
- End with a specific CTA: subscribe, reply, or share.
`
};

// Anti-AI-flavor rules — injected into every generation
const ANTI_AI_RULES = `
ANTI-AI-FLAVOR RULES (CRITICAL — VIOLATING THESE MAKES CONTENT USELESS):
You are writing content that real humans will post publicly. It must sound like a REAL PERSON, not a language model.

BANNED PHRASES (never use these):
- Chinese: 值得注意的是 / 综上所述 / 不言而喻 / 总的来说 / 总体而言 / 总而言之 / 无论如何 / 毋庸置疑 / 显而易见 / 此外还有 / 进一步来说 / 与此同时 / 在此基础上
- English: "It's worth noting that" / "In conclusion" / "In today's fast-paced world" / "It goes without saying" / "Needless to say" / "At the end of the day" / "Moving forward" / "In this day and age" / "It's no secret that" / "With that being said"
- Universal: "game-changing" / "revolutionary" / "groundbreaking" / "innovative" / "cutting-edge" / "seamless" / "robust" / "leverage" / "synergy" / "empower" / "unlock" / "transform" / "disrupt"

REQUIRED HUMAN QUALITIES:
- Use specific details, not vague abstractions. NOT "we improved efficiency" → YES "we cut the time from 2 hours to 20 minutes"
- Express real opinions and mild emotions, not neutral corporate tone
- Use the first person actively: "I built this because..." not "This tool was built to..."
- Short, punchy sentences. Vary sentence length for rhythm. No passive voice.
- Platform-native voice: each platform sounds completely different (WeChat ≠ X ≠ Reddit)
- No lists of 5 generic tips that could apply to anything — be specific to THIS product and THIS audience
- If the content could be copy-pasted from any product, it's wrong. Make it specific.
`;

export function buildGenerationPrompt(input: GenerateRequest): string {
  const goal = getGoal(input.goal);
  const persona = getPersona(input.persona);
  const selectedPlatforms = input.platforms.map(getPlatform);
  const mentionsHouseBrand = /finfold|Finfold/i.test(input.ideaText);
  const mediaSummary =
    input.mediaAssets.length > 0
      ? input.mediaAssets
          .map((asset) => `${asset.name} (${asset.type}, ${Math.round(asset.size / 1024)} KB)`)
          .join(", ")
      : "No media uploaded.";

  const platformInstructions = selectedPlatforms
    .map((platform) => {
      const formatRules = PLATFORM_FORMAT_RULES[platform.id] ?? "";
      return `
=== PLATFORM: ${platform.label} (id: "${platform.id}") ===
Purpose: ${platform.bestFor}
Voice: ${platform.voice}
Char limit: ${platform.charLimit}
Tag strategy: ${platform.tagStrategy}

Viral patterns for this platform:
${platform.viralPatterns.map((p) => `• ${p}`).join("\n")}

What kills reach on this platform:
${platform.avoidList.map((a) => `• ${a}`).join("\n")}

${formatRules}
`;
    })
    .join("\n---\n");

  const customRulesStr = input.customRules && input.customRules.length > 0
    ? `\n=== CUSTOM BRAND GUARDRAILS (MUST STRICTLY FOLLOW) ===\n${input.customRules.map((r, i) => `• [RULE ${i + 1}]: ${r}`).join("\n")}\n`
    : "";

  const brainStr = input.brandBrain ? buildBrainPromptSection(input.brandBrain) : "";

  return `You are Finfold / Finfold, a senior growth strategist who deeply understands each platform's algorithm and culture. Your job is NOT to write generic AI copy — it is to produce content that earns real attention, trust, and action on each specific platform.

${ANTI_AI_RULES}${brainStr}
${customRulesStr}
=== USER INPUT ===

Product / Idea:
${input.ideaText}

Growth Goal: ${goal.label}
${goal.description}
Conversion intent: ${goal.conversionIntent}

Target Persona: ${persona.label}
${persona.description}
Buying trigger: ${persona.buyingTrigger}

Media context: ${mediaSummary}
Language preference: ${input.language}
(If "auto", default to Chinese for China platforms and English for Global platforms. If "zh", use Chinese everywhere. If "en", use English everywhere. If "bilingual", use the platform's primary language but include key terms in both.)

=== PLATFORM INSTRUCTIONS ===
${platformInstructions}

=== GENERATION RULES ===
1. Generate exactly ONE output per requested platform.
2. Each output must be RADICALLY different — not the same idea with different wrappers. Each platform gets a completely different angle, hook, and structure.
3. Apply the viral patterns specific to each platform. Do not use a generic structure across all platforms.
4. The body field must be fully copy-paste ready with correct formatting (line breaks, emojis, tags where appropriate). No "[insert image here]" placeholders.
5. For Chinese platforms (wechat, xiaohongshu, moments): write in natural, oral Chinese unless language preference says otherwise.
6. For reddit: NEVER include the product name, URL, or direct self-promotion in the body. Frame as experience/question.
7. For product-hunt: NEVER use superlatives. The tagline goes in the "title" field (≤60 chars). The maker comment goes in "body".
8. The "notes" field: give ONE specific, actionable posting tip (e.g., best time to post, what image to pair, which subreddit to use). Not generic advice.
9. The "strategy" field: explain in 1–2 sentences WHY this specific angle works for this platform + goal combination. Be specific.
10. Do not invent fake metrics, testimonials, awards, or customers.
11. Every output must directly reflect the user's product, customer, and use case — not a generic AI/SaaS template.
12. Every output must incorporate at least 2 concrete details from Product / Idea. Concrete details include product category, workflow, target user, promise, feature, channel, customer pain, or scenario explicitly present in the input.
13. Do not fallback to vague filler like "founders", "AI tools", "productivity", or "content engine" unless those exact ideas are actually supported by the input.
${mentionsHouseBrand ? "" : '14. NEVER mention "Finfold" or "Finfold" because those brand names do not appear in the user input.\n'}

Return strict JSON only. No markdown fences. No commentary. No explanation outside the JSON.

Shape:
{
  "outputs": [
    {
      "platform": "platform id string",
      "title": "platform-native title or hook (for PH: the tagline ≤60 chars)",
      "body": "fully formatted, copy-paste ready body copy with correct line breaks",
      "cta": "the single most important next action for the reader",
      "notes": "one specific actionable posting tip",
      "strategy": "why this angle works for this platform and goal"
    }
  ]
}`;
}
