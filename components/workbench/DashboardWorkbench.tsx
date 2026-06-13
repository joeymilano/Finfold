"use client";

import { ArrowRight, CheckCircle2, Loader2, ShieldCheck, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { UsageMeter } from "@/components/billing/UsageMeter";
import { ContentOSPreview } from "@/components/workbench/ContentOSPreview";
import { addToast } from "@/components/ui/Toast";
import { getBrandBrain, loadPersistedBrandBrain } from "@/lib/brand-brain";
import { GoalSelector } from "@/components/workbench/GoalSelector";
import { IdeaInput } from "@/components/workbench/IdeaInput";
import { KitHistory } from "@/components/workbench/KitHistory";
import { MediaUploader } from "@/components/workbench/MediaUploader";
import { OutputBoard } from "@/components/workbench/OutputBoard";
import { PerformancePanel } from "@/components/workbench/PerformancePanel";
import { PersonaSelector } from "@/components/workbench/PersonaSelector";
import { QualityScorePanel } from "@/components/workbench/QualityScorePanel";
import { PlatformSelector } from "@/components/workbench/PlatformSelector";
import { UpgradeGate } from "@/components/workbench/UpgradeGate";
import type { ContentKit, KitOutput, MediaAsset } from "@/lib/content-schema";
import type { GoalId } from "@/lib/goals";
import { dashboardCopy, type Locale } from "@/lib/i18n";
import type { PersonaId } from "@/lib/personas";
import type { PlatformId } from "@/lib/platforms";
import { getGenerateDisabledReason } from "@/lib/workbench-gating";

const starterIdea =
  "Launch OS 是一套面向产品营销团队的 Cross-platform Content OS。它把一个产品资产重组为小红书、抖音、视频号、B站、LinkedIn、Instagram、TikTok 等平台原生增长资产，并通过品牌规则、审核状态和排期协作把内容投入发布流程。";

const defaultPlatforms: PlatformId[] = [
  "wechat",
  "xiaohongshu",
  "moments",
  "x",
  "linkedin",
  "reddit",
  "product-hunt"
];

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
      const stored = localStorage.getItem("finfold-locale");
      if (stored === "zh" || stored === "en") setLocale(stored);
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
  const [outputs, setOutputs] = useState<KitOutput[]>([]);
  const [kits, setKits] = useState<ContentKit[]>([]);
  const [activeKitId, setActiveKitId] = useState<string | null>(null);
  const [allowance, setAllowance] = useState<Allowance>({ used: 0, limit: 1, plan: "trial" });
  const [entitlement, setEntitlement] = useState<Entitlement>({
    authenticated: false,
    plan: "trial",
    canUseOutputs: false,
    canAnalyze: false,
    trialAvailable: true
  });
  const [trialUsed, setTrialUsed] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"copy" | "export" | "save" | "analyze" | "iterate" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKits = useCallback(async () => {
    const entitlementResponse = await fetch("/api/entitlements/check", { method: "POST", cache: "no-store" });
    const entitlementData = (await entitlementResponse.json()) as Entitlement;
    setEntitlement(entitlementData);
    setAllowance({ used: entitlementData.used ?? 0, limit: entitlementData.monthlyLimit ?? 1, plan: entitlementData.plan });

    if (!entitlementData.authenticated) {
      setKits([]);
      return;
    }

    const response = await fetch("/api/kits", { cache: "no-store" });
    const data = (await response.json()) as { kits?: ContentKit[] };
    setKits(data.kits ?? []);
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

      // Load account-level Brand Brain when available, with localStorage fallback
      let brandBrain = getBrandBrain();
      if (entitlement.authenticated) {
        try {
          const persisted = await loadPersistedBrandBrain();
          brandBrain = persisted.brain;
        } catch {
          // keep local fallback
        }
      }

      const trialMode = !entitlement.authenticated && !trialUsed;
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
        setTrialUsed(true);
        setEntitlement((current) => ({ ...current, trialAvailable: false, canUseOutputs: false }));
      }
      setActiveKitId(data.kit.id);
      setKits((current) => [data.kit!, ...current.filter((kit) => kit.id !== data.kit!.id)]);
      if (data.allowance) {
        setAllowance(data.allowance);
      } else if (trialMode) {
        setAllowance({ used: 1, limit: 1, plan: "trial" });
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Growth asset package could not be generated.";
      setError(message);
      addToast("error", message);
    } finally {
      setIsLoading(false);
    }
  }

  const canGenerate = ideaText.trim().length >= 20 && selectedPlatforms.length > 0 && !isLoading && (entitlement.authenticated || !trialUsed);
  const generateDisabledReason = getGenerateDisabledReason({
    ideaText,
    selectedPlatformCount: selectedPlatforms.length,
    isLoading,
    authenticated: entitlement.authenticated,
    trialUsed,
    locale
  });
  const currentKit: ContentKit | null = outputs.length > 0
    ? {
        id: activeKitId ?? "draft-package",
        ideaText,
        goal,
        persona,
        platforms: selectedPlatforms,
        mediaAssets,
        outputs,
        status: outputs.some((output) => output.locked) ? "preview" : "saved",
        createdAt: new Date().toISOString()
      }
    : activeKitId
      ? kits.find((kit) => kit.id === activeKitId) ?? null
      : null;
  const copy = dashboardCopy[locale];

  return (
    <div className="grid gap-6 pb-10">
      <UpgradeGate open={upgradeReason !== null} locale={locale} reason={upgradeReason ?? "copy"} onClose={() => setUpgradeReason(null)} authenticated={entitlement.authenticated} />

      <section className="rounded-lg border border-hairline bg-surface p-5 shadow-panel md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-fg-muted">Workbench</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight text-fg md:text-4xl">
              {locale === "en" ? "Generate platform-native growth kits from your assets" : "从产品资产生成平台原生增长资产包"}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-fg-muted">
              {locale === "en"
                ? "This is your production hub: select assets, add media, set goals, choose platforms, generate content, review for brand compliance, and submit."
                : "这里专门负责生产：选择产品资产、补充素材、设定增长目标、选择平台、生成内容、质检并送入审核。"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-2 rounded-md border border-hairline bg-surface-2 px-3 py-2 font-semibold text-fg-muted">
              <ShieldCheck className="h-4 w-4 text-brand-strong dark:text-brand" />
              {entitlement.authenticated ? entitlement.plan : "Trial"}
            </span>
            <Link href="/packages" className="focus-ring inline-flex items-center gap-2 rounded-md border border-hairline bg-surface px-3 py-2 font-semibold text-fg">
              {locale === "en" ? "View Kits" : "查看套件"}
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(340px,0.9fr)_minmax(360px,0.95fr)_minmax(460px,1.25fr)]">
        <div className="grid content-start gap-4">
          <div className="flex items-center gap-2 px-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-fg text-xs font-semibold text-bg">1</span>
            <h2 className="text-sm font-semibold text-fg">{locale === "en" ? "Product Assets & Media" : "产品资产与素材"}</h2>
          </div>
          <IdeaInput value={ideaText} onChange={setIdeaText} locale={locale} />
          <MediaUploader assets={mediaAssets} onChange={setMediaAssets} locale={locale} />
        </div>

        <div className="grid content-start gap-4">
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

        <div className="grid content-start gap-4">
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
              className="focus-ring btn-primary inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4 text-accent" />}
              {copy.generate} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <OutputBoard outputs={outputs} isLoading={isLoading} error={error} locale={locale} canUseOutputs={entitlement.canUseOutputs} onLockedAction={setUpgradeReason} />
        </div>
      </section>

      {outputs.length > 0 && !isLoading && (
        <QualityScorePanel outputs={outputs} brain={getBrandBrain()} locale={locale} />
      )}

      <PerformancePanel kit={currentKit} locale={locale} canAnalyze={entitlement.canAnalyze} onLockedAction={setUpgradeReason} />

      <ContentOSPreview locale={locale} />

      <section className="rounded-lg border border-hairline bg-surface p-5 shadow-panel">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-fg">{outputs.some((output) => output.locked) ? copy.trialReady : copy.readyTitle}</p>
            <p className="mt-1 text-sm leading-6 text-fg-muted">
              {outputs.some((output) => output.locked) ? copy.trialDescription : copy.readyDescription}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <ReadinessCard label={copy.readinessLabels[0]} value={ideaText.trim().length + ""} ready={ideaText.trim().length >= 160} state={ideaText.trim().length >= 160 ? copy.readinessStates.ready : copy.readinessStates.improve} />
            <ReadinessCard label={copy.readinessLabels[1]} value={selectedPlatforms.length + ""} ready={selectedPlatforms.length >= 5} state={selectedPlatforms.length >= 5 ? copy.readinessStates.ready : copy.readinessStates.improve} />
            <ReadinessCard label={copy.readinessLabels[2]} value={mediaAssets.length + ""} ready={mediaAssets.length > 0} state={mediaAssets.length > 0 ? copy.readinessStates.ready : copy.readinessStates.improve} />
            <ReadinessCard label={copy.readinessLabels[3]} value={outputs.length + ""} ready={outputs.length > 0} state={outputs.length > 0 ? copy.readinessStates.ready : copy.readinessStates.waiting} />
          </div>
        </div>
      </section>
    </div>
  );
}

function ReadinessCard({ label, value, ready, state }: { label: string; value: string; ready: boolean; state: string }) {
  return (
    <div className="min-w-20 rounded-md border border-hairline bg-surface-2 p-3">
      <div className="flex items-center justify-center gap-1">
        <CheckCircle2 className={ready ? "h-3.5 w-3.5 text-brand-strong dark:text-brand" : "h-3.5 w-3.5 text-fg-muted"} />
        <p className="text-[11px] font-semibold text-fg-muted">{label}</p>
      </div>
      <p className="mt-1 text-lg font-semibold text-fg tabular">{value}</p>
      <p className={ready ? "mt-1 text-[10px] font-semibold text-brand-strong dark:text-brand" : "mt-1 text-[10px] font-semibold text-fg-muted"}>{state}</p>
    </div>
  );
}
