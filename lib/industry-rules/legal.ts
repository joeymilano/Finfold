import type { IndustryPack } from "@/lib/industry-rules/types";

/**
 * Distilled from 《律师执业管理办法》, 《律师和律师事务所业务推广行为规范》 and
 * common bar-association guidance on lawyer marketing. Not legal advice — a
 * starting compliance baseline, not a substitute for counsel/bar review.
 */
export const legalPack: IndustryPack = {
  id: "legal",
  label: "法律服务",
  labelEn: "Legal Services",
  description: "覆盖律师执业管理办法与律师业务推广行为规范，防止胜诉承诺、同行贬低等违反执业纪律的表达。",
  descriptionEn: "Covers lawyer practice regulations and business-promotion conduct rules — blocks outcome guarantees and disparagement of peers.",
  version: 1,
  sources: [
    "《律师执业管理办法》",
    "《律师和律师事务所业务推广行为规范》",
    "地方律师协会执业纪律规定（通用条款）"
  ],
  rules: [
    {
      title: "禁止胜诉率与结果承诺",
      titleEn: "No Win-Rate or Outcome Guarantees",
      detail: "禁止承诺或暗示案件必胜、赔偿金额确定、诉讼结果可预知，禁止使用“包赢”“胜诉率100%”等表述。",
      detailEn: "Never guarantee or imply a case will be won, promise a specific award amount, or claim outcomes are predictable. No 'guaranteed win' or '100% win rate' language.",
      type: "avoid"
    },
    {
      title: "禁止贬低同行",
      titleEn: "No Disparaging Other Lawyers/Firms",
      detail: "禁止贬低、诽谤其他律师或律师事务所，禁止进行直接的同行业务对比或排名式表述。",
      detailEn: "Never disparage or defame other lawyers or firms; avoid direct competitor comparisons or ranking claims.",
      type: "avoid"
    },
    {
      title: "案例需脱敏处理",
      titleEn: "Case Examples Must Be Anonymized",
      detail: "引用办案案例时必须隐去当事人真实姓名、身份信息及可识别的具体案情细节，未经授权不得披露委托人信息。",
      detailEn: "Case examples must remove real names, identifying details, and case specifics that could identify the client; never disclose client information without authorization.",
      type: "legal"
    },
    {
      title: "专业领域表述规范",
      titleEn: "Practice Area Claims Must Be Accurate",
      detail: "禁止使用“全国顶级”“唯一”“最权威”等排他性或绝对化头衔，专业领域描述须与实际执业范围和执业年限相符。",
      detailEn: "Avoid exclusive/absolute titles like 'nationwide top' or 'the only'. Practice-area claims must match actual scope and years of experience.",
      type: "avoid"
    },
    {
      title: "免责声明与咨询边界",
      titleEn: "Disclaimer & Consultation Boundary",
      detail: "涉及具体法律问题解答的内容，应注明“个案情况不同，具体建议请咨询专业律师”，不得替代正式法律意见。",
      detailEn: "Content answering specific legal questions must note 'individual cases vary — consult a lawyer for advice' and must not substitute for formal legal counsel.",
      type: "required"
    },
    {
      title: "禁止制造诉讼焦虑营销",
      titleEn: "No Fear-Based Litigation Marketing",
      detail: "禁止夸大法律风险、制造恐慌情绪以促成咨询或委托，禁止使用“不请律师必输”等威胁性话术。",
      detailEn: "Never exaggerate legal risk or manufacture panic to drive consultations; avoid threats like 'you'll lose without a lawyer'.",
      type: "avoid"
    },
    {
      title: "语气：专业克制",
      titleEn: "Tone: Professional and Measured",
      detail: "以第三方专业视角陈述法律知识，避免煽动性标题、猎奇化案件描述，保持严谨、可信的表达。",
      detailEn: "Present legal knowledge from a professional third-party perspective; avoid sensational headlines or lurid case framing.",
      type: "tone"
    }
  ],
  bannedPatterns: [
    "包赢", "胜诉率100%", "必胜", "全国顶级", "唯一.*律师", "最权威", "不请律师必输", "100%赔偿"
  ]
};
