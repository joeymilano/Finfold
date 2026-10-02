import type { IndustryPack } from "@/lib/industry-rules/types";

/**
 * Distilled from 《广告法》极限词条款 (Art.9), 小红书社区公约 (软广/种草报备),
 * and common livestream-commerce compliance norms. Not legal advice.
 */
export const advertisingPack: IndustryPack = {
  id: "advertising",
  label: "广告 / 电商营销",
  labelEn: "Advertising & E-commerce",
  description: "覆盖广告法极限词条款、小红书种草报备规范与直播话术红线，防止绝对化用语和虚假宣传风险。",
  descriptionEn: "Covers Advertising Law's superlative-word restrictions, Xiaohongshu sponsored-content disclosure rules, and livestream-commerce compliance lines.",
  version: 1,
  sources: [
    "《中华人民共和国广告法》第九条（禁止使用的用语）",
    "小红书社区公约 · 商业内容与软广规范",
    "直播电商行业合规话术通行规范"
  ],
  rules: [
    {
      title: "禁止绝对化极限用语",
      titleEn: "No Absolute Superlative Claims",
      detail: "禁止使用“国家级”“最高级”“最佳”“第一”“唯一”“史上最强”等绝对化、排他性用语，除非有权威机构认证且可提供证明。",
      detailEn: "Avoid absolute/superlative claims like 'national-grade', 'best', '#1', 'the only', 'strongest ever' unless certified by an authority with provable evidence.",
      type: "avoid"
    },
    {
      title: "商业内容需明确标识",
      titleEn: "Sponsored Content Must Be Disclosed",
      detail: "涉及品牌合作、付费推广或收取报酬的内容，必须在正文或标签中明确标注“广告”“合作”或“赞助”，不得伪装成自然分享。",
      detailEn: "Any brand partnership, paid promotion, or compensated content must be clearly labeled as 'ad', 'partnership', or 'sponsored' — never disguised as organic sharing.",
      type: "required"
    },
    {
      title: "禁止虚假原价与价格误导",
      titleEn: "No Fake Original Prices or Price Deception",
      detail: "禁止虚构“原价”“专柜价”进行价格对比，禁止“全网最低价”“今天最后一天”等无法验证的紧迫性/比价话术。",
      detailEn: "Never fabricate a 'was' price for comparison; avoid unverifiable urgency/price claims like 'lowest price on the internet' or 'last day today'.",
      type: "avoid"
    },
    {
      title: "禁止虚构评价与销量",
      titleEn: "No Fabricated Reviews or Sales Figures",
      detail: "禁止编造用户评价、点赞收藏数据、销量或“已售罄补货”等虚假营销信号。",
      detailEn: "Never fabricate reviews, engagement metrics, sales figures, or fake 'sold out, restocking' urgency signals.",
      type: "avoid"
    },
    {
      title: "直播话术红线",
      titleEn: "Livestream Script Red Lines",
      detail: "直播/短视频口播禁止使用“最后一次这个价”“错过等一年”“不买后悔”等施压性话术，赠品与折扣力度须与实际一致。",
      detailEn: "Livestream/short-video scripts must avoid pressure tactics like 'last chance at this price' or 'you'll regret not buying'; gifts and discounts must match reality.",
      type: "avoid"
    },
    {
      title: "禁用医疗/疗效类跨界宣称",
      titleEn: "No Cross-Category Medical/Efficacy Claims",
      detail: "非医疗、非保健品类商品（如美妆、日用品）禁止使用“消炎”“治疗”“药用级”等医疗功效性用语。",
      detailEn: "Non-medical products (cosmetics, household goods) must not use medical-efficacy language like 'anti-inflammatory', 'treats', or 'pharmaceutical-grade'.",
      type: "avoid"
    },
    {
      title: "语气：真实种草而非硬广",
      titleEn: "Tone: Authentic Sharing, Not Hard-Sell",
      detail: "小红书等社区平台内容应以真实体验分享为主，避免明显的推销腔和过度堆砌表情符号/感叹号。",
      detailEn: "Community-platform content should read as authentic first-person sharing, not an obvious sales pitch — avoid excessive emoji/exclamation stacking.",
      type: "tone"
    }
  ],
  bannedPatterns: [
    "国家级", "最高级", "史上最强", "全网最低价", "最后一天", "已售罄.*补货", "不买后悔",
    "药用级", "消炎(?!药)", "全网第一", "销量遥遥领先"
  ]
};
