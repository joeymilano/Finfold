"use client";

import type { KeyboardEvent, ReactNode } from "react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  MessageSquareWarning,
  Save,
  Sparkles,
  Target,
  Users,
  X
} from "lucide-react";
import { addToast } from "@/components/ui/Toast";
import { useLocale } from "@/hooks/useLocale";
import {
  getBrainCompleteness,
  getBrandBrain,
  loadPersistedBrandBrain,
  saveBrandBrain,
  savePersistedBrandBrain,
  type BrandBrain
} from "@/lib/brand-brain";

const emptyBrain: BrandBrain = {
  brandName: "",
  productDescription: "",
  targetAudience: "",
  toneKeywords: [],
  bannedPhrases: [],
  approvedExamples: [],
  competitors: [],
  positioningStatement: ""
};

export default function BrandMemoryPage() {
  const locale = useLocale();
  const [brain, setBrain] = useState<BrandBrain>(emptyBrain);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const [bannedInput, setBannedInput] = useState("");
  const [competitorInput, setCompetitorInput] = useState("");
  const [exampleInput, setExampleInput] = useState("");

  const t = locale === "en" ? {
    eyebrow: "Brand Memory",
    title: "Teach Finfold what your brand should remember",
    desc: "Save your product, audience, tone, examples, and words to avoid. The Workbench uses this memory every time it creates new content.",
    status: "Connected to Workbench",
    save: "Save Memory",
    saving: "Saving...",
    savedAccount: "Brand memory saved to your account.",
    savedLocal: "Brand memory saved locally. Log in to sync it across devices.",
    brandName: "Brand / product name",
    brandNamePh: "e.g. Finfold",
    positioning: "One-line positioning",
    positioningPh: "e.g. The AI content workspace for lean product teams",
    product: "What should Finfold know about the product?",
    productPh: "What does it do? Who is it for? What makes it different?",
    audience: "Target audience",
    audiencePh: "e.g. solo founders, small SaaS teams, launch marketers",
    tone: "Tone words",
    tonePh: "Add a tone word",
    banned: "Words to avoid",
    bannedPh: "Add a banned phrase",
    competitors: "Reference competitors",
    competitorsPh: "Add a competitor",
    examples: "Approved style examples",
    examplesPh: "Paste a sentence or paragraph that sounds like your brand",
    addExample: "Add example",
    rulesLink: "Set brand rules",
    workbenchLink: "Create with this memory",
    completeness: "Memory completeness",
  } : {
    eyebrow: "品牌记忆",
    title: "让 Finfold 记住你的品牌",
    desc: "保存产品介绍、目标用户、表达语气、示例文案和禁用表达。之后在创作台生成内容时，系统都会用这些记忆来保持一致。",
    status: "已连接创作台",
    save: "保存记忆",
    saving: "保存中...",
    savedAccount: "品牌记忆已保存到账号。",
    savedLocal: "品牌记忆已保存到本地。登录后可跨设备同步。",
    brandName: "品牌 / 产品名称",
    brandNamePh: "如：Finfold",
    positioning: "一句话定位",
    positioningPh: "如：给小团队用的 AI 内容创作工作台",
    product: "产品说明",
    productPh: "产品做什么？给谁用？和别人有什么不一样？",
    audience: "目标用户",
    audiencePh: "如：独立开发者、小型 SaaS 团队、出海创业者",
    tone: "语气关键词",
    tonePh: "添加一个语气词",
    banned: "不要使用的表达",
    bannedPh: "添加一个禁用表达",
    competitors: "参考竞品",
    competitorsPh: "添加一个竞品",
    examples: "喜欢的文案示例",
    examplesPh: "粘贴一句或一段符合你品牌语气的文案",
    addExample: "添加示例",
    rulesLink: "设置品牌规则",
    workbenchLink: "用这份记忆去创作",
    completeness: "记忆完整度",
  };

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
        if (alive) setLoaded(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    saveBrandBrain(brain);
    try {
      const { brain: savedBrain, persisted } = await savePersistedBrandBrain(brain);
      setBrain(savedBrain);
      addToast("success", persisted ? t.savedAccount : t.savedLocal);
    } catch {
      addToast("warning", t.savedLocal);
    } finally {
      setSaving(false);
    }
  }, [brain, t.savedAccount, t.savedLocal]);

  const completeness = getBrainCompleteness(brain);

  return (
    <div className="mx-auto grid max-w-[1180px] gap-6 pb-10">
      <section className="panel overflow-hidden p-6 md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">{t.eyebrow}</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-black leading-tight text-fg md:text-5xl">
              {t.title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-fg-muted">
              {t.desc}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[320px]">
            <Link href="/guardrails" className="btn-ghost justify-center">
              {t.rulesLink}
            </Link>
            <Link href="/workbench" className="btn-primary justify-center">
              {t.workbenchLink} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
        <aside className="panel h-fit p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand/15">
              <Brain className="h-5 w-5 text-brand" />
            </span>
            <div>
              <p className="text-sm font-bold text-fg">{t.completeness}</p>
              <p className="text-xs font-semibold text-fg-muted">{t.status}</p>
            </div>
          </div>
          <div className="mt-5">
            <div className="flex items-end justify-between">
              <span className="text-4xl font-black text-fg tabular">{completeness}%</span>
              <CheckCircle2 className={completeness >= 70 ? "h-5 w-5 text-brand" : "h-5 w-5 text-fg-muted"} />
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${completeness}%` }} />
            </div>
          </div>
          <button type="button" onClick={() => void handleSave()} disabled={!loaded || saving} className="btn-primary mt-5 w-full justify-center disabled:opacity-60">
            <Save className="h-4 w-4" />
            {saving ? t.saving : t.save}
          </button>
        </aside>

        <section className="panel p-5 md:p-6">
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.brandName}>
                <input
                  type="text"
                  placeholder={t.brandNamePh}
                  value={brain.brandName}
                  onChange={(event) => setBrain((current) => ({ ...current, brandName: event.target.value }))}
                  className="field-input"
                />
              </Field>
              <Field label={t.positioning}>
                <input
                  type="text"
                  placeholder={t.positioningPh}
                  value={brain.positioningStatement}
                  onChange={(event) => setBrain((current) => ({ ...current, positioningStatement: event.target.value }))}
                  className="field-input"
                />
              </Field>
            </div>

            <Field label={t.product}>
              <textarea
                rows={4}
                placeholder={t.productPh}
                value={brain.productDescription}
                onChange={(event) => setBrain((current) => ({ ...current, productDescription: event.target.value }))}
                className="field-input resize-none"
              />
            </Field>

            <Field label={t.audience} icon={<Target className="h-4 w-4 text-accent" />}>
              <textarea
                rows={3}
                placeholder={t.audiencePh}
                value={brain.targetAudience}
                onChange={(event) => setBrain((current) => ({ ...current, targetAudience: event.target.value }))}
                className="field-input resize-none"
              />
            </Field>

            <div className="grid gap-4 lg:grid-cols-3">
              <TagInput
                label={t.tone}
                placeholder={t.tonePh}
                icon={<Sparkles className="h-3.5 w-3.5 text-brand" />}
                tags={brain.toneKeywords}
                inputValue={keywordInput}
                onInputChange={setKeywordInput}
                onAdd={(value) => setBrain((current) => ({ ...current, toneKeywords: [...current.toneKeywords, value] }))}
                onRemove={(index) => setBrain((current) => ({ ...current, toneKeywords: current.toneKeywords.filter((_, i) => i !== index) }))}
              />
              <TagInput
                label={t.banned}
                placeholder={t.bannedPh}
                icon={<MessageSquareWarning className="h-3.5 w-3.5 text-risk" />}
                tags={brain.bannedPhrases}
                inputValue={bannedInput}
                onInputChange={setBannedInput}
                onAdd={(value) => setBrain((current) => ({ ...current, bannedPhrases: [...current.bannedPhrases, value] }))}
                onRemove={(index) => setBrain((current) => ({ ...current, bannedPhrases: current.bannedPhrases.filter((_, i) => i !== index) }))}
              />
              <TagInput
                label={t.competitors}
                placeholder={t.competitorsPh}
                icon={<Users className="h-3.5 w-3.5 text-accent" />}
                tags={brain.competitors}
                inputValue={competitorInput}
                onInputChange={setCompetitorInput}
                onAdd={(value) => setBrain((current) => ({ ...current, competitors: [...current.competitors, value] }))}
                onRemove={(index) => setBrain((current) => ({ ...current, competitors: current.competitors.filter((_, i) => i !== index) }))}
              />
            </div>

            <Field label={t.examples}>
              <div className="grid gap-3">
                <textarea
                  rows={3}
                  placeholder={t.examplesPh}
                  value={exampleInput}
                  onChange={(event) => setExampleInput(event.target.value)}
                  className="field-input resize-none"
                />
                <button
                  type="button"
                  className="btn-ghost w-fit"
                  onClick={() => {
                    const value = exampleInput.trim();
                    if (!value) return;
                    setBrain((current) => ({ ...current, approvedExamples: [value, ...current.approvedExamples].slice(0, 5) }));
                    setExampleInput("");
                  }}
                >
                  {t.addExample}
                </button>
                {brain.approvedExamples.length > 0 ? (
                  <div className="grid gap-2">
                    {brain.approvedExamples.map((example, index) => (
                      <div key={example + index} className="rounded-md border border-hairline bg-surface-2 p-3 text-sm leading-6 text-fg-muted">
                        <div className="flex items-start justify-between gap-3">
                          <p>{example}</p>
                          <button
                            type="button"
                            className="rounded-sm p-1 text-fg-muted hover:bg-surface hover:text-fg"
                            onClick={() => setBrain((current) => ({ ...current, approvedExamples: current.approvedExamples.filter((_, i) => i !== index) }))}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </Field>
          </div>
        </section>
      </section>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-fg">
        {icon}
        {label}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function TagInput({
  label,
  placeholder,
  icon,
  tags,
  inputValue,
  onInputChange,
  onAdd,
  onRemove
}: {
  label: string;
  placeholder: string;
  icon: ReactNode;
  tags: string[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = inputValue.trim();
    if (!value || tags.includes(value)) return;
    onAdd(value);
    onInputChange("");
  }

  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-fg">
        {icon}
        {label}
      </label>
      <div className="mt-1.5 flex min-h-[44px] flex-wrap gap-1.5 rounded-lg border border-hairline bg-surface-2 p-2">
        {tags.map((tag, index) => (
          <span key={tag + index} className="inline-flex items-center gap-1 rounded-md bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">
            {tag}
            <button type="button" onClick={() => onRemove(index)} className="rounded-sm hover:bg-brand/20">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="min-w-[96px] flex-1 bg-transparent text-sm text-fg placeholder-fg-muted focus:outline-none"
        />
      </div>
    </div>
  );
}
