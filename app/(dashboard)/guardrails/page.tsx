"use client";

import Link from "next/link";
import { ShieldCheck, Plus, Trash2, X, Sparkles, CheckCircle2, Ban, Brain, ArrowRight, ChevronDown } from "@/components/ui/icons";
import { useState, useEffect } from "react";
import { useLocale } from "@/hooks/useLocale";
import { brandBrainSchema, getBrandBrain, loadPersistedBrandBrain, getBrainCompleteness, type BrandBrain } from "@/lib/brand-brain";
import {
  getStoredCustomGuardrails,
  getStoredEnabledPacks,
  loadPersistedCustomGuardrails,
  savePersistedCustomGuardrails,
  type GuardrailRule
} from "@/lib/guardrails";
import { INDUSTRY_PACKS, baseSystemRules, type IndustryPackId } from "@/lib/industry-rules";
import { addToast } from "@/components/ui/Toast";
import { Switch } from "@/components/ui/Switch";
import { CommercialAssetLibrary } from "@/components/brand/CommercialAssetLibrary";

const initialRules: GuardrailRule[] = baseSystemRules;

export default function GuardrailsPage() {
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [newRule, setNewRule] = useState<GuardrailRule>({ title: "", titleEn: "", detail: "", detailEn: "", type: "avoid" });

  const [brain, setBrain] = useState<BrandBrain>(() => brandBrainSchema.parse({}));
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
    brainDesc: "Your identity, audience, tone, examples, and avoided words live in one place — for a personal IP, a brand, or both.",
    brainOpen: "Open Brand Memory",
    brainCompleteness: "Completeness",
    brainBoundToWorkbench: "Bound to Workbench",
    deleteAlert: "Default system rules are brand guardrails and cannot be deleted. Only custom rules can be removed.",
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
    brainTitle: "品牌记忆",
    brainDesc: "个人 IP 或品牌的身份、受众、语气、示例文案和禁用表达统一放在「品牌记忆」里维护。这里专注管理规则。",
    brainOpen: "打开品牌记忆",
    brainCompleteness: "完整度",
    brainBoundToWorkbench: "已连接创作台",
  };

  const [customRules, setCustomRules] = useState<GuardrailRule[]>([]);
  const [enabledPacks, setEnabledPacks] = useState<IndustryPackId[]>([]);
  const [expandedPack, setExpandedPack] = useState<IndustryPackId | null>(null);

  useEffect(() => {
    let alive = true;
    const localRules = getStoredCustomGuardrails();
    const localPacks = getStoredEnabledPacks();
    setCustomRules(localRules);
    setEnabledPacks(localPacks);

    loadPersistedCustomGuardrails()
      .then(({ rules: persistedRules, enabledPacks: persistedPacks, persisted }) => {
        if (!alive) return;
        if (persisted || localRules.length === 0) {
          setCustomRules(persistedRules);
        }
        if (persisted || localPacks.length === 0) {
          setEnabledPacks(persistedPacks);
        }
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, []);

  async function handleTogglePack(packId: IndustryPackId) {
    const nextPacks = enabledPacks.includes(packId)
      ? enabledPacks.filter((id) => id !== packId)
      : [...enabledPacks, packId];
    setEnabledPacks(nextPacks);

    try {
      await savePersistedCustomGuardrails(customRules, nextPacks);
    } catch {
      setEnabledPacks(enabledPacks);
      addToast("error", locale === "en" ? "Could not save industry pack setting." : "行业规则库设置未能保存，请重试。");
    }
  }

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newRule.title.trim() || !newRule.detail.trim()) return;

    const nextCustom = [...customRules, newRule];
    setCustomRules(nextCustom);
    setNewRule({ title: "", titleEn: "", detail: "", detailEn: "", type: "avoid" });
    setIsOpen(false);

    try {
      await savePersistedCustomGuardrails(nextCustom);
    } catch {
      addToast("error", locale === "en" ? "Could not save rule to your account." : "规则未能保存到账号，请重试。");
    }
  }

  async function handleDeleteRule(title: string) {
    if (initialRules.some((r) => r.title === title)) {
      addToast("warning", t.deleteAlert);
      return;
    }
    const nextCustom = customRules.filter((r) => r.title !== title);
    setCustomRules(nextCustom);

    try {
      await savePersistedCustomGuardrails(nextCustom);
    } catch {
      addToast("error", locale === "en" ? "Could not remove rule from your account." : "规则未能从账号中删除，请重试。");
    }
  }

  return (
    <div className="mx-auto grid max-w-[1280px] gap-4 pb-10">
      <section className="panel p-5 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-fg leading-tight">{t.pageTitle}</h1>
            <p className="mt-2.5 max-w-2xl text-xs sm:text-sm leading-6 text-fg-muted">{t.pageDesc}</p>
          </div>
          <button type="button" onClick={() => setIsOpen(true)} className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2.5 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] dark:text-action">
            {t.addRule} <Plus className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Brand memory summary */}
      {brainLoaded && (
        <section className="panel p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-action/[0.1]">
                <Brain className="h-5 w-5 text-action-strong dark:text-action" />
              </span>
              <div>
                <h2 className="text-base font-bold text-fg flex items-center gap-2">
                  {t.brainTitle}
                  <span className="text-xs font-semibold text-action-strong dark:text-action">{getBrainCompleteness(brain)}%</span>
                </h2>
                <p className="text-xs text-fg-muted mt-0.5">{t.brainDesc}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="tag tag-action text-[10px]">{t.brainBoundToWorkbench}</span>
              <Link href="/brand-memory" className="btn-ghost text-xs">
                {t.brainOpen} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-4 py-3.5 md:px-5">
          <div>
            <p className="eyebrow">{locale === "en" ? "Your rules" : "你的规则"}</p>
            <h2 className="mt-1 text-base font-black text-fg">{locale === "en" ? "Custom brand rules" : "自定义品牌规则"}</h2>
          </div>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-fg-muted">
            {customRules.length} {locale === "en" ? "rules" : "条"}
          </span>
        </div>

        {customRules.length === 0 ? (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="focus-ring m-4 flex w-[calc(100%-2rem)] items-center justify-between gap-4 rounded-xl border border-dashed border-hairline bg-surface-2/30 p-4 text-left transition-colors hover:border-action/40 hover:bg-action/[0.04] md:m-5 md:w-[calc(100%-2.5rem)]"
          >
            <span>
              <span className="block text-sm font-bold text-fg">{locale === "en" ? "No custom rules yet" : "还没有自定义规则"}</span>
              <span className="mt-1 block text-xs leading-5 text-fg-muted">
                {locale === "en" ? "Add only the rules unique to your brand. System safeguards remain active." : "只添加你的品牌特有要求；系统基础规则会继续自动生效。"}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-action-strong dark:text-action">{t.addRule} <Plus className="h-3.5 w-3.5" /></span>
          </button>
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2 md:p-5">
            {customRules.map((rule) => {
              const displayTitle = locale === "en" ? (rule.titleEn || rule.title) : rule.title;
              const displayDetail = locale === "en" ? (rule.detailEn || rule.detail) : rule.detail;
              return (
                <article key={rule.title} className="group rounded-xl border border-hairline bg-surface-2/35 p-4">
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 rounded-lg p-1.5 ${
                      rule.type === "avoid" ? "bg-risk/10 text-risk"
                      : rule.type === "required" ? "bg-brand/10 text-brand"
                      : rule.type === "tone" ? "bg-accent/10 text-accent"
                      : "bg-warn/10 text-warn"
                    }`}>
                      {rule.type === "avoid" ? <Ban className="h-4 w-4" />
                        : rule.type === "required" ? <CheckCircle2 className="h-4 w-4" />
                        : rule.type === "tone" ? <Sparkles className="h-4 w-4" />
                        : <ShieldCheck className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-black text-fg">{displayTitle}</h3>
                      <p className="mt-1 text-xs leading-5 text-fg-muted">{displayDetail}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.title)}
                      className="focus-ring rounded-md p-1.5 text-fg-muted opacity-70 transition hover:bg-risk/10 hover:text-risk md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                      aria-label={`${locale === "en" ? "Delete" : "删除"} ${displayTitle}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel p-4 md:p-5">
        <div className="mb-3 border-b border-hairline pb-3">
          <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            {locale === "en" ? "Opt-in compliance libraries" : "行业合规规则库"}
          </p>
          <h2 className="mt-1 text-base font-bold text-fg">
            {locale === "en" ? "Industry Rule Packs" : "行业规则库"}
          </h2>
          <p className="mt-1.5 text-xs text-fg-muted leading-5">
            {locale === "en"
              ? "Enable only the industries you operate in. Their compliance rules are applied to every generation."
              : "只开启你实际涉及的行业；对应合规要求会自动应用到每次生成。"}
          </p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {INDUSTRY_PACKS.map((pack) => {
            const enabled = enabledPacks.includes(pack.id);
            const expanded = expandedPack === pack.id;
            return (
              <div key={pack.id} className={`rounded-xl border p-3.5 transition-colors ${enabled ? "border-action/35 bg-action/[0.045]" : "border-hairline bg-surface-2/30"}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-black text-fg">
                      {locale === "en" ? pack.labelEn : pack.label}
                      </h3>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${enabled ? "bg-action/[0.12] text-action-strong dark:text-action" : "bg-surface-2 text-fg-muted"}`}>
                        {enabled ? (locale === "en" ? "On" : "已开启") : (locale === "en" ? "Off" : "未开启")}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-[18px] text-fg-muted">
                      {locale === "en" ? pack.descriptionEn : pack.description}
                    </p>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={() => void handleTogglePack(pack.id)}
                    label={locale === "en" ? `${pack.labelEn} industry rules` : `${pack.label}行业规则`}
                  />
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-hairline pt-2.5 text-[10px] text-fg-muted">
                  <span>{pack.rules.length} {locale === "en" ? "rules" : "条规则"} · v{pack.version}</span>
                  <button
                    type="button"
                    onClick={() => setExpandedPack(expanded ? null : pack.id)}
                    aria-expanded={expanded}
                    className="focus-ring flex items-center gap-1 rounded px-1 py-0.5 font-bold text-action-strong dark:text-action"
                  >
                    {locale === "en" ? "Details" : "查看明细"}
                    <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {expanded && (
                  <div className="mt-3 space-y-2 border-t border-hairline pt-3">
                    {pack.rules.map((rule) => (
                      <div key={rule.title} className="text-xs">
                        <span className="font-semibold text-fg">{locale === "en" ? rule.titleEn : rule.title}</span>
                        <span className="text-fg-muted"> — {locale === "en" ? rule.detailEn : rule.detail}</span>
                      </div>
                    ))}
                    <p className="pt-1 text-[10px] text-fg-muted">
                      {locale === "en" ? "Sources: " : "依据来源："}{pack.sources.join(" · ")}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md panel p-5 rk-enter">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-action-strong dark:text-action" />
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
                  className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-fg focus:border-action focus:bg-surface focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-fg uppercase tracking-wide">{t.ruleType}</label>
                <select
                  value={newRule.type}
                  onChange={(e) => setNewRule({ ...newRule, type: e.target.value as GuardrailRule["type"] })}
                  className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-fg focus:border-action focus:bg-surface focus:outline-none transition-all"
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
                  className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-fg placeholder-fg-muted focus:border-action focus:bg-surface focus:outline-none transition-all resize-none"
                />
              </div>
              <div className="flex gap-2 pt-2 border-t border-hairline">
                <button type="button" onClick={() => setIsOpen(false)} className="btn-ghost flex-1">{t.cancel}</button>
                <button type="submit" className="focus-ring inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-action/45 bg-action/[0.08] px-4 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] dark:text-action">{t.save}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <details className="panel group overflow-hidden">
        <summary className="focus-ring flex cursor-pointer list-none items-center gap-3 p-4 md:px-5 [&::-webkit-details-marker]:hidden">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-action/[0.1] text-action-strong dark:text-action">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="eyebrow">{locale === "en" ? "Always on" : "始终生效"}</span>
            <span className="mt-1 block text-sm font-black text-fg">{locale === "en" ? "System baseline rules" : "系统基础规则"}</span>
            <span className="mt-0.5 block text-xs leading-5 text-fg-muted">
              {locale === "en" ? "Finfold applies these safeguards automatically. Expand only when you need to inspect them." : "Finfold 会自动应用这些基础保护；需要核对时再展开查看。"}
            </span>
          </span>
          <span className="hidden rounded-full bg-positive/10 px-2.5 py-1 text-[10px] font-bold text-positive sm:inline">
            {initialRules.length} {locale === "en" ? "active" : "条已启用"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-2.5 border-t border-hairline p-4 md:grid-cols-2 md:p-5">
          {initialRules.map((rule) => {
            const displayTitle = locale === "en" ? (rule.titleEn || rule.title) : rule.title;
            const displayDetail = locale === "en" ? (rule.detailEn || rule.detail) : rule.detail;
            return (
              <article key={rule.title} className="flex items-start gap-3 rounded-xl border border-hairline bg-surface-2/35 p-3.5">
                <span className={`mt-0.5 rounded-lg p-1.5 ${
                  rule.type === "avoid" ? "bg-risk/10 text-risk"
                  : rule.type === "required" ? "bg-brand/10 text-brand"
                  : rule.type === "tone" ? "bg-accent/10 text-accent"
                  : "bg-warn/10 text-warn"
                }`}>
                  {rule.type === "avoid" ? <Ban className="h-4 w-4" />
                    : rule.type === "required" ? <CheckCircle2 className="h-4 w-4" />
                    : rule.type === "tone" ? <Sparkles className="h-4 w-4" />
                    : <ShieldCheck className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-black text-fg">{displayTitle}</span>
                  <span className="mt-1 block text-[11px] leading-5 text-fg-muted">{displayDetail}</span>
                </span>
              </article>
            );
          })}
        </div>
      </details>

      <CommercialAssetLibrary locale={locale} />
    </div>
  );
}
