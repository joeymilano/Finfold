"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  AtSign,
  Building2,
  ChevronDown,
  Globe2,
  History,
  Layers3,
  Link2,
  Loader2,
  MessageSquareWarning,
  Palette,
  Save,
  Sparkles,
  Target,
  RotateCcw,
  Trash2,
  UserRound,
  Users,
  X
} from "@/components/ui/icons";
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
import { summarizeBrandMemoryVersion, type BrandMemoryVersion } from "@/lib/brand-memory-versions";
import { brandMemoryRuleFields, type BrandMemoryRuleField } from "@/lib/brand-memory-bulk";
import { PlatformMemoryManager } from "@/components/memory/PlatformMemoryManager";
import { normalizeExternalHttpUrl } from "@/lib/safe-url";

const emptyBrain: BrandBrain = {
  identityType: "personal",
  brandName: "",
  productDescription: "",
  targetAudience: "",
  toneKeywords: [],
  bannedPhrases: [],
  approvedExamples: [],
  competitors: [],
  positioningStatement: "",
  sourceUrl: "",
  socialProfiles: [],
  autoExtracted: false,
  enrichedAt: undefined,
  learnedStyle: [],
  learnedNegative: [],
  performanceRules: [],
  platformMemory: [],
  visualIdentity: {
    preferredTheme: "auto",
    styleKeywords: [],
    avoidStyles: [],
    palette: { primary: "", accent: "", background: "" },
    referenceImageUrls: [],
    learnedPreferences: []
  }
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
  const [visualKeywordInput, setVisualKeywordInput] = useState("");
  const [avoidVisualInput, setAvoidVisualInput] = useState("");
  const [referenceImageInput, setReferenceImageInput] = useState("");
  const [bootstrapUrl, setBootstrapUrl] = useState("");
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [socialUrl, setSocialUrl] = useState("");
  const [socialError, setSocialError] = useState<string | null>(null);
  const [importingSocial, setImportingSocial] = useState(false);
  const [urlBootstrapAvailable, setUrlBootstrapAvailable] = useState(false);
  const [versions, setVersions] = useState<BrandMemoryVersion[]>([]);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [selectedLearnedRules, setSelectedLearnedRules] = useState<Set<string>>(new Set());
  const [removingLearnedRules, setRemovingLearnedRules] = useState(false);

  const t = locale === "en" ? {
    eyebrow: "Brand Memory",
    title: "Teach Finfold who you are and how you communicate",
    status: "Connected to Workbench",
    save: "Save Memory",
    saving: "Saving...",
    savedAccount: "Brand memory saved to your account.",
    savedLocal: "Brand memory saved locally. Log in to sync it across devices.",
    positioning: "One-line positioning",
    audience: "Target audience",
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
    identityTitle: "Who does this memory represent?",
    identityDesc: "Choose the closest fit. You can change it later without losing anything.",
    identityPersonal: "Personal IP",
    identityPersonalDesc: "You are the identity: creator, expert, consultant, or public voice.",
    identityBrand: "Brand / product",
    identityBrandDesc: "A company, organization, product, service, or project.",
    identityHybrid: "Person + brand",
    identityHybridDesc: "A founder-led brand where the person and offering reinforce each other.",
    sourcesTitle: "Start from existing sources",
    sourcesOptional: "Optional · skip anytime",
    sourcesConnected: "sources added",
    sourcesDesc: "Add a public social profile or website to reduce typing. These are reference links, not account bindings.",
    socialTitle: "Social profile",
    socialDesc: "Add your own public profile. If it is readable, Finfold can pull the bio and visible voice into the fields below.",
    socialPh: "Paste a Xiaohongshu, Zhihu, LinkedIn, X, Instagram… profile URL",
    socialCta: "Add profile",
    socialImporting: "Reading profile...",
    socialAdded: "Profile added as an optional reference.",
    socialImported: "Profile imported — review the memory below.",
    socialInvalid: "Enter a valid public social profile URL.",
    socialRemove: "Remove profile",
    websiteTitle: "Website",
    websiteDesc: "Have a homepage, portfolio, product page, or newsletter? Import it. No website is completely fine.",
    bootstrapPh: "https://your-site.com",
    bootstrapCta: "Import",
    bootstrapping: "Reading page...",
    bootstrapLocked: "Requires Pro plan or above.",
    bootstrapApplied: "Website imported — review the fields below, then save.",
    bootstrapInvalid: "Enter a valid website address, for example https://finfold.app.",
    visualTitle: "Visual identity (optional)",
    visualDesc: "Finfold uses this quietly across covers, carousels, and article illustrations. Leave it on Auto if you do not have a system yet.",
    preferredTheme: "Default visual system",
    visualAuto: "Auto — decide from each piece",
    visualStyle: "Visual style words",
    visualStylePh: "e.g. editorial, tactile, cinematic",
    visualAvoid: "Visual styles to avoid",
    visualAvoidPh: "e.g. glossy 3D, stock-photo corporate",
    palette: "Brand palette",
    referenceImages: "Reference image URLs",
    referenceImagesPh: "https://…/brand-reference.jpg",
    addReference: "Add reference",
    invalidReference: "Enter a public http(s) image URL.",
    clearPalette: "Clear palette",
    visualLearned: "Learned from published performance",
    historyTitle: "Version history",
    historyDesc: "Every saved memory snapshot is retained. Restoring one creates a new version.",
    restoreVersion: "Restore this version",
    restoringVersion: "Restoring...",
    restoredVersion: "Brand Memory version restored.",
    currentVersion: "Current",
    learnedTitle: "Learned guidance",
    learnedDesc: "These rules came from your edits and adopted performance findings. Remove only the rules you no longer want applied.",
    learnedEmpty: "No learned rules yet.",
    learnedStyle: "Writing habits",
    learnedNegative: "Patterns to avoid",
    performanceRules: "Adopted performance rules",
    removeSelected: "Remove selected",
    removingSelected: "Removing...",
    removedSelected: (count: number) => `Removed ${count} learned ${count === 1 ? "rule" : "rules"}.`
  } : {
    eyebrow: "品牌记忆",
    title: "让 Finfold 记住你是谁，以及你如何表达",
    status: "已连接创作台",
    save: "保存记忆",
    saving: "保存中...",
    savedAccount: "品牌记忆已保存到账号。",
    savedLocal: "品牌记忆已保存到本地。登录后可跨设备同步。",
    positioning: "一句话定位",
    audience: "目标用户",
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
    identityTitle: "这份记忆代表谁？",
    identityDesc: "选择最接近你的类型，之后随时可以切换，已有内容不会丢失。",
    identityPersonal: "个人 IP",
    identityPersonalDesc: "你本人就是核心：创作者、专家、顾问、博主或公众表达者。",
    identityBrand: "品牌 / 产品",
    identityBrandDesc: "公司、组织、产品、服务、项目或独立品牌。",
    identityHybrid: "个人 + 品牌",
    identityHybridDesc: "主理人与品牌共同成长，个人影响力和业务相互增强。",
    sourcesTitle: "从已有内容开始",
    sourcesOptional: "可选 · 随时跳过",
    sourcesConnected: "个来源",
    sourcesDesc: "可添加公开社交主页或网站来减少填写。这些只是参考链接，不会绑定或控制你的账号。",
    socialTitle: "社交媒体主页",
    socialDesc: "添加你自己的公开主页；页面可读取时，Finfold 会提取简介和公开表达风格填入下方。",
    socialPh: "粘贴小红书、知乎、抖音、微博、B站、LinkedIn 等主页链接",
    socialCta: "添加主页",
    socialImporting: "正在读取主页...",
    socialAdded: "主页已作为可选参考源添加。",
    socialImported: "主页资料已导入，请检查下方记忆。",
    socialInvalid: "请输入有效的公开社交主页链接。",
    socialRemove: "移除主页",
    websiteTitle: "网站或作品页",
    websiteDesc: "如果你有官网、作品集、产品页或 Newsletter，可以导入；没有网站完全没关系。",
    bootstrapPh: "https://你的网址.com",
    bootstrapCta: "导入",
    bootstrapping: "正在读取网页...",
    bootstrapLocked: "需要 Pro 及以上套餐。",
    bootstrapApplied: "网站已导入，请检查下方字段后保存。",
    bootstrapInvalid: "请输入有效的网址，例如 https://finfold.app。",
    visualTitle: "品牌视觉身份（可选）",
    visualDesc: "Finfold 会在封面、图文组和文章配图中安静地复用这些偏好；暂时没有视觉规范时保持自动即可。",
    preferredTheme: "默认视觉系统",
    visualAuto: "自动 · 根据每篇内容判断",
    visualStyle: "视觉风格关键词",
    visualStylePh: "如：编辑感、纸张质感、电影光影",
    visualAvoid: "不要使用的视觉风格",
    visualAvoidPh: "如：廉价 3D、商务图库感",
    palette: "品牌色板",
    referenceImages: "参考图片网址",
    referenceImagesPh: "https://…/品牌参考图.jpg",
    addReference: "添加参考图",
    invalidReference: "请输入公开可访问的 http(s) 图片网址。",
    clearPalette: "清除色板",
    visualLearned: "从发布表现中学到",
    historyTitle: "版本历史",
    historyDesc: "每次真实保存都会保留快照；恢复也会创建新的版本记录。",
    restoreVersion: "恢复此版本",
    restoringVersion: "恢复中...",
    restoredVersion: "已恢复品牌记忆版本。",
    currentVersion: "当前",
    learnedTitle: "已学习的规则",
    learnedDesc: "这些规则来自你的编辑和已采纳的表现结论；只移除你不再希望继续沿用的规则。",
    learnedEmpty: "暂时还没有学习规则。",
    learnedStyle: "写作习惯",
    learnedNegative: "避免的模式",
    performanceRules: "已采纳的表现规则",
    removeSelected: "移除所选",
    removingSelected: "正在移除...",
    removedSelected: (count: number) => `已移除 ${count} 条学习规则。`
  };

  const fieldCopy = getIdentityFieldCopy(locale, brain.identityType);

  const loadVersions = useCallback(async () => {
    try {
      const response = await fetch("/api/brand-brain/versions", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { versions?: BrandMemoryVersion[] };
      if (!response.ok) return;
      setVersions(data.versions ?? []);
    } catch {
      // Brand Memory remains usable if history is unavailable during rollout.
    }
  }, []);

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

    fetch("/api/entitlements/check", { method: "POST", cache: "no-store" })
      .then((res) => res.json())
      .then((data: { urlBootstrap?: boolean }) => {
        if (alive) setUrlBootstrapAvailable(Boolean(data.urlBootstrap));
      })
      .catch(() => undefined);

    void loadVersions();

    return () => {
      alive = false;
    };
  }, [loadVersions]);

  const importFromUrl = useCallback(async (rawUrl: string, sourceType: "website" | "social") => {
    const url = normalizeExternalHttpUrl(rawUrl);
    if (!url) return false;

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Unsupported protocol");
    } catch {
      if (sourceType === "social") setSocialError(t.socialInvalid);
      else setBootstrapError(t.bootstrapInvalid);
      return false;
    }

    if (sourceType === "social") {
      setImportingSocial(true);
      setSocialError(null);
    } else {
      setBootstrapping(true);
      setBootstrapError(null);
      setBootstrapUrl(url);
    }

    try {
      const response = await fetch("/api/brand-brain/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({ url, sourceType, identityType: brain.identityType })
      });
      const data = (await response.json()) as { brain?: BrandBrain; error?: string };

      if (!response.ok || !data.brain) {
        throw new Error(data.error ?? "Failed to import from that URL.");
      }

      // Merge onto the existing brain rather than replacing it outright —
      // fields the extraction couldn't confidently fill come back empty,
      // and an empty string should not blank out something the user
      // already typed in by hand.
      setBrain((current) => ({
        ...current,
        brandName: data.brain!.brandName || current.brandName,
        productDescription: data.brain!.productDescription || current.productDescription,
        targetAudience: data.brain!.targetAudience || current.targetAudience,
        toneKeywords: data.brain!.toneKeywords.length > 0 ? data.brain!.toneKeywords : current.toneKeywords,
        positioningStatement: data.brain!.positioningStatement || current.positioningStatement,
        sourceUrl: sourceType === "website" ? data.brain!.sourceUrl : current.sourceUrl,
        socialProfiles: sourceType === "social"
          ? current.socialProfiles.map((profile) => profile.url === url ? { ...profile, importedAt: new Date().toISOString() } : profile)
          : current.socialProfiles,
        autoExtracted: true,
        enrichedAt: data.brain!.enrichedAt
      }));
      addToast("success", sourceType === "social" ? t.socialImported : t.bootstrapApplied);
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to import from that URL.";
      if (sourceType === "social") setSocialError(message);
      else setBootstrapError(message);
      addToast(sourceType === "social" ? "warning" : "error", message);
      return false;
    } finally {
      if (sourceType === "social") setImportingSocial(false);
      else setBootstrapping(false);
    }
  }, [brain.identityType, t.bootstrapApplied, t.bootstrapInvalid, t.socialImported, t.socialInvalid]);

  const handleBootstrap = useCallback(async () => {
    await importFromUrl(bootstrapUrl, "website");
  }, [bootstrapUrl, importFromUrl]);

  const handleSocialProfile = useCallback(async () => {
    const url = normalizeExternalHttpUrl(socialUrl);
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Unsupported protocol");
    } catch {
      setSocialError(t.socialInvalid);
      return;
    }

    const alreadyAdded = brain.socialProfiles.some((profile) => profile.url === url);
    if (!alreadyAdded) {
      setBrain((current) => ({
        ...current,
        socialProfiles: [
          ...current.socialProfiles,
          {
            id: crypto.randomUUID(),
            platform: detectSocialPlatform(url),
            url,
            handle: socialHandleFromUrl(url)
          }
        ].slice(0, 8)
      }));
    }
    setSocialUrl("");
    setSocialError(null);

    if (!urlBootstrapAvailable) {
      addToast("success", t.socialAdded);
      return;
    }
    await importFromUrl(url, "social");
  }, [brain.socialProfiles, importFromUrl, socialUrl, t.socialAdded, t.socialInvalid, urlBootstrapAvailable]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    saveBrandBrain(brain);
    try {
      const { brain: savedBrain, persisted } = await savePersistedBrandBrain(brain);
      setBrain(savedBrain);
      void loadVersions();
      addToast("success", persisted ? t.savedAccount : t.savedLocal);
    } catch {
      addToast("warning", t.savedLocal);
    } finally {
      setSaving(false);
    }
  }, [brain, loadVersions, t.savedAccount, t.savedLocal]);

  const restoreVersion = useCallback(async (versionId: string) => {
    setRestoringVersionId(versionId);
    try {
      const response = await fetch(`/api/brand-brain/versions/${encodeURIComponent(versionId)}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedLatestVersionId: versions[0]?.id ?? null })
      });
      const data = (await response.json().catch(() => ({}))) as { restored?: boolean; brain?: BrandBrain; error?: string };
      if (!response.ok || !data.restored || !data.brain) throw new Error(data.error ?? "Unable to restore this version.");
      setBrain(data.brain);
      saveBrandBrain(data.brain);
      await loadVersions();
      addToast("success", t.restoredVersion);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to restore this version.");
    } finally {
      setRestoringVersionId(null);
    }
  }, [loadVersions, t.restoredVersion, versions]);

  const completeness = getBrainCompleteness(brain);
  const sourceCount = brain.socialProfiles.length + (brain.sourceUrl ? 1 : 0);
  const learnedRuleGroups: Array<{ field: BrandMemoryRuleField; label: string; values: string[] }> = [
    { field: "learnedStyle" as const, label: t.learnedStyle, values: brain.learnedStyle },
    { field: "learnedNegative" as const, label: t.learnedNegative, values: brain.learnedNegative },
    { field: "performanceRules" as const, label: t.performanceRules, values: brain.performanceRules }
  ].filter((group) => group.values.length > 0);

  function learnedRuleKey(field: BrandMemoryRuleField, value: string) {
    return `${field}:${value}`;
  }

  function toggleLearnedRule(field: BrandMemoryRuleField, value: string) {
    const key = learnedRuleKey(field, value);
    setSelectedLearnedRules((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function removeSelectedLearnedRules() {
    if (selectedLearnedRules.size === 0 || removingLearnedRules) return;
    const remove = Object.fromEntries(brandMemoryRuleFields.map((field) => [
      field,
      brain[field].filter((value) => selectedLearnedRules.has(learnedRuleKey(field, value)))
    ])) as Record<BrandMemoryRuleField, string[]>;
    setRemovingLearnedRules(true);
    try {
      const response = await fetch("/api/brand-brain/learned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remove })
      });
      const data = (await response.json().catch(() => ({}))) as { brain?: BrandBrain; removedCount?: number; error?: string };
      if (!response.ok || !data.brain || !data.removedCount) throw new Error(data.error ?? "Unable to remove learned rules.");
      setBrain(data.brain);
      saveBrandBrain(data.brain);
      setSelectedLearnedRules(new Set());
      void loadVersions();
      addToast("success", t.removedSelected(data.removedCount));
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to remove learned rules.");
    } finally {
      setRemovingLearnedRules(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1180px] gap-4 pb-16 lg:pb-10">
      <section className="panel overflow-hidden p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">{t.eyebrow}</p>
            <h1 className="mt-2 max-w-3xl text-balance text-3xl font-black leading-tight text-fg xl:text-4xl">
              {t.title}
            </h1>
          </div>
          <div className="hidden shrink-0 items-center gap-3 lg:flex">
            <span
              aria-label={`${t.completeness}: ${completeness}%`}
              title={t.completeness}
              className="min-w-16 text-right text-3xl font-black tabular text-fg"
            >
              {completeness}%
            </span>
            <button type="button" onClick={() => void handleSave()} disabled={!loaded || saving} className="focus-ring inline-flex min-h-10 min-w-36 items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-4 py-2.5 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] disabled:opacity-60 dark:text-action">
              <Save className="h-4 w-4" />
              {saving ? t.saving : t.save}
            </button>
          </div>
        </div>
      </section>

      {versions.length > 0 ? (
        <section className="panel p-4 md:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-action/[0.1] text-action-strong dark:text-action">
              <History className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-fg">{t.historyTitle}</h2>
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">{t.historyDesc}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {versions.map((version, index) => (
              <div key={version.id} className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-2/45 px-3 py-2.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-fg">{summarizeBrandMemoryVersion(version.brain)}</p>
                  <p className="mt-0.5 text-[10px] text-fg-muted">
                    {new Date(version.createdAt).toLocaleString(locale === "en" ? "en-US" : "zh-CN")}
                    {index === 0 ? ` · ${t.currentVersion}` : ""}
                  </p>
                </div>
                {index > 0 ? (
                  <button
                    type="button"
                    onClick={() => void restoreVersion(version.id)}
                    disabled={restoringVersionId !== null}
                    className="focus-ring inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-hairline px-2.5 text-[11px] font-bold text-fg-muted transition hover:border-action/45 hover:text-action-strong disabled:opacity-50 dark:hover:text-action"
                  >
                    {restoringVersionId === version.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    {restoringVersionId === version.id ? t.restoringVersion : t.restoreVersion}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel p-4 md:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-positive/10 text-positive">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-fg">{t.learnedTitle}</h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">{t.learnedDesc}</p>
          </div>
        </div>
        {learnedRuleGroups.length === 0 ? (
          <p className="mt-3 text-xs text-fg-muted">{t.learnedEmpty}</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {learnedRuleGroups.map((group) => (
              <div key={group.field}>
                <p className="text-[10px] font-black uppercase tracking-wide text-fg-muted">{group.label}</p>
                <div className="mt-1.5 grid gap-1.5">
                  {group.values.map((value) => {
                    const key = learnedRuleKey(group.field, value);
                    return (
                      <label key={key} className="flex cursor-pointer items-start gap-2 rounded-md border border-hairline bg-surface-2/45 px-2.5 py-2 text-xs leading-5 text-fg-muted">
                        <input
                          type="checkbox"
                          checked={selectedLearnedRules.has(key)}
                          onChange={() => toggleLearnedRule(group.field, value)}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-action"
                        />
                        <span>{value}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => void removeSelectedLearnedRules()}
              disabled={selectedLearnedRules.size === 0 || removingLearnedRules}
              className="focus-ring inline-flex min-h-9 w-fit items-center gap-2 rounded-lg border border-risk/35 px-3 text-xs font-bold text-risk transition hover:bg-risk/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {removingLearnedRules ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {removingLearnedRules ? t.removingSelected : t.removeSelected}
            </button>
          </div>
        )}
      </section>

      <PlatformMemoryManager brain={brain} locale={locale} onChange={setBrain} />

      <section className="panel p-4 md:p-5">
        <div>
          <h2 className="text-sm font-black text-fg">{t.identityTitle}</h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">{t.identityDesc}</p>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {([
            { id: "personal" as const, label: t.identityPersonal, desc: t.identityPersonalDesc, icon: UserRound },
            { id: "brand" as const, label: t.identityBrand, desc: t.identityBrandDesc, icon: Building2 },
            { id: "hybrid" as const, label: t.identityHybrid, desc: t.identityHybridDesc, icon: Layers3 }
          ]).map((option) => {
            const Icon = option.icon;
            const selected = brain.identityType === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setBrain((current) => ({ ...current, identityType: option.id }))}
                className={`focus-ring group flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${selected ? "border-action/60 bg-action/[0.08]" : "border-hairline bg-surface-2/45 hover:border-action/35 hover:bg-action/[0.035]"}`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${selected ? "bg-action text-on-action" : "bg-surface text-fg-muted group-hover:text-action-strong dark:group-hover:text-action"}`}>
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-fg">{option.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-fg-muted">{option.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <details className="panel group overflow-hidden">
        <summary className="focus-ring flex cursor-pointer list-none items-center gap-3 p-4 md:px-5 [&::-webkit-details-marker]:hidden">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-action/[0.1] text-action-strong dark:text-action">
            <Link2 className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-fg">{t.sourcesTitle}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">{t.sourcesDesc}</span>
          </span>
          <span className="hidden shrink-0 rounded-full bg-positive/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-positive sm:inline">
            {sourceCount > 0 ? `${sourceCount} ${t.sourcesConnected}` : t.sourcesOptional}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180" />
        </summary>

        <div className="grid gap-4 border-t border-hairline p-4 md:p-5 lg:grid-cols-2">
          <div className="rounded-xl border border-hairline bg-surface-2/45 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent"><AtSign className="h-4 w-4" /></span>
              <div>
                <h3 className="text-sm font-bold text-fg">{t.socialTitle}</h3>
                <p className="mt-1 text-xs leading-5 text-fg-muted">{t.socialDesc}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                placeholder={t.socialPh}
                value={socialUrl}
                onChange={(event) => setSocialUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSocialProfile();
                  }
                }}
                disabled={importingSocial || brain.socialProfiles.length >= 8}
                className="field-input min-w-0 flex-1 disabled:opacity-50"
              />
              <button type="button" onClick={() => void handleSocialProfile()} disabled={importingSocial || !socialUrl.trim() || brain.socialProfiles.length >= 8} className="btn-ghost shrink-0 justify-center disabled:opacity-50">
                {importingSocial ? <Loader2 className="h-4 w-4 animate-spin" /> : <AtSign className="h-4 w-4" />}
                {importingSocial ? t.socialImporting : t.socialCta}
              </button>
            </div>
            {socialError ? <p className="mt-2 text-xs font-medium text-warn">{socialError}</p> : null}
            {brain.socialProfiles.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {brain.socialProfiles.map((profile) => (
                  <div key={profile.id} className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-action/[0.1] text-action-strong dark:text-action"><AtSign className="h-3.5 w-3.5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-fg">{socialPlatformLabel(profile.platform, locale)}{profile.handle ? ` · ${profile.handle}` : ""}</p>
                      <p className="truncate text-[10px] text-fg-muted">{profile.url}</p>
                    </div>
                    {profile.importedAt ? <span className="hidden rounded-full bg-positive/10 px-2 py-0.5 text-[9px] font-bold text-positive sm:inline">{locale === "en" ? "Imported" : "已读取"}</span> : null}
                    <button type="button" aria-label={t.socialRemove} onClick={() => setBrain((current) => ({ ...current, socialProfiles: current.socialProfiles.filter((item) => item.id !== profile.id) }))} className="focus-ring rounded-md p-1.5 text-fg-muted hover:bg-risk/10 hover:text-risk">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-hairline bg-surface-2/45 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-action/[0.1] text-action-strong dark:text-action"><Globe2 className="h-4 w-4" /></span>
              <div>
                <h3 className="text-sm font-bold text-fg">{t.websiteTitle}</h3>
                <p className="mt-1 text-xs leading-5 text-fg-muted">{t.websiteDesc}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                placeholder={t.bootstrapPh}
                value={bootstrapUrl}
                onChange={(event) => setBootstrapUrl(event.target.value)}
                onBlur={() => setBootstrapUrl((current) => normalizeExternalHttpUrl(current))}
                disabled={!urlBootstrapAvailable || bootstrapping}
                className="field-input min-w-0 flex-1 disabled:opacity-50"
              />
              <button type="button" onClick={() => void handleBootstrap()} disabled={!urlBootstrapAvailable || bootstrapping || !bootstrapUrl.trim()} title={!urlBootstrapAvailable ? t.bootstrapLocked : undefined} className="btn-ghost shrink-0 justify-center disabled:opacity-50">
                {bootstrapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
                {bootstrapping ? t.bootstrapping : t.bootstrapCta}
              </button>
            </div>
            {!urlBootstrapAvailable ? <p className="mt-2 text-xs font-medium text-warn">{t.bootstrapLocked}</p> : bootstrapError ? <p className="mt-2 text-xs font-medium text-risk">{bootstrapError}</p> : null}
          </div>
        </div>
      </details>

      <section className="panel p-5 md:p-6">
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={fieldCopy.name}>
                <input
                  type="text"
                  placeholder={fieldCopy.namePh}
                  value={brain.brandName}
                  onChange={(event) => setBrain((current) => ({ ...current, brandName: event.target.value }))}
                  className="field-input"
                />
              </Field>
              <Field label={t.positioning}>
                <input
                  type="text"
                  placeholder={fieldCopy.positioningPh}
                  value={brain.positioningStatement}
                  onChange={(event) => setBrain((current) => ({ ...current, positioningStatement: event.target.value }))}
                  className="field-input"
                />
              </Field>
            </div>

            <details className="group rounded-lg border border-action/20 bg-action/[0.035]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3">
                <span className="flex min-w-0 items-start gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-action/[0.1] text-action-strong dark:text-action"><Palette className="h-4 w-4" /></span>
                  <span>
                    <span className="block text-xs font-black uppercase tracking-wide text-fg">{t.visualTitle}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-fg-muted">{t.visualDesc}</span>
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted transition group-open:rotate-180" />
              </summary>
              <div className="grid gap-4 border-t border-action/10 p-3 sm:p-4">
                <Field label={t.preferredTheme}>
                  <select
                    value={brain.visualIdentity.preferredTheme}
                    onChange={(event) => setBrain((current) => ({ ...current, visualIdentity: { ...current.visualIdentity, preferredTheme: event.target.value as BrandBrain["visualIdentity"]["preferredTheme"] } }))}
                    className="field-input"
                  >
                    <option value="auto">{t.visualAuto}</option>
                    <option value="editorial">Editorial · {locale === "en" ? "warm publication" : "温暖编辑部"}</option>
                    <option value="signal">Signal · {locale === "en" ? "high-contrast system" : "高对比信息系统"}</option>
                    <option value="field-notes">Field notes · {locale === "en" ? "human and tactile" : "真实手记感"}</option>
                  </select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <TagInput
                    label={t.visualStyle}
                    placeholder={t.visualStylePh}
                    icon={<Sparkles className="h-3.5 w-3.5 text-action-strong dark:text-action" />}
                    tags={brain.visualIdentity.styleKeywords}
                    inputValue={visualKeywordInput}
                    onInputChange={setVisualKeywordInput}
                    onAdd={(value) => setBrain((current) => ({ ...current, visualIdentity: { ...current.visualIdentity, styleKeywords: [...current.visualIdentity.styleKeywords, value].slice(0, 8) } }))}
                    onRemove={(index) => setBrain((current) => ({ ...current, visualIdentity: { ...current.visualIdentity, styleKeywords: current.visualIdentity.styleKeywords.filter((_, i) => i !== index) } }))}
                  />
                  <TagInput
                    label={t.visualAvoid}
                    placeholder={t.visualAvoidPh}
                    icon={<MessageSquareWarning className="h-3.5 w-3.5 text-risk" />}
                    tags={brain.visualIdentity.avoidStyles}
                    inputValue={avoidVisualInput}
                    onInputChange={setAvoidVisualInput}
                    onAdd={(value) => setBrain((current) => ({ ...current, visualIdentity: { ...current.visualIdentity, avoidStyles: [...current.visualIdentity.avoidStyles, value].slice(0, 8) } }))}
                    onRemove={(index) => setBrain((current) => ({ ...current, visualIdentity: { ...current.visualIdentity, avoidStyles: current.visualIdentity.avoidStyles.filter((_, i) => i !== index) } }))}
                  />
                </div>

                <Field label={t.palette}>
                  <div className="grid grid-cols-3 gap-2">
                    {(["primary", "accent", "background"] as const).map((role) => (
                      <label key={role} className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-2.5 py-2">
                        <input
                          type="color"
                          value={brain.visualIdentity.palette[role] || (role === "primary" ? "#171714" : role === "accent" ? "#f05a2a" : "#f3efe3")}
                          onChange={(event) => setBrain((current) => ({ ...current, visualIdentity: { ...current.visualIdentity, palette: { ...current.visualIdentity.palette, [role]: event.target.value } } }))}
                          className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                        <span className="min-w-0 truncate text-[10px] font-bold capitalize text-fg-muted">{role}</span>
                      </label>
                    ))}
                  </div>
                  {Object.values(brain.visualIdentity.palette).some(Boolean) ? (
                    <button type="button" onClick={() => setBrain((current) => ({ ...current, visualIdentity: { ...current.visualIdentity, palette: { primary: "", accent: "", background: "" } } }))} className="focus-ring mt-2 rounded px-1 py-1 text-[10px] font-bold text-fg-muted hover:text-action-strong dark:hover:text-action">{t.clearPalette}</button>
                  ) : null}
                </Field>

                <Field label={t.referenceImages}>
                  <div className="flex gap-2">
                    <input value={referenceImageInput} onChange={(event) => setReferenceImageInput(event.target.value)} placeholder={t.referenceImagesPh} className="field-input min-w-0 flex-1" />
                    <button
                      type="button"
                      className="btn-ghost shrink-0"
                      onClick={() => {
                        const normalized = normalizeExternalHttpUrl(referenceImageInput);
                        if (!normalized || brain.visualIdentity.referenceImageUrls.includes(normalized)) {
                          if (!normalized) addToast("warning", t.invalidReference);
                          return;
                        }
                        setBrain((current) => ({ ...current, visualIdentity: { ...current.visualIdentity, referenceImageUrls: [...current.visualIdentity.referenceImageUrls, normalized].slice(0, 4) } }));
                        setReferenceImageInput("");
                      }}
                    >{t.addReference}</button>
                  </div>
                  {brain.visualIdentity.referenceImageUrls.length > 0 ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {brain.visualIdentity.referenceImageUrls.map((url, index) => (
                        <div key={url} className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-2.5 py-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="h-8 w-8 rounded-md object-cover" />
                          <span className="min-w-0 flex-1 truncate text-[10px] text-fg-muted">{url}</span>
                          <button type="button" aria-label={t.socialRemove} onClick={() => setBrain((current) => ({ ...current, visualIdentity: { ...current.visualIdentity, referenceImageUrls: current.visualIdentity.referenceImageUrls.filter((_, i) => i !== index) } }))} className="rounded p-1 text-fg-muted hover:bg-surface-2 hover:text-fg"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Field>
                {brain.visualIdentity.learnedPreferences.length > 0 ? (
                  <div className="rounded-xl border border-positive/20 bg-positive/[0.055] p-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-positive">{t.visualLearned}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {brain.visualIdentity.learnedPreferences.map((preference) => (
                        <span key={preference.platform} className="rounded-full border border-positive/15 bg-surface px-2.5 py-1 text-[10px] font-bold text-fg-muted">
                          {preference.platform} · {preference.theme} · +{preference.liftPercent}% · n={preference.sampleSize}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>

            <Field label={fieldCopy.description}>
              <textarea
                rows={4}
                placeholder={fieldCopy.descriptionPh}
                value={brain.productDescription}
                onChange={(event) => setBrain((current) => ({ ...current, productDescription: event.target.value }))}
                className="field-input resize-none"
              />
            </Field>

            <Field label={fieldCopy.audience} icon={<Target className="h-4 w-4 text-accent" />}>
              <textarea
                rows={3}
                placeholder={fieldCopy.audiencePh}
                value={brain.targetAudience}
                onChange={(event) => setBrain((current) => ({ ...current, targetAudience: event.target.value }))}
                className="field-input resize-none"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <TagInput
                label={t.tone}
                placeholder={t.tonePh}
                icon={<Sparkles className="h-3.5 w-3.5 text-action-strong dark:text-action" />}
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
            </div>

            {/* 竞品与示例为可选项，默认收起，缩短首屏 */}
            <details className="group rounded-lg border border-hairline bg-surface-2/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-fg-muted">
                <span>{locale === "en" ? "More (optional): competitors & examples" : "更多（可选）：竞品与示例"}</span>
                <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
              </summary>
              <div className="grid gap-4 p-3">
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
            </details>
          </div>
      </section>

      {/* 移动端吸底保存栏：保存键常驻拇指区 */}
      <div className="fixed inset-x-0 bottom-16 z-30 flex items-center gap-3 border-t border-hairline bg-surface/95 px-3 py-2.5 backdrop-blur-xl lg:hidden">
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-xs font-bold text-fg">{t.completeness} · {completeness}%</p>
          <p className="truncate text-[11px] font-semibold text-fg-muted">{t.status}</p>
        </div>
        <button type="button" onClick={() => void handleSave()} disabled={!loaded || saving} className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-5 py-2.5 text-sm font-semibold text-action-strong transition hover:bg-action/[0.14] disabled:opacity-60 dark:text-action">
          <Save className="h-4 w-4" />
          {saving ? t.saving : t.save}
        </button>
      </div>
    </div>
  );
}

function getIdentityFieldCopy(locale: "zh" | "en", identityType: BrandBrain["identityType"]) {
  if (locale === "en") {
    if (identityType === "personal") return {
      name: "Your name / IP name",
      namePh: "e.g. The Solo Builder or Creator Wang",
      positioningPh: "e.g. I help independent creators turn expertise into repeatable content",
      description: "Expertise and value",
      descriptionPh: "What do you know deeply? What do you help people do? Why should they listen to you?",
      audience: "People you want to reach",
      audiencePh: "e.g. independent creators, early-stage founders, designers changing careers"
    };
    if (identityType === "hybrid") return {
      name: "Your name + brand",
      namePh: "e.g. Creator Wang · North Studio",
      positioningPh: "e.g. A founder building the content operating system I wish I had",
      description: "What you and the brand offer",
      descriptionPh: "What do you stand for personally, what does the brand provide, and how do the two connect?",
      audience: "Community and customers",
      audiencePh: "Who follows you, who buys from the brand, and where do those groups overlap?"
    };
    return {
      name: "Brand / product name",
      namePh: "e.g. Finfold",
      positioningPh: "e.g. The AI content workspace for lean product teams",
      description: "Offering / product",
      descriptionPh: "What does it do? Who is it for? What makes it different?",
      audience: "Target audience",
      audiencePh: "e.g. solo founders, small SaaS teams, launch marketers"
    };
  }

  if (identityType === "personal") return {
    name: "你的名字 / IP 名称",
    namePh: "如：独立开发者老王、设计博主老张",
    positioningPh: "如：帮助独立创作者把专业经验变成持续内容",
    description: "你的专长与价值",
    descriptionPh: "你长期研究什么？能帮助别人解决什么问题？为什么值得关注你？",
    audience: "你想影响的人",
    audiencePh: "如：独立创作者、早期创业者、想转型的设计师"
  };
  if (identityType === "hybrid") return {
    name: "你的名字 + 品牌",
    namePh: "如：老王 · 构建者工作室",
    positioningPh: "如：一边做产品，一边分享小团队如何建立内容增长系统",
    description: "你与品牌共同提供的价值",
    descriptionPh: "你个人代表什么？品牌提供什么？两者如何相互支撑？",
    audience: "你的社群与客户",
    audiencePh: "谁关注你、谁购买品牌，以及这两群人的交集是什么？"
  };
  return {
    name: "品牌 / 产品名称",
    namePh: "如：Finfold",
    positioningPh: "如：给小团队用的 AI 内容创作工作台",
    description: "产品 / 服务说明",
    descriptionPh: "提供什么？给谁用？和别人有什么不一样？",
    audience: "目标用户",
    audiencePh: "如：独立开发者、小型 SaaS 团队、出海创业者"
  };
}

function detectSocialPlatform(url: string): BrandBrain["socialProfiles"][number]["platform"] {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("xiaohongshu") || host.includes("xhslink")) return "xiaohongshu";
  if (host.includes("zhihu")) return "zhihu";
  if (host.includes("douyin")) return "douyin";
  if (host.includes("weixin") || host.includes("wechat")) return "wechat";
  if (host.includes("weibo")) return "weibo";
  if (host.includes("bilibili")) return "bilibili";
  if (host.includes("linkedin")) return "linkedin";
  if (host === "x.com" || host.endsWith(".x.com") || host.includes("twitter")) return "x";
  if (host.includes("instagram")) return "instagram";
  if (host.includes("youtube") || host.includes("youtu.be")) return "youtube";
  return "other";
}

function socialHandleFromUrl(url: string): string {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  const candidate = segments.at(-1) ?? "";
  return candidate.length <= 80 && !/^\d{12,}$/.test(candidate) ? decodeURIComponent(candidate) : "";
}

function socialPlatformLabel(platform: BrandBrain["socialProfiles"][number]["platform"], locale: "zh" | "en"): string {
  const labels = {
    xiaohongshu: "小红书",
    zhihu: "知乎",
    douyin: "抖音",
    wechat: locale === "en" ? "WeChat" : "微信",
    weibo: "微博",
    bilibili: "Bilibili",
    linkedin: "LinkedIn",
    x: "X",
    instagram: "Instagram",
    youtube: "YouTube",
    other: locale === "en" ? "Social profile" : "社交主页"
  } as const;
  return labels[platform];
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
          <span key={tag + index} className="inline-flex items-center gap-1 rounded-md bg-action/[0.1] px-2 py-1 text-xs font-semibold text-action-strong dark:text-action">
            {tag}
            <button type="button" onClick={() => onRemove(index)} className="rounded-sm hover:bg-action/20">
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
