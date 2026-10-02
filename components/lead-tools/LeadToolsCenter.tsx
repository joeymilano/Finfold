"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, WandSparkles } from "@/components/ui/icons";
import type { LeadToolSummary } from "@/lib/lead-tools/service";
import { ACTION_CREDITS } from "@/lib/payment/types";

const STATUS_LABELS: Record<LeadToolSummary["status"], string> = {
  draft: "草稿",
  published: "已发布",
  paused: "已暂停",
  archived: "已归档"
};

/**
 * Owner-side hub for 获客搭子: list existing tools and create new ones via
 * the AI generator (charged) or a blank scaffold (free, hand-edited).
 */
export function LeadToolsCenter() {
  const router = useRouter();
  const [tools, setTools] = useState<LeadToolSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [businessIntro, setBusinessIntro] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [entryUrl, setEntryUrl] = useState("");
  const [entryLabel, setEntryLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [creatingBlank, setCreatingBlank] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/operations/lead-tools", { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const body = await response.json();
      setTools(body.tools ?? []);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    if (businessIntro.trim().length < 20 || generating) return;
    setGenerating(true);
    setFormError("");
    try {
      const response = await fetch("/api/operations/lead-tools/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessIntro,
          businessName: businessName.trim() || undefined,
          entryUrl: entryUrl.trim() || undefined,
          entryLabel: entryLabel.trim() || undefined
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 402) {
          setFormError(`点数不够（还差 ${Math.max(0, ACTION_CREDITS.leadToolGenerate - (body.available ?? 0))} 分），可以在订阅里补充。`);
        } else {
          setFormError(body.error ?? "生成失败，请稍后重试。");
        }
        return;
      }
      router.push(`/operations/lead-tools/${body.tool.id}`);
    } catch {
      setFormError("网络问题，请重试。");
    } finally {
      setGenerating(false);
    }
  }

  async function createBlank() {
    if (creatingBlank) return;
    setCreatingBlank(true);
    setFormError("");
    try {
      const response = await fetch("/api/operations/lead-tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFormError(body.error ?? "创建失败，请重试。");
        return;
      }
      router.push(`/operations/lead-tools/${body.tool.id}`);
    } catch {
      setFormError("网络问题，请重试。");
    } finally {
      setCreatingBlank(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 xl:max-w-[1440px] 2xl:max-w-[1640px]">
      <section className="panel p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">获客搭子</p>
        <h1 className="mt-2 text-xl font-semibold text-fg sm:text-2xl">
          把你的产品介绍，变成客户愿意用、愿意转发的小工具
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-muted">
          一段业务介绍，生成一个带你自己品牌的五题自测：客户做完拿到对应的行动清单，最后自然走到你的咨询或服务入口。
          生成的工具可以逐题修改，你审核之后才发布。
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_260px]">
          <div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg">业务介绍</span>
              <textarea
                value={businessIntro}
                onChange={(event) => setBusinessIntro(event.target.value)}
                rows={5}
                placeholder="你提供什么服务、给谁、解决什么问题、客户通常怎么找到你。写给你潜在客户看的口吻最好。"
                className="input w-full resize-y py-3 text-sm leading-6"
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <input
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="品牌名（可选）"
                className="input min-h-10 w-full"
              />
              <input
                value={entryLabel}
                onChange={(event) => setEntryLabel(event.target.value)}
                placeholder="入口文案，如：预约诊断"
                className="input min-h-10 w-full"
              />
              <input
                value={entryUrl}
                onChange={(event) => setEntryUrl(event.target.value)}
                type="url"
                placeholder="入口链接（可选，自己的预约页）"
                className="input min-h-10 w-full"
              />
            </div>
            {formError ? <p className="mt-3 text-xs text-risk">{formError}</p> : null}
          </div>

          <div className="flex flex-col justify-end gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={generating || businessIntro.trim().length < 20}
              className="btn-primary focus-ring inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
              {generating ? "生成中…" : `AI 生成（${ACTION_CREDITS.leadToolGenerate} 点）`}
            </button>
            <button
              type="button"
              onClick={createBlank}
              disabled={creatingBlank}
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-hairline px-4 py-2.5 text-sm text-fg-muted hover:text-fg"
            >
              <Plus className="h-4 w-4" /> 空白创建（免费）
            </button>
            <p className="text-[11px] leading-4 text-fg-muted">
              AI 生成消耗 {ACTION_CREDITS.leadToolGenerate} 点；之后改题目、看数据不再扣点。
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-fg">我的获客工具</h2>
        {tools === null ? (
          loadError ? (
            <p className="text-sm text-fg-muted">加载失败，请刷新重试。</p>
          ) : (
            <p className="text-sm text-fg-muted">加载中…</p>
          )
        ) : tools.length === 0 ? (
          <p className="panel p-6 text-sm text-fg-muted">
            还没有工具。从上面填一段业务介绍开始——第一个工具建议选一个客户最常问你的问题。
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <li key={tool.id}>
                <Link
                  href={`/operations/lead-tools/${tool.id}`}
                  className="panel panel-hover focus-ring block p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-fg">{tool.title}</span>
                    <span
                      className={
                        tool.status === "published"
                          ? "tag tag-success shrink-0"
                          : "tag tag-neutral shrink-0"
                      }
                    >
                      {STATUS_LABELS[tool.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-fg-muted">
                    更新于 {new Date(tool.updatedAt).toLocaleDateString("zh-CN")}
                    {tool.published ? ` · /t/${tool.slug}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
