"use client";

import React, { useState } from "react";
import { Layers3, X } from "@/components/ui/icons";
import type { BrandBrain, PlatformMemory } from "@/lib/brand-brain";

type PlatformMemoryPlatform = PlatformMemory["platform"];
type PlatformMemoryKind = PlatformMemory["kind"];

const platformLabels: Record<PlatformMemoryPlatform, string> = {
  xiaohongshu: "小红书",
  wechat: "公众号",
  x: "X"
};

const kindCopy: Record<PlatformMemoryKind, { zh: string; en: string }> = {
  fact: { zh: "事实", en: "Fact" },
  preference: { zh: "偏好", en: "Preference" },
  inference: { zh: "推断", en: "Inference" }
};

export function PlatformMemoryManager({
  brain,
  locale,
  onChange
}: {
  brain: BrandBrain;
  locale: "zh" | "en";
  onChange: (next: BrandBrain) => void;
}) {
  const zh = locale === "zh";
  const [platform, setPlatform] = useState<PlatformMemoryPlatform>("xiaohongshu");
  const [kind, setKind] = useState<PlatformMemoryKind>("preference");
  const [value, setValue] = useState("");
  const [duplicate, setDuplicate] = useState(false);

  function addMemory() {
    const trimmed = value.trim();
    if (!trimmed) return;
    const exists = brain.platformMemory.some((item) =>
      item.platform === platform
      && item.kind === kind
      && item.value.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase()
    );
    if (exists) {
      setDuplicate(true);
      return;
    }
    onChange({
      ...brain,
      platformMemory: [...brain.platformMemory, {
        id: crypto.randomUUID(),
        platform,
        kind,
        value: trimmed,
        source: "manual",
        confidence: "high",
        createdAt: new Date().toISOString()
      }]
    });
    setValue("");
    setDuplicate(false);
  }

  return (
    <section className="panel p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
          <Layers3 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-fg">{zh ? "平台差异记忆" : "Platform-specific memory"}</h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            {zh
              ? "为小红书、公众号和 X 分别保存事实、偏好和可复用推断；只会在对应平台使用。"
              : "Keep facts, preferences, and reusable inferences separate for Xiaohongshu, WeChat, and X. Each applies only to its platform."}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[130px_140px_minmax(0,1fr)_auto]">
        <select value={platform} onChange={(event) => setPlatform(event.target.value as PlatformMemoryPlatform)} className="field-input" aria-label={zh ? "平台" : "Platform"}>
          {Object.entries(platformLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={kind} onChange={(event) => setKind(event.target.value as PlatformMemoryKind)} className="field-input" aria-label={zh ? "记忆类型" : "Memory type"}>
          {(Object.keys(kindCopy) as PlatformMemoryKind[]).map((id) => <option key={id} value={id}>{kindCopy[id][locale]}</option>)}
        </select>
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setDuplicate(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addMemory();
            }
          }}
          placeholder={zh ? "例如：在 X 开头先给出具体取舍" : "e.g. On X, lead with the concrete trade-off"}
          className="field-input"
        />
        <button type="button" onClick={addMemory} disabled={!value.trim()} className="btn-ghost shrink-0 justify-center disabled:opacity-50">
          {zh ? "添加平台记忆" : "Add platform memory"}
        </button>
      </div>
      {duplicate ? <p role="alert" className="mt-2 text-xs text-warn">{zh ? "这条平台记忆已经存在。" : "That platform memory already exists."}</p> : null}
      {brain.platformMemory.length === 0 ? (
        <p className="mt-3 text-xs text-fg-muted">{zh ? "暂时还没有平台差异记忆。" : "No platform-specific memory yet."}</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {brain.platformMemory.map((item) => (
            <div key={item.id} className="flex items-start gap-2 rounded-lg border border-hairline bg-surface-2/45 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-wide text-fg-muted">
                  {platformLabels[item.platform]} · {kindCopy[item.kind][locale]} · {item.source} · {item.confidence}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-fg">{item.value}</p>
              </div>
              <button
                type="button"
                aria-label={zh ? "移除平台记忆" : "Remove platform memory"}
                onClick={() => onChange({ ...brain, platformMemory: brain.platformMemory.filter((memory) => memory.id !== item.id) })}
                className="focus-ring rounded-md p-1.5 text-fg-muted hover:bg-risk/10 hover:text-risk"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}