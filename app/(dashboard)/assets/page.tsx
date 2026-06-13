"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Library, Plus, ShieldCheck, Trash2, X, Sparkles } from "lucide-react";
import { useState } from "react";
import { assetLibrary as initialAssetLibrary, platformOps } from "@/lib/ops-data";
import { useLocale } from "@/hooks/useLocale";

type Asset = {
  name: string;
  type: string;
  freshness: string;
  guardrail: string;
};

export default function AssetsPage() {
  const locale = useLocale();
  const [assets, setAssets] = useState<Asset[]>([
    ...initialAssetLibrary.map((a) => ({
      name: locale === "en" ? a.nameEn : a.name,
      type: locale === "en" ? a.typeEn : a.type,
      freshness: locale === "en" ? a.freshnessEn : a.freshness,
      guardrail: locale === "en" ? a.guardrailEn : a.guardrail,
    }))
  ]);
  const [isOpen, setIsOpen] = useState(false);
  const [newAsset, setNewAsset] = useState<Asset>({
    name: "",
    type: locale === "en" ? "Positioning" : "产品定位",
    freshness: "100%",
    guardrail: ""
  });

  function handleAddAsset(e: React.FormEvent) {
    e.preventDefault();
    if (!newAsset.name.trim() || !newAsset.guardrail.trim()) return;

    setAssets((current) => [
      {
        ...newAsset,
        freshness: "100%"
      },
      ...current
    ]);

    setNewAsset({
      name: "",
      type: locale === "en" ? "Positioning" : "产品定位",
      freshness: "100%",
      guardrail: ""
    });
    setIsOpen(false);
  }

  function handleDeleteAsset(name: string) {
    setAssets((current) => current.filter((item) => item.name !== name));
  }

  const typeOptions = locale === "en"
    ? [
        { value: "Positioning", label: "Positioning" },
        { value: "Core Feature", label: "Core Feature" },
        { value: "Text Positioning", label: "Text Positioning" },
        { value: "Visual Hero", label: "Visual Hero" },
        { value: "Customer Evidence", label: "Customer Evidence" },
      ]
    : [
        { value: "产品定位", label: "产品定位" },
        { value: "核心特色", label: "核心特色" },
        { value: "文本定位", label: "文本定位" },
        { value: "视觉主图", label: "视觉主图" },
        { value: "客户证据", label: "客户证据" },
      ];

  return (
    <div className="grid gap-6 pb-10 max-w-[1400px] mx-auto">
      {/* Header */}
      <section className="panel p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Product Assets</p>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold text-fg leading-tight">
              {locale === "en" ? "Asset Library" : "产品资产库"}
            </h1>
            <p className="mt-2.5 max-w-2xl text-xs sm:text-sm leading-6 text-fg-muted">
              {locale === "en"
                ? "Manage product positioning, core features, audiences, brand voice, visual assets, and reusable evidence so every multi-platform remix has a traceable source."
                : "管理产品定位、核心卖点、受众、品牌语气、视觉素材和可复用证据，让每次多平台重组都有源可溯，确保输出一致性。"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="btn-primary"
          >
            {locale === "en" ? "Add Asset" : "添加新资产"} <Plus className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Add Asset Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md panel p-5 rk-enter">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand" />
                <h3 className="font-semibold text-fg text-base">
                  {locale === "en" ? "Add Asset" : "添加新资产"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddAsset} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-fg uppercase tracking-wide">
                  {locale === "en" ? "Asset name" : "资产名称"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={locale === "en" ? "e.g. Finfold Core Features" : "如：Finfold 核心特色亮点"}
                  value={newAsset.name}
                  onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-fg placeholder-fg-muted focus:border-brand focus:bg-surface focus:outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-fg uppercase tracking-wide">
                    {locale === "en" ? "Asset type" : "资产类型"}
                  </label>
                  <select
                    value={newAsset.type}
                    onChange={(e) => setNewAsset({ ...newAsset, type: e.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-fg focus:border-brand focus:bg-surface focus:outline-none transition-all"
                  >
                    {typeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-fg uppercase tracking-wide">
                    {locale === "en" ? "Initial freshness" : "初始化新鲜度"}
                  </label>
                  <input
                    type="text"
                    disabled
                    value={locale === "en" ? "100% (Latest)" : "100% (最新)"}
                    className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-fg-muted cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-fg uppercase tracking-wide">
                  {locale === "en" ? "Details / Brand guardrail" : "详细内容 / 品牌红线"}
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder={locale === "en"
                    ? "Describe this asset's content or brand guardrail requirements (e.g. must include the Launch promo link at the end)"
                    : "详细描述此资产内容或品牌规则要求（例如：必须在结尾附带 Launch 优惠链接）"}
                  value={newAsset.guardrail}
                  onChange={(e) => setNewAsset({ ...newAsset, guardrail: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-fg placeholder-fg-muted focus:border-brand focus:bg-surface focus:outline-none transition-all resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="btn-ghost flex-1"
                >
                  {locale === "en" ? "Cancel" : "取消"}
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                >
                  {locale === "en" ? "Save" : "确认保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assets Grid */}
      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => (
          <article key={asset.name} className="relative panel panel-hover p-5 flex flex-col justify-between group">
            <div>
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-fg-muted">
                  <Library className="h-4.5 w-4.5" />
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="tag tag-success text-[10px]">
                    <CheckCircle2 className="h-3 w-3" /> {asset.freshness}
                  </span>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => handleDeleteAsset(asset.name)}
                    className="p-1.5 rounded-md text-fg-muted hover:bg-risk/10 hover:text-risk transition-all opacity-0 group-hover:opacity-100"
                    title={locale === "en" ? "Delete asset" : "删除资产"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <h2 className="mt-4 text-base font-bold text-fg">{asset.name}</h2>
              <p className="mt-1 text-xs text-fg-muted font-medium">
                {locale === "en" ? "Type:" : "类型："}{asset.type}
              </p>
              <p className="mt-3.5 panel-inset p-3 text-xs leading-relaxed text-fg-muted whitespace-pre-wrap">{asset.guardrail}</p>
            </div>
          </article>
        ))}
      </section>

      {/* Coverage Gap Section */}
      <section className="panel p-5">
        <div className="flex items-center justify-between border-b border-hairline pb-3 mb-4">
          <div>
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Platform fit</p>
            <h2 className="mt-1 text-base font-bold text-fg">
              {locale === "en" ? "Platform coverage gaps" : "平台资产覆盖缺口"}
            </h2>
          </div>
          <ShieldCheck className="h-5 w-5 text-fg-muted" />
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {platformOps.slice(0, 4).map((platform) => (
            <div key={platform.id} className="panel-inset p-4 transition-all hover:border-hairline">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface text-fg border border-hairline shadow-panel">
                  <platform.icon className="h-4 w-4" />
                </span>
                <h3 className="font-semibold text-sm text-fg">{platform.name}</h3>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-fg-muted">
                {locale === "en" ? platform.recommendedActionEn : platform.recommendedAction}
              </p>
              <Link href="/workbench" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-strong hover:underline transition-colors">
                {locale === "en" ? "Go to Workbench" : "前往补充生产"} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
