import { brand } from "@/lib/brand";

/**
 * Bilingual legal document content for the compliance pages required before
 * accepting payments: Privacy Policy, Terms of Service and Refund &
 * Cancellation Policy. Content is kept as structured sections (heading + body
 * paragraphs) rather than raw markdown so the pages render with consistent
 * typography and stay server-crawlable without a markdown dependency.
 *
 * These are practical, plain-language documents tailored to Finfold's actual
 * data flows (Supabase auth, Creem checkout, PostHog analytics, LLM content
 * generation). Have counsel review before launch if you operate in a
 * regulated market.
 */

export type LegalSection = {
  heading: { en: string; zh: string };
  paragraphs: Array<{ en: string; zh: string }>;
};

export type LegalDoc = {
  slug: "privacy" | "terms" | "refund";
  title: { en: string; zh: string };
  description: { en: string; zh: string };
  sections: LegalSection[];
};

const effectiveLine = {
  en: `Last updated: ${brand.legal.effectiveDate}`,
  zh: `最后更新：${brand.legal.effectiveDate}`
};

export const privacyPolicy: LegalDoc = {
  slug: "privacy",
  title: { en: "Privacy Policy", zh: "隐私政策" },
  description: {
    en: "How Finfold collects, uses, stores and protects your personal information.",
    zh: "Finfold 如何收集、使用、存储与保护您的个人信息。"
  },
  sections: [
    {
      heading: { en: "Overview", zh: "概述" },
      paragraphs: [
        effectiveLine,
        {
          en: `${brand.legal.entity} ("Finfold", "we", "us") operates ${brand.siteUrl}, an AI content operations workspace. This policy explains what data we collect, why we collect it, and the choices you have. By using Finfold you agree to the practices described here.`,
          zh: `${brand.legal.entity}（下称"Finfold""我们"）运营 ${brand.siteUrl}，一个 AI 内容运营工作台。本政策说明我们收集哪些数据、为何收集，以及您拥有的选择。使用 Finfold 即表示您同意本政策所述做法。`
        }
      ]
    },
    {
      heading: { en: "Information we collect", zh: "我们收集的信息" },
      paragraphs: [
        {
          en: "Account data: your email address and authentication identifiers, provided when you sign up or log in.",
          zh: "账户数据：您在注册或登录时提供的电子邮箱及身份验证标识。"
        },
        {
          en: "Content data: the product updates, URLs, brand notes and other inputs you submit, along with the marketing content we generate for you.",
          zh: "内容数据：您提交的产品更新、网址、品牌资料等输入，以及我们为您生成的营销内容。"
        },
        {
          en: `Billing data: your plan, subscription status and payment records. Card details are collected and processed directly by our payment processor (${brand.legal.paymentProcessor}) — we never see or store full card numbers.`,
          zh: `账单数据：您的套餐、订阅状态及付款记录。银行卡信息由我们的支付处理方（${brand.legal.paymentProcessor}）直接收集与处理——我们不会看到或存储完整卡号。`
        },
        {
          en: "Usage data: product analytics events (pages viewed, features used) collected through PostHog and Google Analytics, plus standard technical logs such as IP address, browser type and device information, used to keep the service secure and improve it.",
          zh: "使用数据：通过 PostHog 与 Google Analytics 收集的产品分析事件（浏览页面、使用功能），以及 IP 地址、浏览器类型与设备信息等标准技术日志，用于保障服务安全并加以改进。"
        }
      ]
    },
    {
      heading: { en: "How we use your information", zh: "我们如何使用您的信息" },
      paragraphs: [
        {
          en: "To provide the service: authenticate you, generate content, save your kits, and enforce usage limits tied to your plan.",
          zh: "提供服务：为您进行身份验证、生成内容、保存内容包，并执行与您套餐相关的用量限制。"
        },
        {
          en: "To process payments and manage subscriptions, including renewals, upgrades, downgrades and refunds.",
          zh: "处理付款并管理订阅，包括续订、升级、降级与退款。"
        },
        {
          en: "To communicate with you about your account, billing, security and important service changes.",
          zh: "就您的账户、账单、安全及重要服务变更与您沟通。"
        },
        {
          en: "To improve reliability, prevent abuse and fraud, and comply with legal obligations.",
          zh: "提升可靠性、防止滥用与欺诈，并遵守法律义务。"
        }
      ]
    },
    {
      heading: { en: "AI processing of your content", zh: "内容的 AI 处理" },
      paragraphs: [
        {
          en: `To generate marketing content, the inputs you submit are sent to third-party large language model providers acting as our processors. The AI models powering Finfold's generation features are provided by ${brand.legal.aiProviders.en}. The specific model used may vary by plan tier and may change over time as we improve quality. We do not sell your content, and we do not use your private inputs to train public models.`,
          zh: `为生成营销内容，您提交的输入会发送给作为我们处理方的第三方大语言模型服务商。为 Finfold 生成功能提供支持的 AI 模型来自 ${brand.legal.aiProviders.zh}。所使用的具体模型可能因套餐层级而异，也可能随着我们提升质量而变化。我们不会出售您的内容，也不会使用您的私有输入训练公开模型。`
        }
      ]
    },
    {
      heading: { en: "Sharing and third parties", zh: "共享与第三方" },
      paragraphs: [
        {
          en: `We share data only with service providers that help us run Finfold, including our hosting and database provider, our payment processor (${brand.legal.paymentProcessor}), analytics providers PostHog and Google Analytics, and the AI model providers described above. Each processes data on our behalf under contractual safeguards. We may also disclose information if required by law.`,
          zh: `我们仅与协助我们运营 Finfold 的服务商共享数据，包括托管与数据库服务商、支付处理方（${brand.legal.paymentProcessor}）、分析服务商 PostHog 与 Google Analytics，以及上述 AI 模型服务商。各方均在合同保障下代表我们处理数据。若法律要求，我们也可能披露信息。`
        },
        {
          en: "We do not sell your personal information.",
          zh: "我们不会出售您的个人信息。"
        }
      ]
    },
    {
      heading: { en: "Data retention", zh: "数据保留" },
      paragraphs: [
        {
          en: "We retain your account and content data for as long as your account is active. When you delete your account, we delete or anonymize your personal data within a reasonable period, except where retention is required for legal, tax or fraud-prevention purposes.",
          zh: "在您账户处于活跃状态期间，我们会保留您的账户与内容数据。您删除账户后，我们会在合理期限内删除或匿名化您的个人数据，法律、税务或防欺诈目的要求保留的除外。"
        }
      ]
    },
    {
      heading: { en: "Your rights", zh: "您的权利" },
      paragraphs: [
        {
          en: `Depending on your location, you may have the right to access, correct, export or delete your personal data, and to object to or restrict certain processing. To exercise these rights, contact us at ${brand.legal.privacyEmail}.`,
          zh: `根据您所在地区，您可能有权访问、更正、导出或删除您的个人数据，并可反对或限制某些处理。行使上述权利，请联系 ${brand.legal.privacyEmail}。`
        }
      ]
    },
    {
      heading: { en: "Security", zh: "安全" },
      paragraphs: [
        {
          en: "We use industry-standard measures including encryption in transit, access controls and row-level security to protect your data. No method of transmission or storage is 100% secure, but we work to protect your information and to promptly address any incident.",
          zh: "我们采用行业标准措施，包括传输加密、访问控制与行级安全，以保护您的数据。任何传输或存储方式都无法做到 100% 安全，但我们会努力保护您的信息并及时处理任何事件。"
        }
      ]
    },
    {
      heading: { en: "Children", zh: "未成年人" },
      paragraphs: [
        {
          en: "Finfold is not directed to children under 16, and we do not knowingly collect their personal information.",
          zh: "Finfold 不面向 16 岁以下未成年人，我们不会有意收集其个人信息。"
        }
      ]
    },
    {
      heading: { en: "Changes to this policy", zh: "本政策的变更" },
      paragraphs: [
        {
          en: "We may update this policy from time to time. Material changes will be communicated through the service or by email, and the updated date will appear at the top of this page.",
          zh: "我们可能不时更新本政策。重大变更将通过服务内或邮件告知，页面顶部会显示更新日期。"
        }
      ]
    },
    {
      heading: { en: "Contact", zh: "联系我们" },
      paragraphs: [
        {
          en: `Questions about this policy? Email ${brand.legal.privacyEmail}.`,
          zh: `如对本政策有疑问，请发送邮件至 ${brand.legal.privacyEmail}。`
        }
      ]
    }
  ]
};

export const termsOfService: LegalDoc = {
  slug: "terms",
  title: { en: "Terms of Service", zh: "服务条款" },
  description: {
    en: "The terms that govern your use of Finfold.",
    zh: "规范您使用 Finfold 的条款。"
  },
  sections: [
    {
      heading: { en: "Agreement", zh: "协议" },
      paragraphs: [
        effectiveLine,
        {
          en: `These Terms of Service ("Terms") are a legal agreement between you and ${brand.legal.entity} ("Finfold") governing your access to and use of ${brand.siteUrl} and related services. By creating an account or using the service, you agree to these Terms.`,
          zh: `本服务条款（"条款"）是您与 ${brand.legal.entity}（"Finfold"）之间的法律协议，规范您对 ${brand.siteUrl} 及相关服务的访问与使用。创建账户或使用服务即表示您同意本条款。`
        }
      ]
    },
    {
      heading: { en: "The service", zh: "服务内容" },
      paragraphs: [
        {
          en: "Finfold is an AI-powered content operations workspace that generates platform-native marketing content from the inputs you provide. Features available to you depend on your subscription plan.",
          zh: "Finfold 是一个 AI 驱动的内容运营工作台，可根据您提供的输入生成平台原生营销内容。您可使用的功能取决于您的订阅套餐。"
        }
      ]
    },
    {
      heading: { en: "Accounts", zh: "账户" },
      paragraphs: [
        {
          en: "You must provide accurate information, keep your credentials secure, and are responsible for all activity under your account. You must be at least 16 years old (or the age of majority in your jurisdiction) to use Finfold.",
          zh: "您须提供准确信息、妥善保管登录凭据，并对账户下的所有活动负责。您须年满 16 周岁（或所在司法辖区的成年年龄）方可使用 Finfold。"
        }
      ]
    },
    {
      heading: { en: "Plans, billing and renewal", zh: "套餐、计费与续订" },
      paragraphs: [
        {
          en: `Paid plans are billed in advance on a recurring basis (monthly unless stated otherwise) through our payment processor, ${brand.legal.paymentProcessor}. Subscriptions renew automatically until cancelled. Each plan grants a monthly allowance of AI Credits that resets every billing cycle; different AI actions consume different numbers of Credits based on generation breadth, research, visuals, and model cost. Unused plan Credits expire at the end of the cycle and do not roll over. Separately purchased Credits do not expire. Promotional and referral Credits may have a stated expiry, have no cash value, and cannot be transferred. Referral rewards are limited to eligible new accounts and may be withheld or reversed in cases of abuse.`,
          zh: `付费套餐通过我们的支付处理方 ${brand.legal.paymentProcessor} 按周期预先计费（除另有说明外按月计费）。订阅会自动续订，直至您取消。每个套餐每月发放创作点数，并在每个计费周期重置；不同 AI 操作会根据生成范围、联网研究、视觉生成及模型成本消耗不同数量的点数。未使用的套餐点数在周期结束后过期且不结转。单独购买的创作点数不设有效期。促销及邀请点数可设定明确有效期，不具现金价值且不可转让；邀请奖励仅适用于符合资格的新账号，如存在滥用行为，我们可拒绝或撤回奖励。`
        },
        {
          en: "Digital Employee is subject to fair use and currently includes 50,000 internal AI Credits per month. Automated or abusive usage that threatens service availability may be rate-limited; contact support if a legitimate workflow regularly approaches that allowance.",
          zh: "数字员工套餐遵循公平使用原则，目前每月包含 50,000 创作点数。对于影响服务可用性的自动化或滥用行为，我们可能进行限速；如正常工作流经常接近该额度，请联系支持。"
        },
        {
          en: "You can cancel at any time from your billing settings; cancellation stops future renewals and remains effective until the end of the current paid period.",
          zh: "您可随时在账单设置中取消；取消后不再续订，并在当前已付周期结束前继续有效。"
        }
      ]
    },
    {
      heading: { en: "Acceptable use", zh: "可接受使用" },
      paragraphs: [
        {
          en: "You agree not to use Finfold to generate or distribute unlawful, infringing, deceptive, hateful or harmful content, to spam or impersonate others, to reverse-engineer or disrupt the service, or to violate any platform's rules or applicable law. We may suspend or terminate accounts that breach these rules.",
          zh: "您同意不使用 Finfold 生成或传播违法、侵权、欺诈、仇恨或有害内容，不进行垃圾信息发送或冒充他人，不对服务进行逆向工程或干扰，亦不违反任何平台规则或适用法律。对违反上述规则的账户，我们可暂停或终止。"
        },
        {
          en: "Prohibited content — NSFW and adult sexual content: You may not use Finfold to generate, request or distribute pornographic, sexually explicit or otherwise NSFW (not safe for work) content, including any sexual content involving minors. This prohibition applies regardless of the platform you intend to publish to. We may suspend or terminate accounts that generate or attempt to generate such content.",
          zh: "禁止内容——NSFW 与成人性内容：您不得使用 Finfold 生成、请求或传播色情、露骨性内容或其他 NSFW（不适宜工作场合）内容，包括任何涉及未成年人的性内容。无论您计划发布到哪个平台，本禁令均适用。对生成或试图生成上述内容的账户，我们可暂停或终止。"
        }
      ]
    },
    {
      heading: { en: "Your content and ownership", zh: "您的内容与所有权" },
      paragraphs: [
        {
          en: "You retain ownership of the inputs you submit and, as between you and us, of the content generated for you. You grant us the limited rights needed to operate the service (for example, to process your inputs and store your outputs). You are responsible for reviewing generated content before you publish it.",
          zh: "您保留对所提交输入的所有权；在您与我们之间，您也保留为您生成内容的所有权。您授予我们运营服务所需的有限权利（例如处理您的输入并存储您的输出）。发布前审核生成内容由您负责。"
        }
      ]
    },
    {
      heading: { en: "AI-generated output disclaimer", zh: "AI 生成内容免责声明" },
      paragraphs: [
        {
          en: "AI output may be inaccurate, incomplete or unsuitable for a given use. Finfold does not guarantee any specific marketing result or performance. You are solely responsible for how you use generated content and for compliance with the rules of the platforms where you publish it.",
          zh: "AI 生成内容可能不准确、不完整或不适用于特定用途。Finfold 不保证任何具体的营销效果或表现。您对生成内容的使用方式，以及在发布平台上的合规性，负全部责任。"
        }
      ]
    },
    {
      heading: { en: "Intellectual property", zh: "知识产权" },
      paragraphs: [
        {
          en: "The Finfold software, brand, and underlying technology are owned by us and protected by intellectual property laws. These Terms do not grant you any rights in our IP except the limited right to use the service.",
          zh: "Finfold 软件、品牌及底层技术归我们所有，受知识产权法保护。除使用服务的有限权利外，本条款不授予您对我们知识产权的任何权利。"
        }
      ]
    },
    {
      heading: { en: "Disclaimers and limitation of liability", zh: "免责与责任限制" },
      paragraphs: [
        {
          en: 'The service is provided "as is" and "as available" without warranties of any kind. To the maximum extent permitted by law, Finfold is not liable for indirect, incidental or consequential damages, and our total liability for any claim is limited to the amount you paid us in the 12 months before the claim.',
          zh: "服务按「现状」及「现有」提供，不含任何形式的保证。在法律允许的最大范围内，Finfold 不对间接、附带或后果性损害承担责任；对任何索赔，我们的累计责任以您在索赔前 12 个月内向我们支付的金额为限。"
        }
      ]
    },
    {
      heading: { en: "Termination", zh: "终止" },
      paragraphs: [
        {
          en: "You may stop using the service and delete your account at any time. We may suspend or terminate access for breach of these Terms or where required by law. Sections that by their nature should survive termination will do so.",
          zh: "您可随时停止使用服务并删除账户。若您违反本条款或法律要求，我们可暂停或终止访问。依其性质应在终止后继续有效的条款将继续有效。"
        }
      ]
    },
    {
      heading: { en: "Changes to these Terms", zh: "条款的变更" },
      paragraphs: [
        {
          en: "We may update these Terms from time to time. We will post the updated version with a new date, and material changes will be communicated through the service or by email. Continued use after changes take effect constitutes acceptance.",
          zh: "我们可能不时更新本条款。我们会发布带有新日期的更新版本，重大变更将通过服务内或邮件告知。变更生效后继续使用即视为接受。"
        }
      ]
    },
    {
      heading: { en: "Contact", zh: "联系我们" },
      paragraphs: [
        {
          en: `Questions about these Terms? Email ${brand.legal.contactEmail}.`,
          zh: `如对本条款有疑问，请发送邮件至 ${brand.legal.contactEmail}。`
        }
      ]
    }
  ]
};

export const refundPolicy: LegalDoc = {
  slug: "refund",
  title: { en: "Refund & Cancellation Policy", zh: "退款与取消政策" },
  description: {
    en: "How cancellations and refunds work on Finfold.",
    zh: "Finfold 的取消与退款方式。"
  },
  sections: [
    {
      heading: { en: "Cancellations", zh: "取消订阅" },
      paragraphs: [
        effectiveLine,
        {
          en: "You can cancel your subscription at any time from your billing settings. Cancellation stops the next renewal; you keep access to your paid features until the end of the current billing period. We do not automatically prorate partial periods on cancellation.",
          zh: "您可随时在账单设置中取消订阅。取消后不再续订；在当前计费周期结束前，您仍可使用已付费功能。取消时我们不会自动按未使用时间退还部分费用。"
        }
      ]
    },
    {
      heading: { en: "3-day refund", zh: "3 天退款" },
      paragraphs: [
        {
          en: `Every paid plan carries a 3-day, no-questions-asked refund from the day you are charged. Email ${brand.legal.contactEmail} within 3 days and we will process a full refund of that charge — no data or justification required.`,
          zh: `所有付费套餐从扣费当天起享有 3 天无理由退款。请在 3 天内发送邮件至 ${brand.legal.contactEmail}，我们将全额退还该笔费用——无需提供任何数据或理由。`
        }
      ]
    },
    {
      heading: { en: "Digital Employee guarantee", zh: "数字员工保障" },
      paragraphs: [
        {
          en: "The Digital Employee plan adds a further guarantee: if you are not satisfied within your first month of active use, we will refund that month in full.",
          zh: "数字员工套餐额外提供保障：在首月活跃使用期间如不满意，我们将全额退还当月费用。"
        }
      ]
    },
    {
      heading: { en: "How refunds are issued", zh: "退款方式" },
      paragraphs: [
        {
          en: `Approved refunds are returned to your original payment method through our payment processor, ${brand.legal.paymentProcessor}. The time for funds to appear depends on your bank or card issuer, typically within 5–10 business days.`,
          zh: `已批准的退款将通过我们的支付处理方 ${brand.legal.paymentProcessor} 原路退回您的付款方式。到账时间取决于您的银行或发卡机构，通常为 5–10 个工作日。`
        }
      ]
    },
    {
      heading: { en: "How to request a refund", zh: "如何申请退款" },
      paragraphs: [
        {
          en: `Email ${brand.legal.contactEmail} from the address associated with your account and tell us which charge you would like refunded. We aim to respond within 2 business days.`,
          zh: `请使用与账户绑定的邮箱发送邮件至 ${brand.legal.contactEmail}，并说明希望退款的具体扣费。我们将在 2 个工作日内回复。`
        }
      ]
    }
  ]
};

export const legalDocs: Record<LegalDoc["slug"], LegalDoc> = {
  privacy: privacyPolicy,
  terms: termsOfService,
  refund: refundPolicy
};
