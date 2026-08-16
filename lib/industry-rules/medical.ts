import type { IndustryPack } from "@/lib/industry-rules/types";

/**
 * Distilled from China's 《广告法》第十六条 (medical/pharma/device ad rules),
 * 《医疗广告管理办法》, and 小红书社区公约 medical-content restrictions.
 * Not legal advice — a starting compliance baseline, not a substitute for
 * counsel review before publishing regulated medical content.
 */
export const medicalPack: IndustryPack = {
  id: "medical",
  label: "医疗健康",
  labelEn: "Medical & Health",
  description: "覆盖医疗广告法第十六条、医疗广告管理办法与平台医疗内容规范，防止疗效承诺、绝对化用语等高风险表达。",
  descriptionEn: "Covers Advertising Law Art.16, the Medical Advertising Administration Measures, and platform medical-content policies — blocks efficacy guarantees and absolute claims.",
  version: 1,
  sources: [
    "《中华人民共和国广告法》第十六条",
    "《医疗广告管理办法》",
    "小红书社区公约 · 医疗健康类目规范"
  ],
  rules: [
    {
      title: "禁止疗效与治愈承诺",
      titleEn: "No Efficacy or Cure Guarantees",
      detail: "禁止出现“根治”“治愈率”“无效退款”“药到病除”等疗效承诺或保证性表述，涉及医疗效果的内容必须表述为“个体差异，效果因人而异”。",
      detailEn: "Never claim a cure, guaranteed efficacy, or money-back-if-ineffective. Any effect statement must include an individual-variation disclaimer.",
      type: "avoid"
    },
    {
      title: "禁止绝对化安全断言",
      titleEn: "No Absolute Safety Claims",
      detail: "禁止使用“无副作用”“纯天然无害”“绝对安全”等绝对化安全性用语，涉及药品/器械/诊疗的表述需保留必要的风险提示。",
      detailEn: "Never claim 'zero side effects' or 'completely safe'. Retain necessary risk disclaimers for drugs, devices, or treatments.",
      type: "avoid"
    },
    {
      title: "禁止利用患者/权威人士名义作证",
      titleEn: "No Patient or Authority Testimonials",
      detail: "禁止利用患者、医疗机构、医生或科研单位的名义或形象作推荐、证明，禁止编造康复案例或治愈患者证言。",
      detailEn: "Never use patients, doctors, institutions, or researchers to endorse or testify, and never fabricate recovery stories.",
      type: "avoid"
    },
    {
      title: "科普与广告边界",
      titleEn: "Education vs. Advertising Boundary",
      detail: "以科普形式呈现的内容不得暗含产品/机构推广意图；若内容涉及具体产品、机构或诊疗服务的推荐，必须标注“广告”或“医疗广告”字样。",
      detailEn: "Content framed as public health education must not covertly promote a product or clinic. Any content recommending a specific product/clinic/treatment must be labeled as an advertisement.",
      type: "required"
    },
    {
      title: "禁止贩卖疾病焦虑",
      titleEn: "No Fear-Mongering About Illness",
      detail: "禁止夸大病情严重性、制造健康恐慌以促成消费决策，禁止将常见生理现象描述为需要立即就医的严重疾病。",
      detailEn: "Never exaggerate a condition's severity or manufacture health anxiety to drive purchases; never frame normal physiological variation as a medical emergency.",
      type: "avoid"
    },
    {
      title: "资质与适应症声明",
      titleEn: "Qualification & Indication Disclosure",
      detail: "涉及处方药、医疗器械或诊疗项目的内容，必须提示适应症/适用人群，并注明“请遵医嘱”或“如有不适请及时就医”。",
      detailEn: "Content about prescription drugs, medical devices, or treatments must state indications/target population and include 'follow medical advice' or 'consult a doctor if symptoms persist'.",
      type: "required"
    },
    {
      title: "禁止医疗对比断言",
      titleEn: "No Comparative Medical Superiority Claims",
      detail: "禁止将本产品/机构与其他医疗机构、药品或医生进行优劣对比，禁止使用“最好的医生”“全市最先进设备”等排他性表述。",
      detailEn: "Never compare superiority against other clinics, drugs, or doctors; avoid exclusionary claims like 'best doctor in the city' or 'most advanced equipment'.",
      type: "avoid"
    },
    {
      title: "语气：审慎而非煽动",
      titleEn: "Tone: Measured, Not Sensational",
      detail: "健康内容应保持专业、克制的语气，避免使用感叹号堆砌、猎奇标题或制造紧迫感的话术（如“今天不看后悔一年”）。",
      detailEn: "Keep a professional, measured tone. Avoid exclamation-heavy phrasing, sensational headlines, or urgency-manufacturing hooks.",
      type: "tone"
    }
  ],
  bannedPatterns: [
    "根治", "治愈率", "药到病除", "无效退款", "无副作用", "纯天然无害", "绝对安全",
    "最好的医生", "全网最有效", "秒治", "包治", "特效", "祖传秘方"
  ]
};
