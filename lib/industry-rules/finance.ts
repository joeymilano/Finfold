import type { IndustryPack } from "@/lib/industry-rules/types";

/**
 * Distilled from 《关于进一步规范金融营销宣传行为的通知》(人民银行/银保监会/证监会),
 * 《证券法》适当性管理精神, and common risk-disclosure norms. Not legal advice.
 */
export const financePack: IndustryPack = {
  id: "finance",
  label: "金融理财",
  labelEn: "Finance & Wealth Management",
  description: "覆盖金融营销宣传行为规范与投资者适当性精神，防止保本保收益承诺与误导性收益率展示。",
  descriptionEn: "Covers financial marketing regulations and investor-suitability principles — blocks guaranteed-return promises and misleading yield displays.",
  version: 1,
  sources: [
    "《关于进一步规范金融营销宣传行为的通知》",
    "《证券法》投资者适当性管理精神",
    "银行保险机构金融营销宣传合规通行规范"
  ],
  rules: [
    {
      title: "禁止保本保收益承诺",
      titleEn: "No Guaranteed Principal or Return Promises",
      detail: "禁止使用“保本”“保收益”“稳赚不赔”“无风险”等表述，任何理财/投资内容必须明确“投资有风险”的提示。",
      detailEn: "Never claim 'guaranteed principal', 'guaranteed returns', 'risk-free', or 'can't lose'. Any investment content must state 'investing involves risk'.",
      type: "avoid"
    },
    {
      title: "收益率展示规范",
      titleEn: "Yield Disclosure Standards",
      detail: "展示历史收益率时须注明为“历史业绩，不代表未来表现”，禁止用最高档收益率误导性地代表平均或预期收益。",
      detailEn: "Historical yield figures must be labeled 'past performance, not indicative of future results'; never use the highest-tier rate to imply average or expected returns.",
      type: "required"
    },
    {
      title: "禁止诱导式风险表述",
      titleEn: "No Risk-Minimizing Language",
      detail: "禁止使用“闭眼买”“躺赚”“抄底必赚”等淡化投资风险、鼓励非理性决策的表述。",
      detailEn: "Avoid phrases like 'buy blind', 'lie back and profit', or 'buy the dip, guaranteed' that trivialize investment risk or encourage impulsive decisions.",
      type: "avoid"
    },
    {
      title: "风险提示语必须包含",
      titleEn: "Risk Disclosure Must Be Included",
      detail: "涉及具体理财产品、基金、保险或投资建议的内容，必须附带“市场有风险，投资需谨慎”或同等力度的风险提示。",
      detailEn: "Any content about a specific financial product, fund, insurance, or investment advice must include 'markets carry risk, invest cautiously' or an equivalent disclaimer.",
      type: "required"
    },
    {
      title: "禁止无资质荐股/荐基",
      titleEn: "No Unlicensed Stock/Fund Recommendations",
      detail: "禁止以非持牌机构或个人身份直接推荐具体股票代码、基金产品并暗示确定性收益，避免构成非法荐股。",
      detailEn: "Never make specific stock/fund recommendations implying certain returns without a licensed advisory capacity — this can constitute illegal investment advice.",
      type: "legal"
    },
    {
      title: "禁止制造财富焦虑营销",
      titleEn: "No Wealth-Anxiety Marketing",
      detail: "禁止使用“再不理财你就穷一辈子”等制造焦虑、催促非理性决策的营销话术。",
      detailEn: "Avoid anxiety-inducing hooks like 'if you don't invest now you'll be poor forever' that pressure impulsive financial decisions.",
      type: "avoid"
    },
    {
      title: "语气：理性专业",
      titleEn: "Tone: Rational and Professional",
      detail: "金融理财内容应保持理性、数据驱动的专业语气，避免情绪化标题和过度承诺式的营销腔。",
      detailEn: "Financial content should read as rational, data-driven, and professional — avoid emotional headlines or over-promising marketing tone.",
      type: "tone"
    }
  ],
  bannedPatterns: [
    "保本", "保收益", "稳赚不赔", "无风险", "闭眼买", "躺赚", "抄底必赚",
    "再不理财你就穷一辈子", "100%收益", "年化.*保证"
  ]
};
