import type { GuardrailRule } from "@/lib/guardrails";

/**
 * Always-on "system" rules — moved out of app/(dashboard)/guardrails/page.tsx
 * `initialRules`, which were display-only (never reached buildGenerationPrompt).
 * These now flow into every generation via the server-side injection in
 * app/api/generate/route.ts, same as opt-in industry packs.
 */
export const baseSystemRules: GuardrailRule[] = [
  {
    title: "禁止夸大宣传词",
    titleEn: "No Exaggerated Claims",
    detail: `禁止使用"全网第一"、"最强"、"颠覆级"等夸大性、绝对化违禁词，确保文案可信且符合广告合规要求。`,
    detailEn: "Prohibited terms include absolute superlatives like '#1 worldwide', 'most powerful', 'game-changing'. Keep copy credible and ad-compliant.",
    type: "avoid"
  },
  {
    title: "CTA 规范",
    titleEn: "CTA Standards",
    detail: `微信端引流引导至微信客服，海外渠道（X/LinkedIn）禁止在正文直接放链接，需提示"链接置于评论区第一条"。`,
    detailEn: "WeChat: route to WeChat customer service. Overseas channels (X/LinkedIn): never put links in post body — remind users 'link in first comment'.",
    type: "required"
  },
  {
    title: "品牌人设调性",
    titleEn: "Brand Voice",
    detail: "第一人称视角叙事，口语化表达，像真实的产品创始人在真诚分享产品思考，严禁冷冰冰的官方通稿体。",
    detailEn: "First-person narrative, conversational tone. Write like a real founder sincerely sharing product thinking. No cold corporate press-release style.",
    type: "tone"
  },
  {
    title: "开源与商业许可",
    titleEn: "Open Source & Commercial Licenses",
    detail: "只允许引用 Lucide 与 Motion 等宽松商用许可资产，对引用的辅助插画和证据库需标明开源出处。",
    detailEn: "Only use permissively-licensed assets like Lucide and Motion. Attribution required for any supplemental illustrations or evidence libraries.",
    type: "legal"
  }
];
