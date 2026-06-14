"use client";

import { ArrowRight, Loader2, ShieldCheck, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { UsageMeter } from "@/components/billing/UsageMeter";
import { addToast } from "@/components/ui/Toast";
import { getBrandBrain, loadPersistedBrandBrain } from "@/lib/brand-brain";
import { GoalSelector } from "@/components/workbench/GoalSelector";
import { IdeaInput } from "@/components/workbench/IdeaInput";
import { KitHistory } from "@/components/workbench/KitHistory";
import { MediaUploader } from "@/components/workbench/MediaUploader";
import { OutputBoard } from "@/components/workbench/OutputBoard";
import { PersonaSelector } from "@/components/workbench/PersonaSelector";
import { PlatformSelector } from "@/components/workbench/PlatformSelector";
import type { ContentKit, KitOutput, MediaAsset } from "@/lib/content-schema";
import type { GoalId } from "@/lib/goals";
import { dashboardCopy, type Locale } from "@/lib/i18n";
import { getStoredLocale } from "@/lib/theme";
import type { PersonaId } from "@/lib/personas";
import type { PlatformId } from "@/lib/platforms";
import { getGenerateDisabledReason } from "@/lib/workbench-gating";

const starterIdea =
  "Finfold helps lean product teams turn one launch note, product update, customer insight, or founder memo into clear platform-native drafts for social, community, newsletter, launch, and search channels.";

const defaultPlatforms: PlatformId[] = [
  "wechat",
  "xiaohongshu",
  "moments",
  "x",
  "linkedin",
  "reddit",
  "product-hunt"
];

const showcaseOutputs: KitOutput[] = [
  {
    platform: "x",
    title: "One launch note should not become seven manual rewrites",
    body: "Most small teams do not have a content problem. They have a translation problem.\n\nA product update needs one version for builders, another for buyers, another for communities, another for search, and another for launch day.\n\nFinfold turns one source signal into channel-native growth drafts, keeping the strategy, CTA, and platform fit in one place.",
    cta: "Try the workflow with one real product update and compare the output across channels.",
    notes: "Keep the first two lines sharp. Avoid broad AI-tool claims; lead with the operating pain.",
    strategy: "Use X for founder narrative, sharp contrast, and public iteration. The hook frames Finfold as an operating workflow, not a generic writing assistant.",
    locked: false,
    publishStatus: "draft"
  },
  {
    platform: "linkedin",
    title: "The hidden content tax on lean product teams",
    body: "Every launch creates a quiet operations tax: turn one product update into a LinkedIn post, a founder note, a Reddit-safe discussion, a Product Hunt story, a newsletter angle, and follow-up snippets.\n\nFinfold compresses that work into one content operations surface. The source asset stays central, while each channel receives its own structure, tone, CTA, and review notes.\n\nThat matters because growth teams do not just need more copy. They need a repeatable system.",
    cta: "Use Finfold to turn your next product note into a complete launch kit.",
    notes: "Best used with concrete product proof, customer quotes, or release metrics.",
    strategy: "LinkedIn should sound operational and credible. This version sells the system-level cost and the business reason to care.",
    locked: false,
    publishStatus: "draft"
  },
  {
    platform: "reddit",
    title: "How do you adapt one product update for multiple communities without sounding spammy?",
    body: "I have been testing a workflow for turning one launch note into different community-safe formats.\n\nThe hard part is not summarizing the product. The hard part is changing the framing: one community wants the technical tradeoff, another wants the use case, another wants the founder lesson, and another wants a very direct launch story.\n\nThe useful pattern so far: keep one source brief, then adapt the hook, proof, caveats, and CTA separately for each channel.",
    cta: "Curious how other founders handle this without rewriting everything manually.",
    notes: "Avoid product links in the opening post. Ask for workflow feedback first.",
    strategy: "Reddit needs humility and discussion. This version makes the product insight useful before it asks for attention.",
    locked: false,
    publishStatus: "draft"
  },
  {
    platform: "product-hunt",
    title: "Finfold — turn one product signal into a launch-ready content kit",
    body: "Finfold helps lean teams convert one product update, founder memo, or customer insight into platform-native content for launch and growth channels.\n\nStart with one source brief, then review clear drafts for the channels that matter most.",
    cta: "Launch with a complete content kit instead of a blank posting calendar.",
    notes: "Pair this with a short demo video and gallery images showing the Workbench and generated channel drafts.",
    strategy: "Product Hunt copy should be concrete and scannable: what it is, who it is for, and why it helps launch day.",
    locked: false,
    publishStatus: "planned"
  },
  {
    platform: "wechat",
    title: "把一次产品更新变成完整增长资产",
    body: "小团队真正缺的不是一篇文案，而是一套可以反复使用的内容生产流程。\n\n一次产品更新，往往要被改写成创始人观点、社区讨论、发布页故事、客户教育、短内容钩子和后续复盘。Finfold 把源素材、品牌规则、平台语气、CTA 和数据回流放在同一个工作台里，让内容不再是一次性消耗品。",
    cta: "从下一次产品更新开始，用一份源素材生成完整内容包。",
    notes: "适合公众号长文开头，后续可加入真实截图、用户案例和版本更新数据。",
    strategy: "公众号版本强调方法论和信任建设，让读者理解 Finfold 解决的是内容运营流程问题。",
    locked: false,
    publishStatus: "draft"
  },
  {
    platform: "xiaohongshu",
    title: "一个更新写7遍太痛了",
    body: "做产品最耗人的不是写第一版。\n\n而是同一个更新要改成不同平台都能看的样子：小红书要痛点和收藏感，X 要观点，LinkedIn 要专业，Reddit 不能像广告，Product Hunt 又要很快讲清楚。\n\nFinfold 的思路是：先保留一份源素材，再按平台重新折叠成不同内容资产。",
    cta: "如果你也在反复改发布文案，可以试试这个工作流。",
    notes: "标题要更口语，正文多换行，结尾引导收藏或评论。",
    strategy: "小红书版本强调真实痛点和轻量收藏价值，不用夸张卖点。",
    locked: false,
    publishStatus: "draft"
  },
  {
    platform: "moments",
    title: "Finfold launch note",
    body: "最近在把 Finfold 做成一个内容运营工作台。\n\n它解决的是一个很具体的问题：产品团队写完一次更新后，不想再手动改七八个平台的版本。\n\n现在可以从一份源素材直接生成平台内容包，还能看品牌规则、质量评分和下一轮数据回流。",
    cta: "有做产品发布或内容增长的朋友，欢迎帮我看一眼。",
    notes: "朋友圈语气要像真实进展分享，不要像正式广告。",
    strategy: "朋友圈版本保留创始人语气，适合熟人网络获得反馈。",
    locked: false,
    publishStatus: "draft"
  }
];

const showcaseKit: ContentKit = {
  id: "showcase-kit",
  ideaText: starterIdea,
  goal: "lead-gen",
  persona: "ai-saas",
  platforms: defaultPlatforms,
  mediaAssets: [],
  outputs: showcaseOutputs,
  status: "saved",
  createdAt: "2026-06-13T00:00:00.000Z"
};

type Allowance = {
  used: number;
  limit: number;
  plan: string;
};

type Entitlement = {
  authenticated: boolean;
  plan: string;
  canUseOutputs: boolean;
  canAnalyze: boolean;
  trialAvailable: boolean;
  monthlyLimit?: number;
  used?: number;
};

export function DashboardWorkbench() {
  const [locale, setLocale] = useState<Locale>("zh");
  // sync from global LocaleToggle
  useEffect(() => {
    if (typeof window !== "undefined") {
      setLocale(getStoredLocale());
    }
    function onLocaleChange(e: Event) {
      setLocale((e as CustomEvent<Locale>).detail);
    }
    window.addEventListener("finfold-locale-change", onLocaleChange);
    return () => window.removeEventListener("finfold-locale-change", onLocaleChange);
  }, []);
  const [ideaText, setIdeaText] = useState(starterIdea);
  const [goal, setGoal] = useState<GoalId>("lead-gen");
  const [persona, setPersona] = useState<PersonaId>("ai-saas");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(defaultPlatforms);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [outputs, setOutputs] = useState<KitOutput[]>(showcaseOutputs);
  const [kits, setKits] = useState<ContentKit[]>([showcaseKit]);
  const [allowance, setAllowance] = useState<Allowance>({ used: 0, limit: 50, plan: "showcase" });
  const [entitlement, setEntitlement] = useState<Entitlement>({
    authenticated: false,
    plan: "showcase",
    canUseOutputs: true,
    canAnalyze: true,
    trialAvailable: true
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKits = useCallback(async () => {
    const entitlementResponse = await fetch("/api/entitlements/check", { method: "POST", cache: "no-store" });
    const entitlementData = (await entitlementResponse.json()) as Entitlement;
    setEntitlement({ ...entitlementData, canUseOutputs: true, canAnalyze: true });
    setAllowance({ used: entitlementData.used ?? 0, limit: entitlementData.monthlyLimit ?? 1, plan: entitlementData.plan });

    if (!entitlementData.authenticated) {
      setKits([showcaseKit]);
      return;
    }

    const response = await fetch("/api/kits", { cache: "no-store" });
    const data = (await response.json()) as { kits?: ContentKit[] };
    setKits([showcaseKit, ...(data.kits ?? []).filter((kit) => kit.id !== showcaseKit.id)]);
  }, []);

  useEffect(() => {
    void loadKits();
  }, [loadKits]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadKits();
      }
    }

    function onWindowFocus() {
      void loadKits();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [loadKits]);

  async function generateKit() {
    setError(null);
    setIsLoading(true);

    try {
      // Load custom brand rules from localStorage to make guardrails actually work!
      let customRules: string[] = [];
      const savedGuardrails = typeof window !== "undefined" ? localStorage.getItem("finfold-custom-guardrails") : null;
      if (savedGuardrails) {
        try {
          const parsed = JSON.parse(savedGuardrails) as Array<{ title: string; detail: string }>;
          customRules = parsed.map((r) => `${r.title}: ${r.detail}`);
        } catch {
          // safe empty catch with no unused parameter
        }
      }

      // Load account-level brand memory when available, with localStorage fallback
      let brandBrain = getBrandBrain();
      if (entitlement.authenticated) {
        try {
          const persisted = await loadPersistedBrandBrain();
          brandBrain = persisted.brain;
        } catch {
          // keep local fallback
        }
      }

      const trialMode = !entitlement.authenticated;
      const response = await fetch(trialMode ? "/api/trial/generate" : "/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ideaText,
          goal,
          persona,
          platforms: selectedPlatforms,
          mediaAssets,
          language: locale,
          customRules,
          brandBrain: brandBrain.brandName || brandBrain.productDescription ? brandBrain : undefined
        })
      });
      const data = (await response.json()) as { kit?: ContentKit; allowance?: Allowance; error?: string };

      if (!response.ok || !data.kit) {
        throw new Error(data.error ?? "Growth asset package could not be generated.");
      }

      setOutputs(data.kit.outputs);
      addToast("success", locale === "en" ? "Growth kit generated!" : "增长资产包已生成！");
      if (trialMode) {
        setEntitlement((current) => ({ ...current, trialAvailable: true, canUseOutputs: true, canAnalyze: true }));
      }
      setKits((current) => [data.kit!, ...current.filter((kit) => kit.id !== data.kit!.id)]);
      if (data.allowance) {
        setAllowance(data.allowance);
      } else if (trialMode) {
        setAllowance((current) => ({ used: current.used + 1, limit: 50, plan: "showcase" }));
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Growth asset package could not be generated.";
      setError(message);
      addToast("error", message);
    } finally {
      setIsLoading(false);
    }
  }

  const canGenerate = ideaText.trim().length >= 20 && selectedPlatforms.length > 0 && !isLoading;
  const generateDisabledReason = getGenerateDisabledReason({
    ideaText,
    selectedPlatformCount: selectedPlatforms.length,
    isLoading,
    authenticated: entitlement.authenticated,
    trialUsed: false,
    locale
  });
  const copy = dashboardCopy[locale];

  return (
    <div className="grid min-w-0 gap-6 pb-10">
      <section className="relative isolate min-w-0 overflow-hidden rounded-md border border-hairline bg-surface p-5 shadow-panel md:p-6">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_20%,rgb(var(--brand)/0.18),transparent_30%),linear-gradient(135deg,rgb(var(--fg)/0.04),transparent_48%)]" />
        <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">Finfold Workbench</p>
            <h1 className="mt-3 max-w-4xl break-words text-3xl font-black leading-[1.02] text-fg sm:text-4xl md:text-6xl">
              {locale === "en" ? "Workbench" : "创作台"}
            </h1>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-6 text-fg-muted md:text-base">
              {locale === "en"
                ? "Start with one product update, choose the channels that matter, and review ready-to-edit drafts in one focused workspace."
                : "从一次产品更新开始，选择要发布的平台，在一个聚焦的工作台里查看可编辑草稿。"}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-2 rounded-md border border-hairline bg-surface-2 px-3 py-2 font-semibold text-fg-muted">
              <ShieldCheck className="h-4 w-4 text-brand-strong dark:text-brand" />
              {entitlement.authenticated ? entitlement.plan : "Showcase"}
            </span>
            <Link href="/packages" className="focus-ring inline-flex items-center gap-2 rounded-md border border-hairline bg-surface px-3 py-2 font-semibold text-fg">
              {locale === "en" ? "View Kits" : "查看套件"}
            </Link>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-5 lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_320px_1fr]">
        {/* Column 1 — Product assets */}
        <div className="grid min-w-0 content-start gap-4">
          <div className="flex items-center gap-2 px-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-fg text-xs font-semibold text-bg">1</span>
            <h2 className="text-sm font-semibold text-fg">{locale === "en" ? "Product Assets & Media" : "产品资产与素材"}</h2>
          </div>
          <IdeaInput value={ideaText} onChange={setIdeaText} locale={locale} />
          <MediaUploader assets={mediaAssets} onChange={setMediaAssets} locale={locale} />
        </div>

        {/* Column 2 — Strategy */}
        <div className="grid min-w-0 content-start gap-4">
          <UsageMeter used={allowance.used} limit={allowance.limit} plan={allowance.plan} />
          <div className="flex items-center gap-2 px-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-fg text-xs font-semibold text-bg">2</span>
            <h2 className="text-sm font-semibold text-fg">{copy.strategyStep}</h2>
          </div>
          <PersonaSelector value={persona} onChange={setPersona} locale={locale} />
          <GoalSelector value={goal} onChange={setGoal} locale={locale} />
          <PlatformSelector value={selectedPlatforms} onChange={setSelectedPlatforms} locale={locale} />
          <KitHistory kits={kits} />
        </div>

        {/* Column 3 — Output (spans full width on < xl) */}
        <div className="grid min-w-0 content-start gap-4 lg:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-fg text-xs font-semibold text-bg">3</span>
                <h2 className="text-sm font-semibold text-fg">{locale === "en" ? "Platform Content Kit" : "平台资产包"}</h2>
              </div>
              {!canGenerate && generateDisabledReason ? (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  {generateDisabledReason}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void generateKit()}
              disabled={!canGenerate}
              title={!canGenerate && generateDisabledReason ? generateDisabledReason : undefined}
              className="focus-ring btn-primary cursor-pointer inline-flex shrink-0 items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
              {copy.generate} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <OutputBoard outputs={outputs} isLoading={isLoading} error={error} locale={locale} canUseOutputs={true} />
        </div>
      </section>

    </div>
  );
}
