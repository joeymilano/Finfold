"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Copy,
  ExternalLink,
  History,
  Loader2,
  Plus,
  Save,
  Trash2,
  WandSparkles
} from "@/components/ui/icons";
import { LeadToolRuntime } from "@/components/lead-tools/LeadToolRuntime";
import {
  validateLeadToolSpec,
  validateLeadToolSpecForPublish,
  type LeadToolSpec
} from "@/lib/lead-tools/schema";
import type { LeadToolDetail, LeadToolStats, LeadToolStatus } from "@/lib/lead-tools/service";

const STATUS_LABELS: Record<LeadToolStatus, string> = {
  draft: "草稿",
  published: "已发布",
  paused: "已暂停",
  archived: "已归档"
};

const OUTCOME_STAGE_LABELS = { clicked: "点了入口", left_need: "留下有效需求", won: "实际成交" } as const;

function newId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Owner workspace for one lead tool: version-tracked editing, live draft
 * preview (same runtime the public page serves), explicit publish gate,
 * aggregate stats, and manually confirmed consultation outcomes.
 */
export function LeadToolWorkspace({ toolId }: { toolId: string }) {
  const [tool, setTool] = useState<LeadToolDetail | null>(null);
  const [spec, setSpec] = useState<LeadToolSpec | null>(null);
  const [tab, setTab] = useState<"edit" | "preview" | "stats">("edit");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [stats, setStats] = useState<LeadToolStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [outcomeForm, setOutcomeForm] = useState({ occurredOn: todayIso(), stage: "clicked" as LeadToolStats["outcomes"][number]["stage"], note: "" });

  const loadTool = useCallback(async () => {
    try {
      const response = await fetch(`/api/operations/lead-tools/${toolId}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const body = await response.json();
      setTool(body.tool);
      setSpec(body.tool.spec);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [toolId]);

  useEffect(() => {
    void loadTool();
  }, [loadTool]);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/operations/lead-tools/${toolId}/stats`, { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json();
      setStats(body.stats);
    } catch {
      // stats are non-critical; the panel just stays empty
    }
  }, [toolId]);

  useEffect(() => {
    if (tab === "stats") void loadStats();
  }, [tab, loadStats]);

  async function save() {
    if (!spec || !tool || saving) return;
    const issues = validateLeadToolSpec(spec);
    if (issues.length) {
      setMessage({ kind: "error", text: issues[0] });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/operations/lead-tools/${toolId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec, expectedLatestVersionId: tool.latestVersionId })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) {
          setMessage({ kind: "error", text: "内容在别处被修改过，正在重新加载，请再改一遍后保存。" });
          setLoading(true);
          await loadTool();
        } else {
          setMessage({ kind: "error", text: body.error ?? "保存失败，请重试。" });
        }
        return;
      }
      setTool(body.tool);
      setSpec(body.tool.spec);
      setMessage({ kind: "ok", text: "已保存为新版本。发布前线上页面不受影响。" });
    } catch {
      setMessage({ kind: "error", text: "网络问题，请重试。" });
    } finally {
      setSaving(false);
    }
  }

  async function statusAction(action: "publish" | "pause" | "resume" | "archive") {
    if (!spec || busyAction) return;
    if (action === "publish") {
      const issues = validateLeadToolSpecForPublish(spec);
      if (issues.length) {
        setMessage({ kind: "error", text: issues[0] });
        return;
      }
      const dirty = tool && JSON.stringify(spec) !== JSON.stringify(tool.spec);
      if (dirty && !window.confirm("当前编辑还没保存。发布会先保存当前内容再上线，继续吗？")) {
        return;
      }
      if (!window.confirm("发布后，任何拿到链接的人都能访问这个工具。确定发布？")) return;
    }
    setBusyAction(action);
    setMessage(null);
    try {
      if (action === "publish" && dirtyCheck(spec, tool)) {
        const saved = await fetch(`/api/operations/lead-tools/${toolId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ spec, expectedLatestVersionId: tool?.latestVersionId })
        });
        if (!saved.ok) {
          const body = await saved.json().catch(() => ({}));
          setMessage({ kind: "error", text: body.error ?? "保存失败，未发布。" });
          return;
        }
        const savedBody = await saved.json();
        setTool(savedBody.tool);
      }
      const response = await fetch(`/api/operations/lead-tools/${toolId}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ kind: "error", text: body.error ?? "操作失败，请重试。" });
        return;
      }
      await loadTool();
      setMessage({
        kind: "ok",
        text: action === "publish" ? "已发布。把链接发给你的客户吧。" : "已更新状态。"
      });
    } catch {
      setMessage({ kind: "error", text: "网络问题，请重试。" });
    } finally {
      setBusyAction("");
    }
  }

  async function restoreVersion(versionId: string) {
    if (busyAction) return;
    if (!window.confirm("恢复这个历史版本？当前草稿会存成一个新版本，不会丢失。")) return;
    setBusyAction(`restore:${versionId}`);
    try {
      const response = await fetch(`/api/operations/lead-tools/${toolId}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore_version", versionId })
      });
      if (!response.ok) throw new Error("restore failed");
      await loadTool();
      setMessage({ kind: "ok", text: "已恢复为草稿（历史保留）。" });
    } catch {
      setMessage({ kind: "error", text: "恢复失败，请重试。" });
    } finally {
      setBusyAction("");
    }
  }

  async function addOutcome() {
    if (!outcomeForm.occurredOn || busyAction) return;
    setBusyAction("outcome");
    try {
      const response = await fetch(`/api/operations/lead-tools/${toolId}/outcomes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(outcomeForm)
      });
      if (!response.ok) throw new Error("outcome failed");
      setOutcomeForm({ occurredOn: todayIso(), stage: "clicked", note: "" });
      await loadStats();
    } catch {
      setMessage({ kind: "error", text: "记录失败，请重试。" });
    } finally {
      setBusyAction("");
    }
  }

  function copyPublicLink() {
    if (!tool) return;
    const url = `${window.location.origin}/t/${tool.slug}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return <div className="mx-auto max-w-[1240px] px-4 py-10 text-sm text-fg-muted">加载中…</div>;
  }
  if (loadError || !tool || !spec) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-10 text-sm text-fg-muted">
        工具不存在或加载失败。<Link href="/operations/lead-tools" className="underline">返回列表</Link>
      </div>
    );
  }

  const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/t/${tool.slug}`;

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 xl:max-w-[1440px] 2xl:max-w-[1640px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-fg">{tool.title}</h1>
            <span className={tool.status === "published" ? "tag tag-success" : "tag tag-neutral"}>
              {STATUS_LABELS[tool.status]}
            </span>
          </div>
          {tool.status === "published" ? (
            <div className="mt-1.5 flex items-center gap-2 text-xs text-fg-muted">
              <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                /t/{tool.slug} <ExternalLink className="h-3 w-3" />
              </a>
              <button type="button" onClick={copyPublicLink} className="focus-ring inline-flex items-center gap-1 rounded px-1 hover:text-fg">
                <Copy className="h-3 w-3" /> {copied ? "已复制" : "复制链接"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="focus-ring inline-flex items-center gap-2 rounded-xl border border-hairline px-3.5 py-2 text-sm text-fg hover:bg-surface-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} 保存版本
          </button>
          {tool.status === "draft" || tool.status === "paused" || tool.status === "archived" ? (
            <button
              type="button"
              onClick={() => statusAction("publish")}
              disabled={busyAction === "publish"}
              className="btn-primary focus-ring inline-flex items-center gap-2 px-3.5 py-2 text-sm"
            >
              {busyAction === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />} 发布
            </button>
          ) : null}
          {tool.status === "published" ? (
            <button
              type="button"
              onClick={() => statusAction("pause")}
              disabled={busyAction === "pause"}
              className="focus-ring inline-flex items-center rounded-xl border border-hairline px-3.5 py-2 text-sm text-fg-muted hover:text-fg"
            >
              暂停
            </button>
          ) : null}
          {tool.status !== "archived" ? (
            <button
              type="button"
              onClick={() => statusAction("archive")}
              disabled={busyAction === "archive"}
              className="focus-ring inline-flex items-center rounded-xl px-3 py-2 text-sm text-fg-muted hover:text-risk"
            >
              归档
            </button>
          ) : null}
        </div>
      </div>

      {message ? (
        <p className={`mt-3 text-sm ${message.kind === "ok" ? "text-positive" : "text-risk"}`}>{message.text}</p>
      ) : null}

      <div className="mt-5 flex gap-1 rounded-xl border border-hairline bg-surface p-1.5">
        {(
          [
            ["edit", "编辑"],
            ["preview", "预览"],
            ["stats", "数据"]
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              tab === key
                ? "flex-1 rounded-lg bg-action px-3 py-2 text-xs font-bold text-on-action"
                : "flex-1 rounded-lg px-3 py-2 text-xs font-bold text-fg-muted hover:bg-surface-2 hover:text-fg"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "edit" ? <EditTab spec={spec} setSpec={setSpec} tool={tool} onRestore={restoreVersion} busyAction={busyAction} /> : null}
      {tab === "preview" ? (
        <div className="mt-5 rounded-2xl border border-hairline bg-bg py-2">
          <LeadToolRuntime spec={spec} mode="preview" />
        </div>
      ) : null}
      {tab === "stats" ? (
        <StatsTab tool={tool} stats={stats} outcomeForm={outcomeForm} setOutcomeForm={setOutcomeForm} onAdd={addOutcome} busy={busyAction === "outcome"} />
      ) : null}
    </div>
  );
}

function dirtyCheck(spec: LeadToolSpec, tool: LeadToolDetail | null): boolean {
  return tool ? JSON.stringify(spec) !== JSON.stringify(tool.spec) : true;
}

function EditTab({
  spec,
  setSpec,
  tool,
  onRestore,
  busyAction
}: {
  spec: LeadToolSpec;
  setSpec: React.Dispatch<React.SetStateAction<LeadToolSpec | null>>;
  tool: LeadToolDetail;
  onRestore: (versionId: string) => void;
  busyAction: string;
}) {
  const issues = validateLeadToolSpec(spec);

  function patchSpec(patch: Partial<LeadToolSpec>) {
    setSpec((current) => (current ? { ...current, ...patch } : current));
  }

  function updateQuestion(index: number, patch: Partial<LeadToolSpec["questions"][number]>) {
    patchSpec({
      questions: spec.questions.map((question, i) => (i === index ? { ...question, ...patch } : question))
    });
  }

  function updateResult(index: number, patch: Partial<LeadToolSpec["results"][number]>) {
    patchSpec({
      results: spec.results.map((result, i) => (i === index ? { ...result, ...patch } : result))
    });
  }

  function updateEntry(index: number, patch: Partial<LeadToolSpec["entries"][number]>) {
    patchSpec({
      entries: spec.entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry))
    });
  }

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <section className="panel p-5">
        <h2 className="text-sm font-bold text-fg">基本信息与品牌</h2>
        <label className="mt-3 block text-xs font-semibold text-fg">
          工具标题
          <input
            value={spec.title}
            onChange={(event) => patchSpec({ title: event.target.value })}
            className="input mt-1.5 min-h-10 w-full text-sm"
          />
        </label>
        <label className="mt-3 block text-xs font-semibold text-fg">
          开场介绍（来访者第一眼看到的）
          <textarea
            value={spec.intro}
            onChange={(event) => patchSpec({ intro: event.target.value })}
            rows={2}
            className="input mt-1.5 w-full resize-y py-2.5 text-sm leading-6"
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-fg">
            品牌名
            <input
              value={spec.brand.name}
              onChange={(event) => patchSpec({ brand: { ...spec.brand, name: event.target.value } })}
              className="input mt-1.5 min-h-10 w-full text-sm"
            />
          </label>
          <label className="block text-xs font-semibold text-fg">
            主题色
            <input
              type="color"
              value={spec.brand.accent_color}
              onChange={(event) => patchSpec({ brand: { ...spec.brand, accent_color: event.target.value } })}
              className="input mt-1.5 h-10 w-full p-1"
            />
          </label>
        </div>
        <label className="mt-3 block text-xs font-semibold text-fg">
          品牌一句话（可选）
          <input
            value={spec.brand.tagline}
            onChange={(event) => patchSpec({ brand: { ...spec.brand, tagline: event.target.value } })}
            className="input mt-1.5 min-h-10 w-full text-sm"
          />
        </label>
        <label className="mt-3 flex items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={spec.brand.show_finfold_credit}
            onChange={(event) => patchSpec({ brand: { ...spec.brand, show_finfold_credit: event.target.checked } })}
            className="h-4 w-4"
          />
          页脚显示「由 Finfold 制作 · 为我的业务做一个」署名
        </label>
      </section>

      <section className="panel p-5">
        <h2 className="text-sm font-bold text-fg">咨询 / 服务入口</h2>
        <p className="mt-1 text-xs leading-5 text-fg-muted">
          这是来访者做完自测后走向的地方——用你自己的预约页或联系方式，不要放别的产品的注册页。
        </p>
        {spec.entries.map((entry, index) => (
          <div key={entry.id} className="panel-inset mt-3 space-y-2 p-3">
            <div className="flex items-center gap-2">
              <input
                value={entry.label}
                onChange={(event) => updateEntry(index, { label: event.target.value })}
                placeholder="入口文案，如：预约一次诊断"
                className="input min-h-9 flex-1 text-sm"
              />
              {spec.entries.length > 1 ? (
                <button
                  type="button"
                  onClick={() => patchSpec({ entries: spec.entries.filter((_, i) => i !== index) })}
                  className="focus-ring rounded-lg p-1.5 text-fg-muted hover:text-risk"
                  aria-label="删除入口"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <input
              value={entry.url}
              onChange={(event) => updateEntry(index, { url: event.target.value })}
              placeholder="https://…（发布前必须填写）"
              className="input min-h-9 w-full text-sm"
            />
            <input
              value={entry.hint}
              onChange={(event) => updateEntry(index, { hint: event.target.value })}
              placeholder="辅助说明（可选），如：带一个具体项目来"
              className="input min-h-9 w-full text-sm"
            />
          </div>
        ))}
        {spec.entries.length < 4 ? (
          <button
            type="button"
            onClick={() => patchSpec({ entries: [...spec.entries, { id: newId("entry_"), label: "新的入口", url: "", hint: "" }] })}
            className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-fg-muted hover:text-fg"
          >
            <Plus className="h-3.5 w-3.5" /> 加一个入口
          </button>
        ) : null}
      </section>

      <section className="panel p-5 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-fg">题目（{spec.questions.length}）</h2>
          {spec.questions.length < 7 ? (
            <button
              type="button"
              onClick={() =>
                patchSpec({
                  questions: [
                    ...spec.questions,
                    {
                      id: newId("q"),
                      text: "新的题目",
                      help: "",
                      options: [
                        { id: newId("o"), text: "选项一", points: 2 },
                        { id: newId("o"), text: "选项二", points: 0 }
                      ]
                    }
                  ]
                })
              }
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-fg-muted hover:text-fg"
            >
              <Plus className="h-3.5 w-3.5" /> 加一题
            </button>
          ) : null}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {spec.questions.map((question, index) => (
            <div key={question.id} className="panel-inset p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-fg-muted">第 {index + 1} 题</span>
                <span className="flex-1" />
                {spec.questions.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => patchSpec({ questions: spec.questions.filter((_, i) => i !== index) })}
                    className="focus-ring rounded-lg p-1 text-fg-muted hover:text-risk"
                    aria-label="删除题目"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <input
                value={question.text}
                onChange={(event) => updateQuestion(index, { text: event.target.value })}
                className="input mt-2 min-h-9 w-full text-sm"
              />
              <input
                value={question.help}
                onChange={(event) => updateQuestion(index, { help: event.target.value })}
                placeholder="辅助说明（可选）"
                className="input mt-2 min-h-9 w-full text-xs"
              />
              <div className="mt-2 space-y-1.5">
                {question.options.map((option, optionIndex) => (
                  <div key={option.id} className="flex items-center gap-2">
                    <input
                      value={option.text}
                      onChange={(event) =>
                        updateQuestion(index, {
                          options: question.options.map((o, i) => (i === optionIndex ? { ...o, text: event.target.value } : o))
                        })
                      }
                      className="input min-h-9 flex-1 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={option.points}
                      onChange={(event) =>
                        updateQuestion(index, {
                          options: question.options.map((o, i) =>
                            i === optionIndex ? { ...o, points: Math.max(0, Math.min(10, Number(event.target.value) || 0)) } : o
                          )
                        })
                      }
                      className="input min-h-9 w-16 text-center text-sm"
                      aria-label="选项分值"
                      title="选项分值（0-10）"
                    />
                    {question.options.length > 2 ? (
                      <button
                        type="button"
                        onClick={() =>
                          updateQuestion(index, { options: question.options.filter((_, i) => i !== optionIndex) })
                        }
                        className="focus-ring rounded-lg p-1 text-fg-muted hover:text-risk"
                        aria-label="删除选项"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {question.options.length < 5 ? (
                <button
                  type="button"
                  onClick={() =>
                    updateQuestion(index, { options: [...question.options, { id: newId("o"), text: "新选项", points: 0 }] })
                  }
                  className="focus-ring mt-2 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-fg-muted hover:text-fg"
                >
                  <Plus className="h-3 w-3" /> 加选项
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-5 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-fg">结果（{spec.results.length}）</h2>
          {spec.results.length < 6 ? (
            <button
              type="button"
              onClick={() =>
                patchSpec({
                  results: [
                    ...spec.results,
                    {
                      id: newId("r"),
                      title: "新的结果",
                      summary: "给这类来访者两三句像当面给的建议。",
                      checklist: ["第一件今天能做的事", "第二件今天能做的事"],
                      basis: "说明评分依据，比如：前两题得分高说明……",
                      min_score: 0,
                      max_score: 0,
                      entry: spec.entries[0]?.id ?? "entry_main"
                    }
                  ]
                })
              }
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-fg-muted hover:text-fg"
            >
              <Plus className="h-3.5 w-3.5" /> 加一个结果
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-fg-muted">
          分数区间要首尾相接、覆盖 0 到满分；每个结果写清「为什么给你这个结果」，不编造数据。
        </p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {spec.results.map((result, index) => (
            <div key={result.id} className="panel-inset space-y-2 p-3">
              <div className="flex items-center gap-2">
                <input
                  value={result.title}
                  onChange={(event) => updateResult(index, { title: event.target.value })}
                  className="input min-h-9 flex-1 text-sm font-semibold"
                />
                {spec.results.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => patchSpec({ results: spec.results.filter((_, i) => i !== index) })}
                    className="focus-ring rounded-lg p-1 text-fg-muted hover:text-risk"
                    aria-label="删除结果"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <textarea
                value={result.summary}
                onChange={(event) => updateResult(index, { summary: event.target.value })}
                rows={2}
                className="input w-full resize-y py-2 text-sm leading-6"
                placeholder="两三句建议"
              />
              <textarea
                value={result.checklist.join("\n")}
                onChange={(event) =>
                  updateResult(index, { checklist: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })
                }
                rows={3}
                className="input w-full resize-y py-2 text-sm leading-6"
                placeholder="行动清单，一行一件事"
              />
              <input
                value={result.basis}
                onChange={(event) => updateResult(index, { basis: event.target.value })}
                className="input min-h-9 w-full text-xs"
                placeholder="评分依据（会展示给来访者）"
              />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-fg-muted">
                  分数
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={result.min_score}
                    onChange={(event) => updateResult(index, { min_score: Math.max(0, Math.min(60, Number(event.target.value) || 0)) })}
                    className="input min-h-9 w-16 text-center text-sm"
                  />
                  至
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={result.max_score}
                    onChange={(event) => updateResult(index, { max_score: Math.max(0, Math.min(60, Number(event.target.value) || 0)) })}
                    className="input min-h-9 w-16 text-center text-sm"
                  />
                </label>
                <label className="ml-auto flex items-center gap-1.5 text-xs text-fg-muted">
                  入口
                  <select
                    value={result.entry}
                    onChange={(event) => updateResult(index, { entry: event.target.value })}
                    className="input min-h-9 text-sm"
                  >
                    {spec.entries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>

        {issues.length ? (
          <div className="mt-4 rounded-xl border border-risk/30 bg-risk/5 p-3">
            <p className="text-xs font-bold text-risk">保存前需要修正：</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-risk">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="panel p-5 lg:col-span-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
          <History className="h-4 w-4 text-fg-muted" /> 历史版本
        </h2>
        <ul className="mt-3 divide-y divide-hairline">
          {tool.versions.map((version) => (
            <li key={version.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 text-xs text-fg-muted">
                v{version.version} · {version.note || "编辑"} · {new Date(version.createdAt).toLocaleString("zh-CN")}
                {tool.latestVersionId === version.id ? " · 当前" : ""}
              </span>
              {tool.latestVersionId === version.id ? null : (
                <button
                  type="button"
                  onClick={() => onRestore(version.id)}
                  disabled={busyAction === `restore:${version.id}`}
                  className="focus-ring shrink-0 rounded-lg px-2 py-1 text-xs text-fg-muted hover:text-fg"
                >
                  恢复
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatsTab({
  tool,
  stats,
  outcomeForm,
  setOutcomeForm,
  onAdd,
  busy
}: {
  tool: LeadToolDetail;
  stats: LeadToolStats | null;
  outcomeForm: { occurredOn: string; stage: LeadToolStats["outcomes"][number]["stage"]; note: string };
  setOutcomeForm: React.Dispatch<React.SetStateAction<{ occurredOn: string; stage: LeadToolStats["outcomes"][number]["stage"]; note: string }>>;
  onAdd: () => void;
  busy: boolean;
}) {
  if (!stats) {
    return (
      <div className="panel mt-5 flex items-center gap-2 p-5 text-sm text-fg-muted">
        <BarChart3 className="h-4 w-4" /> 数据加载中…
      </div>
    );
  }

  const completionRate = stats.totals.opens > 0 ? Math.round((stats.totals.completions / stats.totals.opens) * 100) : 0;
  const clickRate = stats.totals.completions > 0 ? Math.round((stats.totals.ctaClicks / stats.totals.completions) * 100) : 0;
  const resultTitle = (resultId: string) => tool.spec.results.find((result) => result.id === resultId)?.title ?? resultId;

  return (
    <div className="mt-5 grid gap-4">
      {tool.status !== "published" ? (
        <p className="panel p-4 text-xs text-fg-muted">工具未发布，暂无访客数据。发布后这里会显示打开、完成与入口点击。</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="text-xs text-fg-muted">打开</p>
          <p className="mt-1 text-2xl font-bold text-fg">{stats.totals.opens}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-fg-muted">完成自测</p>
          <p className="mt-1 text-2xl font-bold text-fg">{stats.totals.completions}</p>
          <p className="mt-1 text-[11px] text-fg-muted">完成率 {completionRate}%</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-fg-muted">点击你的入口</p>
          <p className="mt-1 text-2xl font-bold text-fg">{stats.totals.ctaClicks}</p>
          <p className="mt-1 text-[11px] text-fg-muted">按完成数计 {clickRate}%</p>
        </div>
      </div>

      {stats.resultCounts.length ? (
        <section className="panel p-5">
          <h3 className="text-sm font-bold text-fg">来访者落在哪个结果</h3>
          <ul className="mt-3 space-y-2">
            {stats.resultCounts.map(({ resultId, count }) => {
              const max = Math.max(...stats.resultCounts.map((item) => item.count), 1);
              return (
                <li key={resultId} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-xs text-fg">{resultTitle(resultId)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-action" style={{ width: `${(count / max) * 100}%` }} />
                  </span>
                  <span className="w-8 shrink-0 text-right text-xs text-fg-muted">{count}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {stats.last14Days.length ? (
        <section className="panel p-5">
          <h3 className="text-sm font-bold text-fg">最近 14 天</h3>
          <ul className="mt-3 flex items-end gap-1" style={{ height: 64 }}>
            {stats.last14Days.map((day) => {
              const max = Math.max(...stats.last14Days.map((item) => item.opens), 1);
              return (
                <li
                  key={day.day}
                  className="flex-1 rounded-t bg-action/60"
                  style={{ height: `${Math.max(6, (day.opens / max) * 100)}%` }}
                  title={`${day.day}：打开 ${day.opens} · 完成 ${day.completions} · 点击 ${day.ctaClicks}`}
                />
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-fg-muted">柱高为打开数；悬停看当日明细。</p>
        </section>
      ) : null}

      <section className="panel p-5">
        <h3 className="text-sm font-bold text-fg">咨询结果（人工确认）</h3>
        <p className="mt-1 text-xs leading-5 text-fg-muted">
          区分记录「点了入口」「留下有效需求」「实际成交」，别混在一起——这是判断下一步改题目、改文案还是改入口的依据。
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-fg-muted">
            日期
            <input
              type="date"
              value={outcomeForm.occurredOn}
              onChange={(event) => setOutcomeForm((form) => ({ ...form, occurredOn: event.target.value }))}
              className="input mt-1 block min-h-9 text-sm"
            />
          </label>
          <label className="text-xs text-fg-muted">
            阶段
            <select
              value={outcomeForm.stage}
              onChange={(event) => setOutcomeForm((form) => ({ ...form, stage: event.target.value as LeadToolStats["outcomes"][number]["stage"] }))}
              className="input mt-1 block min-h-9 text-sm"
            >
              {Object.entries(OUTCOME_STAGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <input
            value={outcomeForm.note}
            onChange={(event) => setOutcomeForm((form) => ({ ...form, note: event.target.value }))}
            placeholder="备注（可选）"
            className="input min-h-9 min-w-40 flex-1 text-sm"
          />
          <button
            type="button"
            onClick={onAdd}
            disabled={busy}
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-hairline px-3 py-2 text-sm text-fg hover:bg-surface-2"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} 记一笔
          </button>
        </div>

        <div className="mt-3 flex gap-3 text-xs text-fg-muted">
          <span>点了入口 {stats.outcomeCounts.clicked}</span>
          <span>留下需求 {stats.outcomeCounts.leftNeed}</span>
          <span>成交 {stats.outcomeCounts.won}</span>
        </div>

        {stats.outcomes.length ? (
          <ul className="mt-3 divide-y divide-hairline">
            {stats.outcomes.map((outcome) => (
              <li key={outcome.id} className="flex items-center gap-3 py-2 text-xs">
                <span className="w-20 shrink-0 text-fg-muted">{outcome.occurredOn}</span>
                <span className="tag tag-neutral shrink-0">{OUTCOME_STAGE_LABELS[outcome.stage]}</span>
                <span className="min-w-0 flex-1 truncate text-fg">{outcome.note || "—"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-fg-muted">还没有记录。有客户因为这个小工具来找你时，回来记一笔。</p>
        )}
      </section>
    </div>
  );
}
