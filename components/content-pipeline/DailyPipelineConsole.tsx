"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zipSync, strToU8 } from "fflate";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Switch } from "@/components/ui/Switch";
import { useLocale } from "@/hooks/useLocale";
import { VisualStoryCanvas } from "@/components/workbench/visual-story/VisualStoryCanvas";
import { visualStoryFormats } from "@/lib/visual-story-formats";
import { exportCoverPngToDataUrl } from "@/lib/cover/cover-export";
import type { VisualStoryPage, VisualStoryTheme } from "@/lib/visual-story";

type RunStatus = "awaiting_review" | "jev_blocked" | "draft_sent" | "discarded" | "skipped_no_topic" | "failed";

type StoryPage = {
  id: string;
  role: string;
  kicker: string;
  title: string;
  body: string;
  points: string[];
  emphasis: string;
};

type RunView = {
  id: string;
  channel: "wechat_articles" | "xhs_cards";
  status: RunStatus;
  topicTitle: string | null;
  topicRef: string | null;
  createdAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  review: { decision: "pass" | "blocked"; quality: number | null; findings: string[] } | null;
  article: {
    kitId: string;
    outputId: string;
    title: string;
    body: string;
    summary: string | null;
    cta: string;
    imageUrl: string | null;
    tags: string[];
    updatedAt: string;
  } | null;
  story: { title: string; theme: string; artDirection: string; pages: StoryPage[] } | null;
  cardType: string | null;
  titleCandidates: string[];
  reviewOverridden: boolean;
  publication: { id: string; status: string; statusLabel: string } | null;
};

type Settings = {
  wechatArticlesEnabled: boolean;
  wechatReviewMode: "every_post" | "jev_guarded";
  wechatDailyCap: number;
  wechatTheme: "default" | "grace" | "simple";
  xhsCardsEnabled: boolean;
  xhsCardType: "quote" | "list" | "opinion";
  xhsTheme: "editorial" | "signal" | "field-notes";
  xhsReviewMode: "every_post" | "jev_guarded";
  xhsDailyCap: number;
  xhsWithIllustration: boolean;
  leadMagnets: { name: string; hookCopy: string; deliveryNote: string }[];
  paused: boolean;
};

type MagnetDraft = { name: string; hookCopy: string; deliveryNote: string };

const STATUS_LABELS: Record<RunStatus, { zh: string; en: string }> = {
  awaiting_review: { zh: "待确认", en: "Awaiting review" },
  jev_blocked: { zh: "质检拦截", en: "Quality gate" },
  draft_sent: { zh: "已进草稿箱", en: "In draft box" },
  discarded: { zh: "已弃用", en: "Discarded" },
  skipped_no_topic: { zh: "今日无题", en: "No topic" },
  failed: { zh: "失败", en: "Failed" }
};

const CARD_TYPE_LABELS: Record<string, { zh: string; en: string }> = {
  quote: { zh: "金句卡", en: "Quote cards" },
  list: { zh: "清单卡", en: "List cards" },
  opinion: { zh: "观点卡", en: "Opinion cards" }
};

const STORY_THEMES: Array<{ id: VisualStoryTheme; zh: string; en: string }> = [
  { id: "editorial", zh: "编辑部（米白暖纸）", en: "Editorial" },
  { id: "signal", zh: "高信号（深蓝夜幕）", en: "Signal" },
  { id: "field-notes", zh: "田野笔记（明黄格线）", en: "Field notes" }
];

const PAGE_ROLES = new Set(["cover", "insight", "list", "quote", "cta"]);

function toCanvasPage(page: StoryPage, index: number, total: number): VisualStoryPage {
  return {
    id: page.id || `page-${index}`,
    role: PAGE_ROLES.has(page.role) ? page.role as VisualStoryPage["role"] : "insight",
    kicker: page.kicker,
    title: page.title,
    body: page.body,
    points: page.points,
    emphasis: page.emphasis
  };
  void total;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function DailyPipelineConsole() {
  const locale = useLocale();
  const en = locale === "en";
  const [runs, setRuns] = useState<RunView[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [leadTools, setLeadTools] = useState<Array<{ slug: string; title: string }>>([]);
  const [meta, setMeta] = useState<{ hasWechatConnection: boolean; accountName: string | null } | null>(null);
  const [edits, setEdits] = useState<Record<string, { title: string; body: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zipping, setZipping] = useState<string | null>(null);
  const [activeCardPage, setActiveCardPage] = useState<Record<string, number>>({});
  const [magnetDraft, setMagnetDraft] = useState<MagnetDraft>({ name: "", hookCopy: "", deliveryNote: "" });
  const cardExportRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const copy = useMemo(() => ({
    title: en ? "Daily Content Pipeline" : "日更流水线",
    body: en
      ? "Two tracks, one habit: a WeChat article every morning at 10:30, a Xiaohongshu card set every night at 21:30 — written in your voice, quality-checked, and waiting here. Articles go to the WeChat draft box with one click; card sets come down as a ready-to-post zip."
      : "两条轨道一个习惯：每天上午 10:30 一篇公众号长文，每晚 21:30 一组小红书卡片，都按你的口吻写好、过完质检在这里等你。长文一键进草稿箱，卡组打包下载直接发。",
    connectMissing: en
      ? "Articles generate into the content library either way — publish manually from there. Connect the Official Account to unlock one-click sending to the WeChat draft box."
      : "不连公众号也照常生成，内容进内容库后可手动发布。完成授权后可一键发到草稿箱。",
    connectOk: (name: string) => (en ? `Publishing as ${name}.` : `以「${name}」的身份写入草稿箱。`),
    queueTitle: en ? "Today's article" : "今日长文",
    cardsTitle: en ? "Tonight's card set" : "今晚卡组",
    queueEmpty: en
      ? "Nothing here yet. The first run lands after the next 10:30 generation window."
      : "还没有产出。下一个上午 10:30 的生成窗口后，这里会出现今天的文章。",
    cardsEmpty: en
      ? "No card set yet. The nightly 21:30 window builds one when the switch below is on."
      : "还没有卡组。下面的卡组开关打开后，每晚 21:30 会生成一组。",
    historyTitle: en ? "Recent runs" : "近期记录",
    settingsTitle: en ? "Pipeline settings" : "流水线设置",
    generation: en ? "Daily article (10:30)" : "每日长文（10:30）",
    cards: en ? "Nightly cards (21:30)" : "每晚卡组（21:30）",
    reviewEvery: en ? "I confirm each" : "逐篇确认",
    reviewJev: en ? "Auto review (pass → go)" : "自动质检（通过直接走）",
    reviewJevHintArticles: en
      ? "Every article passes an automated quality gate; passing ones go straight to the WeChat draft box, flagged ones wait here."
      : "每篇先过自动质量闸：通过的直接进公众号草稿箱，拦截的转给你确认。",
    reviewJevHintCards: en
      ? "Card sets that pass are ready to download immediately; flagged ones need your explicit ok."
      : "卡组过闸后可直接打包下载，被拦的需要你点一下「仍要下载」。",
    dailyCap: en ? "Daily article cap" : "每日长文上限",
    cardCap: en ? "Daily card-set cap" : "每日卡组上限",
    cardType: en ? "Card type" : "卡型",
    cardTypeQuote: en ? "Bilingual quote cards" : "金句卡（双语）",
    cardTypeList: en ? "List cards" : "清单卡",
    cardTypeOpinion: en ? "Opinion cards" : "观点卡",
    cardTheme: en ? "Card theme" : "卡片主题",
    cardIllustration: en ? "AI illustration cover" : "AI 插画封面",
    cardIllustrationHint: en
      ? "Off = clean typography, zero image cost. On = one generated cover per set, fixed style."
      : "关 = 纯排版，零图片成本；开 = 每组生成一张封面插画，风格固定。",
    theme: en ? "Article theme" : "排版主题",
    themeDefault: en ? "Classic green" : "经典绿",
    themeGrace: en ? "Warm cream" : "优雅暖",
    themeSimple: en ? "Clean blue" : "简洁蓝",
    paused: en ? "Paused" : "已暂停",
    magnetTitle: en ? "Lead magnets (article ending hook)" : "钩子素材（长文结尾资料钩子）",
    magnetHint: en
      ? "The ending hook may only reference materials listed here. Leave empty to end with a plain next step."
      : "结尾的资料钩子只会引用这里配置的素材。留空则结尾只做自然的下一步引导。",
    magnetFromTool: en ? "From lead tools" : "从获客搭子选",
    magnetName: en ? "Material name" : "素材名称",
    magnetHook: en ? "Hook copy (optional)" : "钩子话术（可选）",
    magnetDelivery: en ? "How readers get it" : "领取方式",
    add: en ? "Add" : "添加",
    remove: en ? "Remove" : "移除",
    publish: en ? "Send to draft box" : "发到草稿箱",
    regenerate: en ? "Regenerate" : "重新生成",
    discard: en ? "Discard" : "弃用",
    downloadZip: en ? "Download zip" : "打包下载",
    zipping: en ? "Packing" : "打包中",
    overrideDownload: en ? "Download anyway" : "仍要下载",
    edited: en ? "edited" : "已改",
    sourceRadar: en ? "radar" : "雷达",
    sourcePillar: en ? "pillar" : "定位支柱",
    autoPassed: (quality: number | null) => (en ? `passed review${quality === null ? "" : ` · ${quality.toFixed(1)}/4`}` : `质检通过${quality === null ? "" : ` · ${quality.toFixed(1)}/4`}`),
    autoFlagged: en ? "flagged → you" : "转人工",
    coverAlt: en ? "Generated cover" : "生成的封面",
    chars: en ? "chars" : "字",
    titleCount: en ? "title" : "标题",
    openLibrary: en ? "Open in library" : "去内容库发布",
    downloadCover: en ? "Download cover" : "下载封面",
    noteBody: en ? "Note caption" : "笔记正文",
    titleCandidates: en ? "Title candidates" : "标题候选",
    tags: en ? "Tags" : "话题标签"
  }), [en]);

  const load = useCallback(async () => {
    try {
      const [runsResponse, settingsResponse] = await Promise.all([
        fetch("/api/content-pipeline/articles", { cache: "no-store" }),
        fetch("/api/content-pipeline/settings", { cache: "no-store" })
      ]);
      if (runsResponse.ok) {
        const payload = await runsResponse.json();
        setRuns(payload.runs ?? []);
        setMeta(payload.meta ?? null);
      }
      if (settingsResponse.ok) {
        const payload = await settingsResponse.json();
        setSettings(payload.settings ?? null);
        setLeadTools(payload.leadTools ?? []);
      }
    } catch {
      setError(en ? "Could not load the pipeline." : "流水线数据加载失败。");
    }
  }, [en]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingArticles = (runs ?? []).filter((run) => run.channel === "wechat_articles" && (run.status === "awaiting_review" || run.status === "jev_blocked") && run.article);
  const pendingCards = (runs ?? []).filter((run) => run.channel === "xhs_cards" && (run.status === "awaiting_review" || run.status === "jev_blocked") && run.story);
  const history = (runs ?? []).filter((run) => !pendingArticles.includes(run) && !pendingCards.includes(run));

  const decide = async (run: RunView, decision: "publish_to_draft" | "discard" | "regenerate" | "override_review") => {
    if (!run.article && !run.story) return;
    setBusy(run.id);
    setError(null);
    try {
      const edit = edits[run.id];
      const response = await fetch(`/api/content-pipeline/articles/${run.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          ...(decision === "publish_to_draft" && run.channel === "wechat_articles" && edit
            ? { title: edit.title, body: edit.body }
            : {})
        })
      });
      if (!response.ok) {
        setError((await response.json().catch(() => ({}))).error ?? (en ? "Request failed." : "请求失败。"));
        return;
      }
      setEdits((current) => {
        const next = { ...current };
        delete next[run.id];
        return next;
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const patchSettings = async (patch: Partial<Settings> & { pausedReason?: string | null }) => {
    const response = await fetch("/api/content-pipeline/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (response.ok) setSettings((await response.json()).settings ?? null);
    else setError((await response.json().catch(() => ({}))).error ?? (en ? "Could not save settings." : "设置保存失败。"));
  };

  const saveMagnets = async (magnets: Settings["leadMagnets"]) => {
    await patchSettings({ leadMagnets: magnets });
  };

  const downloadCover = async (run: RunView) => {
    const url = run.article?.imageUrl;
    if (!url) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const ext = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1] || "png";
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `finfold-wechat-cover-${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank", "noopener");
    }
  };

  const downloadCardZip = async (run: RunView) => {
    if (!run.story || !run.article) return;
    setZipping(run.id);
    setError(null);
    try {
      const format = visualStoryFormats["portrait-3x4"];
      const files: Record<string, Uint8Array> = {};
      for (const [index, page] of run.story.pages.entries()) {
        const node = cardExportRefs.current[page.id];
        if (!node) continue;
        const dataUrl = await exportCoverPngToDataUrl(node, format);
        files[`cards/卡-${String(index + 1).padStart(2, "0")}.png`] = dataUrlToBytes(dataUrl);
      }
      if (!Object.keys(files).length) throw new Error("no pages captured");
      files["笔记正文.txt"] = strToU8(run.article.body);
      files["标题候选.txt"] = strToU8(run.titleCandidates.join("\n"));
      files["话题标签.txt"] = strToU8(run.article.tags.map((tag) => `#${tag}`).join(" "));
      const zipped = zipSync(files, { level: 6 });
      const blobUrl = URL.createObjectURL(new Blob([zipped as unknown as BlobPart], { type: "application/zip" }));
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `finfold-xhs-cards-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      setError(en ? "Could not pack the card set." : "卡组打包失败，请重试。");
    } finally {
      setZipping(null);
    }
  };

  return (
    <div className="mx-auto grid max-w-[1180px] gap-5 pb-10 xl:max-w-[1440px] 2xl:max-w-[1640px]">
      <Panel className="relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-action/10 blur-3xl" />
        <div className="relative max-w-4xl">
          <p className="eyebrow">WeChat · Xiaohongshu</p>
          <h1 className="mt-4 text-balance text-3xl font-black leading-tight text-fg md:text-4xl">{copy.title}</h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-fg-muted">{copy.body}</p>
          {meta ? (
            <p className="mt-3 max-w-2xl text-xs font-semibold leading-5 text-fg-muted">
              {meta.hasWechatConnection ? copy.connectOk(meta.accountName ?? "Official Account") : copy.connectMissing}
            </p>
          ) : null}
        </div>
      </Panel>

      {error ? (
        <div role="alert" className="rounded-xl border border-risk/30 bg-risk/10 px-4 py-3 text-xs font-semibold leading-5 text-risk">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-5">
          <Panel className="p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-fg">{copy.queueTitle}</h2>
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-fg-muted">{pendingArticles.length}</span>
            </div>
            {runs === null ? (
              <p className="mt-4 text-xs font-semibold text-fg-muted">…</p>
            ) : pendingArticles.length === 0 ? (
              <p className="mt-4 text-xs font-semibold leading-5 text-fg-muted">{copy.queueEmpty}</p>
            ) : (
              <ul className="mt-4 grid gap-4">
                {pendingArticles.map((run) => {
                  const edit = edits[run.id];
                  const title = edit?.title ?? run.article?.title ?? "";
                  const body = edit?.body ?? run.article?.body ?? "";
                  return (
                    <li key={run.id} className="rounded-2xl border border-border/60 bg-surface-2/60 p-4">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-fg-muted">
                        <span className="rounded-full bg-surface-2 px-2 py-0.5">{STATUS_LABELS[run.status][en ? "en" : "zh"]}</span>
                        <span className="rounded-full bg-action/10 px-2 py-0.5 text-action">
                          {run.topicRef?.startsWith("radar:") ? copy.sourceRadar : copy.sourcePillar}
                        </span>
                        {run.topicTitle ? <span className="truncate">{run.topicTitle}</span> : null}
                        {run.review ? (
                          <span className={`rounded-full px-2 py-0.5 ${run.review.decision === "pass" ? "bg-action/10 text-action" : "bg-warn/10 text-warn"}`}>
                            {run.review.decision === "pass" ? copy.autoPassed(run.review.quality) : copy.autoFlagged}
                          </span>
                        ) : null}
                        {edit ? <span className="text-warn">{copy.edited}</span> : null}
                      </div>
                      {run.review && run.review.decision === "blocked" && run.review.findings.length ? (
                        <p className="mt-2 rounded-xl bg-warn/10 px-3 py-2 text-[11px] font-semibold leading-5 text-warn">
                          {run.review.findings.join("；")}
                        </p>
                      ) : null}
                      {run.errorMessage && run.status === "jev_blocked" ? (
                        <p className="mt-2 text-[11px] font-semibold leading-5 text-warn">{run.errorMessage}</p>
                      ) : null}
                      {run.errorMessage && run.status === "awaiting_review" ? (
                        <p className="mt-2 text-[11px] font-semibold leading-5 text-fg-muted">{run.errorMessage}</p>
                      ) : null}
                      {run.article?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote generated-image URL, not a static asset
                        <img src={run.article.imageUrl} alt={copy.coverAlt} className="mt-3 max-h-64 w-full rounded-xl object-cover" />
                      ) : null}
                      <div className="mt-3 grid gap-2">
                        <div>
                          <input
                            value={title}
                            onChange={(event) => setEdits((current) => ({
                              ...current,
                              [run.id]: { title: event.target.value, body }
                            }))}
                            maxLength={32}
                            className="w-full rounded-xl border border-border/60 bg-surface px-3 py-2 text-sm font-bold text-fg focus-ring"
                          />
                          <div className="mt-0.5 text-right text-[10px] font-bold text-fg-muted">{title.length}/32 {copy.titleCount}</div>
                        </div>
                        <div>
                          <textarea
                            value={body}
                            rows={12}
                            onChange={(event) => setEdits((current) => ({
                              ...current,
                              [run.id]: { title, body: event.target.value }
                            }))}
                            maxLength={3_500}
                            className="w-full resize-y rounded-xl border border-border/60 bg-surface px-3 py-2 text-sm leading-6 text-fg focus-ring"
                          />
                          <div className="mt-0.5 text-right text-[10px] font-bold text-fg-muted">{body.length} {copy.chars}</div>
                        </div>
                        {run.article?.tags.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {run.article.tags.map((tag) => (
                              <span key={tag} className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-fg-muted">#{tag}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button size="sm" disabled={busy === run.id} onClick={() => decide(run, "publish_to_draft")}>{copy.publish}</Button>
                        <Button size="sm" variant="secondary" disabled={busy === run.id} onClick={() => decide(run, "regenerate")}>{copy.regenerate}</Button>
                        <Button size="sm" variant="danger" disabled={busy === run.id} onClick={() => decide(run, "discard")}>{copy.discard}</Button>
                        {run.article ? (
                          <>
                            <a
                              href={`/kits/${run.article.kitId}`}
                              className="text-[11px] font-bold text-action hover:underline"
                            >
                              {copy.openLibrary} ↗
                            </a>
                            {run.article.imageUrl ? (
                              <button
                                type="button"
                                disabled={busy === run.id}
                                onClick={() => void downloadCover(run)}
                                className="text-[11px] font-bold text-fg-muted hover:text-fg disabled:opacity-50"
                              >
                                {copy.downloadCover}
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel className="p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-fg">{copy.cardsTitle}</h2>
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-fg-muted">{pendingCards.length}</span>
            </div>
            {runs === null ? (
              <p className="mt-4 text-xs font-semibold text-fg-muted">…</p>
            ) : pendingCards.length === 0 ? (
              <p className="mt-4 text-xs font-semibold leading-5 text-fg-muted">{copy.cardsEmpty}</p>
            ) : (
              <ul className="mt-4 grid gap-4">
                {pendingCards.map((run) => {
                  const gated = run.status === "jev_blocked" && !run.reviewOverridden;
                  const story = run.story;
                  const activeIndex = Math.min(activeCardPage[run.id] ?? 0, (story?.pages.length ?? 1) - 1);
                  const activePage = story?.pages[activeIndex];
                  const themeId = (STORY_THEMES.find((theme) => theme.id === story?.theme)?.id ?? "editorial") as VisualStoryTheme;
                  return (
                    <li key={run.id} className="rounded-2xl border border-border/60 bg-surface-2/60 p-4">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-fg-muted">
                        <span className="rounded-full bg-surface-2 px-2 py-0.5">{STATUS_LABELS[run.status][en ? "en" : "zh"]}</span>
                        <span className="rounded-full bg-action/10 px-2 py-0.5 text-action">
                          {CARD_TYPE_LABELS[run.cardType ?? "quote"][en ? "en" : "zh"]}
                        </span>
                        <span className="rounded-full bg-surface-2 px-2 py-0.5">
                          {run.topicRef?.startsWith("radar:") ? copy.sourceRadar : copy.sourcePillar}
                        </span>
                        {run.topicTitle ? <span className="truncate">{run.topicTitle}</span> : null}
                        {run.review ? (
                          <span className={`rounded-full px-2 py-0.5 ${run.review.decision === "pass" ? "bg-action/10 text-action" : "bg-warn/10 text-warn"}`}>
                            {run.review.decision === "pass" ? copy.autoPassed(null) : copy.autoFlagged}
                          </span>
                        ) : null}
                        {run.reviewOverridden ? <span className="text-warn">{en ? "overridden" : "已人工放行"}</span> : null}
                      </div>
                      {run.review && run.review.decision === "blocked" && run.review.findings.length && !run.reviewOverridden ? (
                        <p className="mt-2 rounded-xl bg-warn/10 px-3 py-2 text-[11px] font-semibold leading-5 text-warn">
                          {run.review.findings.join("；")}
                        </p>
                      ) : null}
                      {story && activePage ? (
                        <div className="mt-3 grid gap-4 md:grid-cols-[auto_1fr]">
                          <div>
                            <div style={{ width: 540 * 0.5, height: 720 * 0.5, overflow: "hidden", borderRadius: 14, border: "1px solid rgba(125,125,115,.25)" }}>
                              <div style={{ width: 540, height: 720, transform: "scale(0.5)", transformOrigin: "top left" }}>
                                <VisualStoryCanvas
                                  page={toCanvasPage(activePage, activeIndex, story.pages.length)}
                                  pageIndex={activeIndex}
                                  pageCount={story.pages.length}
                                  storyTitle={story.title}
                                  themeId={themeId}
                                  format={visualStoryFormats["portrait-3x4"]}
                                  coverImageUrl={run.article?.imageUrl ?? undefined}
                                  locale={locale}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="grid content-start gap-3">
                            <div className="flex flex-wrap gap-2">
                              {story.pages.map((page, index) => (
                                <button
                                  key={page.id}
                                  type="button"
                                  onClick={() => setActiveCardPage((current) => ({ ...current, [run.id]: index }))}
                                  className={`overflow-hidden rounded-md border transition ${index === activeIndex ? "border-action" : "border-border/50 opacity-70 hover:opacity-100"}`}
                                  style={{ width: 540 * 0.14, height: 720 * 0.14 }}
                                  aria-label={`page ${index + 1}`}
                                >
                                  <div style={{ width: 540, height: 720, transform: "scale(0.14)", transformOrigin: "top left", pointerEvents: "none" }}>
                                    <VisualStoryCanvas
                                      page={toCanvasPage(page, index, story.pages.length)}
                                      pageIndex={index}
                                      pageCount={story.pages.length}
                                      storyTitle={story.title}
                                      themeId={themeId}
                                      format={visualStoryFormats["portrait-3x4"]}
                                      coverImageUrl={run.article?.imageUrl ?? undefined}
                                      locale={locale}
                                    />
                                  </div>
                                </button>
                              ))}
                            </div>
                            <div className="grid gap-1 text-[11px] leading-5">
                              <p className="font-bold text-fg">{copy.noteBody}</p>
                              <p className="whitespace-pre-wrap text-fg-muted">{run.article?.body}</p>
                              {run.titleCandidates.length ? (
                                <p className="mt-1 font-bold text-fg">{copy.titleCandidates}：{run.titleCandidates.join(" / ")}</p>
                              ) : null}
                              {run.article?.tags.length ? (
                                <p className="font-bold text-fg">{copy.tags}：{run.article.tags.map((tag) => `#${tag}`).join(" ")}</p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {gated ? (
                          <Button size="sm" disabled={busy === run.id} onClick={() => decide(run, "override_review")}>{copy.overrideDownload}</Button>
                        ) : (
                          <Button size="sm" disabled={zipping === run.id} onClick={() => void downloadCardZip(run)}>
                            {zipping === run.id ? `${copy.zipping}…` : copy.downloadZip}
                          </Button>
                        )}
                        <Button size="sm" variant="secondary" disabled={busy === run.id} onClick={() => decide(run, "regenerate")}>{copy.regenerate}</Button>
                        <Button size="sm" variant="danger" disabled={busy === run.id} onClick={() => decide(run, "discard")}>{copy.discard}</Button>
                        {run.article ? (
                          <a href={`/kits/${run.article.kitId}`} className="text-[11px] font-bold text-action hover:underline">
                            {copy.openLibrary} ↗
                          </a>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel className="p-5 md:p-6">
            <h2 className="text-sm font-black text-fg">{copy.historyTitle}</h2>
            {history.length === 0 ? (
              <p className="mt-4 text-xs font-semibold text-fg-muted">—</p>
            ) : (
              <ul className="mt-4 grid gap-2">
                {history.map((run) => (
                  <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 px-3 py-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-fg-muted">
                        {run.channel === "xhs_cards" ? (en ? "cards" : "卡组") : (en ? "article" : "长文")}
                      </span>
                      <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-fg-muted">
                        {STATUS_LABELS[run.status][en ? "en" : "zh"]}
                      </span>
                      <span className="truncate font-semibold text-fg">
                        {run.article?.title ?? run.topicTitle ?? run.errorMessage ?? "—"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {run.publication ? (
                        <span className="rounded-full bg-action/10 px-2 py-0.5 text-[10px] font-bold text-action">{run.publication.statusLabel}</span>
                      ) : null}
                      {run.status === "failed" && run.article ? (
                        <button
                          type="button"
                          disabled={busy === run.id}
                          onClick={() => decide(run, "regenerate")}
                          className="font-bold text-action hover:underline disabled:opacity-50"
                        >
                          {copy.regenerate}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid content-start gap-5">
          <Panel className="p-5 md:p-6">
            <h2 className="text-sm font-black text-fg">{copy.settingsTitle}</h2>
            {settings ? (
              <div className="mt-4 grid gap-4 text-xs font-semibold text-fg-muted">
                <label className="flex items-center justify-between gap-3">
                  <span>{copy.generation}</span>
                  <Switch checked={settings.wechatArticlesEnabled} onCheckedChange={(value) => patchSettings({ wechatArticlesEnabled: value })} label={copy.generation} />
                </label>
                <label className="grid gap-1">
                  <span>{en ? "Article review mode" : "长文审核模式"}</span>
                  <select
                    value={settings.wechatReviewMode}
                    onChange={(event) => patchSettings({ wechatReviewMode: event.target.value as Settings["wechatReviewMode"] })}
                    className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs font-bold text-fg focus-ring"
                  >
                    <option value="every_post">{copy.reviewEvery}</option>
                    <option value="jev_guarded">{copy.reviewJev}</option>
                  </select>
                  {settings.wechatReviewMode === "jev_guarded" ? (
                    <span className="text-[10px] font-semibold leading-4 text-fg-muted">{copy.reviewJevHintArticles}</span>
                  ) : null}
                </label>
                <label className="grid gap-1">
                  <span>{copy.dailyCap}</span>
                  <input
                    type="number" min={0} max={3} value={settings.wechatDailyCap}
                    onChange={(event) => patchSettings({ wechatDailyCap: Number(event.target.value) })}
                    className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs font-bold text-fg focus-ring"
                  />
                </label>
                <label className="grid gap-1">
                  <span>{copy.theme}</span>
                  <select
                    value={settings.wechatTheme}
                    onChange={(event) => patchSettings({ wechatTheme: event.target.value as Settings["wechatTheme"] })}
                    className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs font-bold text-fg focus-ring"
                  >
                    <option value="default">{copy.themeDefault}</option>
                    <option value="grace">{copy.themeGrace}</option>
                    <option value="simple">{copy.themeSimple}</option>
                  </select>
                </label>
                <div className="border-t border-hairline pt-3" />
                <label className="flex items-center justify-between gap-3">
                  <span>{copy.cards}</span>
                  <Switch checked={settings.xhsCardsEnabled} onCheckedChange={(value) => patchSettings({ xhsCardsEnabled: value })} label={copy.cards} />
                </label>
                <label className="grid gap-1">
                  <span>{copy.cardType}</span>
                  <select
                    value={settings.xhsCardType}
                    onChange={(event) => patchSettings({ xhsCardType: event.target.value as Settings["xhsCardType"] })}
                    className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs font-bold text-fg focus-ring"
                  >
                    <option value="quote">{copy.cardTypeQuote}</option>
                    <option value="list">{copy.cardTypeList}</option>
                    <option value="opinion">{copy.cardTypeOpinion}</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  <span>{copy.cardTheme}</span>
                  <select
                    value={settings.xhsTheme}
                    onChange={(event) => patchSettings({ xhsTheme: event.target.value as Settings["xhsTheme"] })}
                    className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs font-bold text-fg focus-ring"
                  >
                    {STORY_THEMES.map((theme) => (
                      <option key={theme.id} value={theme.id}>{en ? theme.en : theme.zh}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span>{en ? "Card review mode" : "卡组审核模式"}</span>
                  <select
                    value={settings.xhsReviewMode}
                    onChange={(event) => patchSettings({ xhsReviewMode: event.target.value as Settings["xhsReviewMode"] })}
                    className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs font-bold text-fg focus-ring"
                  >
                    <option value="every_post">{copy.reviewEvery}</option>
                    <option value="jev_guarded">{copy.reviewJev}</option>
                  </select>
                  {settings.xhsReviewMode === "jev_guarded" ? (
                    <span className="text-[10px] font-semibold leading-4 text-fg-muted">{copy.reviewJevHintCards}</span>
                  ) : null}
                </label>
                <label className="grid gap-1">
                  <span>{copy.cardCap}</span>
                  <input
                    type="number" min={0} max={3} value={settings.xhsDailyCap}
                    onChange={(event) => patchSettings({ xhsDailyCap: Number(event.target.value) })}
                    className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs font-bold text-fg focus-ring"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="flex items-center justify-between gap-3">{copy.cardIllustration}
                    <Switch checked={settings.xhsWithIllustration} onCheckedChange={(value) => patchSettings({ xhsWithIllustration: value })} label={copy.cardIllustration} />
                  </span>
                  <span className="text-[10px] font-semibold leading-4 text-fg-muted">{copy.cardIllustrationHint}</span>
                </label>
                <div className="border-t border-hairline pt-3" />
                <label className="flex items-center justify-between gap-3">
                  <span>{copy.paused}</span>
                  <Switch checked={settings.paused} onCheckedChange={(value) => patchSettings({ paused: value, pausedReason: value ? "manual" : null })} label={copy.paused} />
                </label>
              </div>
            ) : (
              <p className="mt-4 text-xs font-semibold text-fg-muted">…</p>
            )}
          </Panel>

          <Panel className="p-5 md:p-6">
            <h2 className="text-sm font-black text-fg">{copy.magnetTitle}</h2>
            <p className="mt-2 text-[11px] font-semibold leading-5 text-fg-muted">{copy.magnetHint}</p>
            {settings ? (
              <>
                <ul className="mt-3 grid gap-2">
                  {settings.leadMagnets.map((magnet, index) => (
                    <li key={`${magnet.name}-${index}`} className="rounded-xl border border-border/50 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-bold text-fg">{magnet.name}</span>
                        <button
                          type="button"
                          onClick={() => saveMagnets(settings.leadMagnets.filter((_, i) => i !== index))}
                          className="shrink-0 font-bold text-risk hover:underline"
                        >
                          {copy.remove}
                        </button>
                      </div>
                      {magnet.deliveryNote ? <p className="mt-1 truncate text-[11px] text-fg-muted">{magnet.deliveryNote}</p> : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 grid gap-2">
                  <input
                    value={magnetDraft.name}
                    onChange={(event) => setMagnetDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder={copy.magnetName}
                    maxLength={60}
                    className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs font-semibold text-fg focus-ring"
                  />
                  <input
                    value={magnetDraft.deliveryNote}
                    onChange={(event) => setMagnetDraft((current) => ({ ...current, deliveryNote: event.target.value }))}
                    placeholder={copy.magnetDelivery}
                    maxLength={200}
                    className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs font-semibold text-fg focus-ring"
                  />
                  <input
                    value={magnetDraft.hookCopy}
                    onChange={(event) => setMagnetDraft((current) => ({ ...current, hookCopy: event.target.value }))}
                    placeholder={copy.magnetHook}
                    maxLength={200}
                    className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs font-semibold text-fg focus-ring"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      disabled={!magnetDraft.name.trim() || settings.leadMagnets.length >= 5}
                      onClick={() => {
                        const next = [...settings.leadMagnets, {
                          name: magnetDraft.name.trim(),
                          hookCopy: magnetDraft.hookCopy.trim(),
                          deliveryNote: magnetDraft.deliveryNote.trim()
                        }];
                        setMagnetDraft({ name: "", hookCopy: "", deliveryNote: "" });
                        void saveMagnets(next);
                      }}
                    >
                      {copy.add}
                    </Button>
                    {leadTools.length ? (
                      <select
                        value=""
                        onChange={(event) => {
                          const slug = event.target.value;
                          const tool = leadTools.find((candidate) => candidate.slug === slug);
                          if (!tool) return;
                          setMagnetDraft((current) => ({
                            name: current.name.trim() || tool.title,
                            hookCopy: current.hookCopy,
                            deliveryNote: current.deliveryNote.trim() || `/t/${tool.slug}`
                          }));
                        }}
                        className="min-w-0 flex-1 rounded-xl border border-border/60 bg-surface px-2 py-2 text-[11px] font-bold text-fg focus-ring"
                      >
                        <option value="">{copy.magnetFromTool}…</option>
                        {leadTools.map((tool) => (
                          <option key={tool.slug} value={tool.slug}>{tool.title}</option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
          </Panel>
        </div>
      </div>

      {/* Off-screen mounts at full format size — the zip export captures these. */}
      <div style={{ position: "fixed", left: -10000, top: 0 }} aria-hidden="true">
        {pendingCards.map((run) => {
          const story = run.story;
          if (!story) return null;
          const themeId = (STORY_THEMES.find((theme) => theme.id === story.theme)?.id ?? "editorial") as VisualStoryTheme;
          return story.pages.map((page, index) => (
            <div key={page.id} ref={(element) => { cardExportRefs.current[page.id] = element; }}>
              <VisualStoryCanvas
                page={toCanvasPage(page, index, story.pages.length)}
                pageIndex={index}
                pageCount={story.pages.length}
                storyTitle={story.title}
                themeId={themeId}
                format={visualStoryFormats["portrait-3x4"]}
                coverImageUrl={run.article?.imageUrl ?? undefined}
                locale={locale}
              />
            </div>
          ));
        })}
      </div>
    </div>
  );
}
