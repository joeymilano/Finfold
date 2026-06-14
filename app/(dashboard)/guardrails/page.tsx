"use client";

import Link from "next/link";
import { ShieldCheck, Plus, Trash2, X, Sparkles, CheckCircle2, Ban, Brain, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { assetSourceNotes } from "@/lib/ops-data";
import { useLocale } from "@/hooks/useLocale";
import { getBrandBrain, loadPersistedBrandBrain, getBrainCompleteness, type BrandBrain } from "@/lib/brand-brain";
import { addToast } from "@/components/ui/Toast";

type GuardrailRule = {
  title: string;
  titleEn: string;
  detail: string;
  detailEn: string;
  type: "avoid" | "required" | "tone" | "legal";
};

const initialRules: GuardrailRule[] = [
  {
    title: "禁止夸大宣传词",
    titleEn: "No Exaggerated Claims",
    detail: `禁止使用“全网第一”、“最强”、“颠覆级”等夸大性、绝对化违禁词，确保文案可信且符合广告合规要求。`,
    detailEn: "Prohibited terms include absolute superlatives like '#1 worldwide', 'most powerful', 'game-changing'. Keep copy credible and ad-compliant.",
    type: "avoid"
  },
  {
    title: "CTA 规范",
    titleEn: "CTA Standards",
    detail: `微信端引流引导至微信客服，海外渠道（X/LinkedIn）禁止在正文直接放链接，需提示“链接置于评论区第一条”。`,
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

export default function GuardrailsPage() {
  const locale = useLocale();
  const [rules, setRules] = useState<GuardrailRule[]>(initialRules);
  const [isOpen, setIsOpen] = useState(false);
  const [newRule, setNewRule] = useState<GuardrailRule>({ title: "", titleEn: "", detail: "", detailEn: "", type: "avoid" });

  const [brain, setBrain] = useState<BrandBrain>({ brandName: "", productDescription: "", targetAudience: "", toneKeywords: [], bannedPhrases: [], approvedExamples: [], competitors: [], positioningStatement: "" });
  const [brainLoaded, setBrainLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const localBrain = getBrandBrain();
    setBrain(localBrain);

    loadPersistedBrandBrain()
      .then(({ brain: persistedBrain, persisted }) => {
        if (!alive) return;
        if (persisted || getBrainCompleteness(localBrain) === 0) {
          setBrain(persistedBrain);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setBrainLoaded(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  const t = locale === "en" ? {
    pageTitle: "Brand Guardrails",
    pageDesc: "Define your brand voice, prohibited terms, and CTA rules across channels. Rules configured here are injected directly into the AI Workbench engine and enforced on every generation.",
    addRule: "Add Rule",
    addRuleModal: "Add Custom Rule",
    ruleTitle: "Rule title",
    ruleType: "Rule type",
    ruleDetail: "Rule description (injected into AI)",
    placeholder: "e.g. Never use 'free money' promotional language",
    detailPlaceholder: "Describe this rule in detail, e.g.: Do not use absolute terms like '#1' — WeChat titles must include the brand name",
    typeOptions: [
      { value: "avoid", label: "Avoid prohibited terms" },
      { value: "required", label: "Required element / CTA" },
      { value: "tone", label: "Voice & persona (Tone)" },
      { value: "legal", label: "Compliance & risk (Legal)" },
    ],
    cancel: "Cancel",
    save: "Save",
    brainTitle: "Brand Memory",
    brainDesc: "Your product, audience, tone, examples, and avoided words now live in one place. Use the dedicated memory page to update it.",
    brainOpen: "Open Brand Memory",
    brainCompleteness: "Completeness",
    brainBoundToWorkbench: "Bound to Workbench",
    deleteAlert: "Default system rules are brand guardrails and cannot be deleted. Only custom rules can be removed.",
    statusLabel: "Rule status",
    boundLabel: "Bound to Workbench",
    licenseTitle: "Commercial asset license records",
    licenseViewSrc: "View source ↗",
    licenseCopyright: "License",
  } : {
    pageTitle: "品牌规则",
    pageDesc: "设置哪些话不能说、哪些信息必须带上、不同平台要注意什么。创作台生成内容时会参考这些规则。",
    addRule: "新增规则",
    addRuleModal: "新增品牌规则",
    ruleTitle: "规则标题",
    ruleType: "规则类型",
    ruleDetail: "规则说明",
    placeholder: `如：严禁推广词"免费领"`,
    detailPlaceholder: `详细描述此规则，比如：不要使用"第一"、"巅峰"等绝对词，微信公众号标题里必须包含"Finfold"`,
    typeOptions: [
      { value: "avoid", label: "不要出现" },
      { value: "required", label: "必须包含" },
      { value: "tone", label: "表达风格" },
      { value: "legal", label: "风险提醒" },
    ],
    cancel: "取消",
    save: "确认保存",
    deleteAlert: "默认规则不能删除。你可以删除自己新增的规则。",
    statusLabel: "状态",
    brainTitle: "品牌记忆",
    brainDesc: "产品说明、目标用户、语气、示例文案和禁用表达统一放在「品牌记忆」里维护。这里专注管理规则。",
    brainOpen: "打开品牌记忆",
    brainCompleteness: "完整度",
    brainBoundToWorkbench: "已连接创作台",
    boundLabel: "已连接创作台",
    licenseTitle: "可商用视觉资源许可记录",
    licenseViewSrc: "查看源 ↗",
    licenseCopyright: "版权协议",
  };

  useEffect(() => {
    const saved = localStorage.getItem("finfold-custom-guardrails");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as GuardrailRule[];
        setRules([...initialRules, ...parsed]);
      } catch (err) {
        console.error("Failed to load custom guardrails", err);
      }
    }
  }, []);

  function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newRule.title.trim() || !newRule.detail.trim()) return;

    const saved = localStorage.getItem("finfold-custom-guardrails");
    let currentCustom: GuardrailRule[] = [];
    if (saved) {
      try { currentCustom = JSON.parse(saved) as GuardrailRule[]; } catch { /* ignore */ }
    }
    const nextCustom = [...currentCustom, newRule];
    localStorage.setItem("finfold-custom-guardrails", JSON.stringify(nextCustom));
    setRules([...initialRules, ...nextCustom]);
    setNewRule({ title: "", titleEn: "", detail: "", detailEn: "", type: "avoid" });
    setIsOpen(false);
  }

  function handleDeleteRule(title: string) {
    if (initialRules.some((r) => r.title === title)) {
      addToast("warning", t.deleteAlert);
      return;
    }
    const saved = localStorage.getItem("finfold-custom-guardrails");
    if (saved) {
      try {
        const currentCustom = JSON.parse(saved) as GuardrailRule[];
        const nextCustom = currentCustom.filter((r) => r.title !== title);
        localStorage.setItem("finfold-custom-guardrails", JSON.stringify(nextCustom));
        setRules([...initialRules, ...nextCustom]);
      } catch { /* ignore */ }
    }
  }

  return (
    <div className="grid gap-6 pb-10 max-w-[1400px] mx-auto">
      <section className="panel p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{locale === "en" ? "Brand Guardrails" : "品牌规则"}</p>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold text-fg leading-tight">{t.pageTitle}</h1>
            <p className="mt-2.5 max-w-2xl text-xs sm:text-sm leading-6 text-fg-muted">{t.pageDesc}</p>
          </div>
          <button type="button" onClick={() => setIsOpen(true)} className="btn-primary">
            {t.addRule} <Plus className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Brand memory summary */}
      {brainLoaded && (
        <section className="panel p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10">
                <Brain className="h-5 w-5 text-brand" />
              </span>
              <div>
                <h2 className="text-base font-bold text-fg flex items-center gap-2">
                  {t.brainTitle}
                  <span className="text-xs font-semibold text-brand">{getBrainCompleteness(brain)}%</span>
                </h2>
                <p className="text-xs text-fg-muted mt-0.5">{t.brainDesc}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="tag tag-brand text-[10px]">{t.brainBoundToWorkbench}</span>
              <Link href="/brand-memory" className="btn-ghost text-xs">
                {t.brainOpen} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md panel p-5 rk-enter">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand" />
                <h3 className="font-semibold text-fg text-base">{t.addRuleModal}</h3>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg p-1 text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddRule} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-fg uppercase tracking-wide">{t.ruleTitle}</label>
                <input
                  type="text" required
                  placeholder={t.placeholder}
                  value={newRule.title}
                  onChange={(e) => setNewRule({ ...newRule, title: e.target.value, titleEn: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-fg focus:border-brand focus:bg-surface focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-fg uppercase tracking-wide">{t.ruleType}</label>
                <select
                  value={newRule.type}
                  onChange={(e) => setNewRule({ ...newRule, type: e.target.value as GuardrailRule["type"] })}
                  className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-fg focus:border-brand focus:bg-surface focus:outline-none transition-all"
                >
                  {t.typeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-fg uppercase tracking-wide">{t.ruleDetail}</label>
                <textarea
                  required rows={4}
                  placeholder={t.detailPlaceholder}
                  value={newRule.detail}
                  onChange={(e) => setNewRule({ ...newRule, detail: e.target.value, detailEn: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-fg placeholder-fg-muted focus:border-brand focus:bg-surface focus:outline-none transition-all resize-none"
                />
              </div>
              <div className="flex gap-2 pt-2 border-t border-hairline">
                <button type="button" onClick={() => setIsOpen(false)} className="btn-ghost flex-1">{t.cancel}</button>
                <button type="submit" className="btn-primary flex-1">{t.save}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {rules.map((rule) => {
          const isInitial = initialRules.some((r) => r.title === rule.title);
          const displayTitle = locale === "en" ? (rule.titleEn || rule.title) : rule.title;
          const displayDetail = locale === "en" ? (rule.detailEn || rule.detail) : rule.detail;
          return (
            <article key={rule.title} className="panel panel-hover p-5 flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between">
                  <span className={`p-1.5 rounded-lg ${
                    rule.type === "avoid" ? "bg-risk/10 text-risk"
                    : rule.type === "required" ? "bg-brand/10 text-brand"
                    : rule.type === "tone" ? "bg-accent/10 text-accent"
                    : "bg-warn/10 text-warn"
                  }`}>
                    {rule.type === "avoid" ? <Ban className="h-4.5 w-4.5" />
                      : rule.type === "required" ? <CheckCircle2 className="h-4.5 w-4.5" />
                      : rule.type === "tone" ? <Sparkles className="h-4.5 w-4.5" />
                      : <ShieldCheck className="h-4.5 w-4.5" />}
                  </span>
                  {!isInitial && (
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.title)}
                      className="p-1.5 rounded-md text-fg-muted hover:bg-risk/10 hover:text-risk transition-all opacity-0 group-hover:opacity-100"
                      title={locale === "en" ? "Delete rule" : "删除规则"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <h2 className="mt-4 text-base font-bold text-fg flex items-center gap-1.5">
                  {displayTitle}
                  {isInitial && <span className="tag tag-neutral text-[9px]">{locale === "en" ? "System" : "系统"}</span>}
                </h2>
                <p className="mt-2.5 text-xs sm:text-sm leading-6 text-fg-muted">{displayDetail}</p>
              </div>
              <div className="mt-5 pt-3.5 border-t border-hairline flex items-center justify-between text-[11px] text-fg-muted font-semibold uppercase">
                <span>{t.statusLabel}</span>
                <span className="text-brand flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand" /> {t.boundLabel}
                </span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel p-5">
        <div className="flex items-center justify-between border-b border-hairline pb-3 mb-4">
          <div>
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">{locale === "en" ? "Commercial license notes" : "商用授权说明"}</p>
            <h2 className="mt-1 text-base font-bold text-fg">{t.licenseTitle}</h2>
          </div>
          <ShieldCheck className="h-5 w-5 text-brand" />
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {assetSourceNotes.map((source) => (
            <a key={source.source} href={source.href} target="_blank" rel="noreferrer"
              className="panel-inset p-4 transition-all hover:bg-surface-2 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-fg">{source.source}</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">{t.licenseViewSrc}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-fg-muted">{source.use}</p>
              </div>
              <div className="mt-4 pt-2 border-t border-hairline flex items-center justify-between text-[10px] font-bold text-brand uppercase">
                <span>{t.licenseCopyright}</span>
                <span>{source.license}</span>
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
