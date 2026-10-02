"use client";

import React, { useMemo, useState } from "react";
import { Check, Clipboard, Download, FileCode2, ShieldCheck, X } from "@/components/ui/icons";
import type { KitOutput } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import { displayContentTitle } from "@/lib/content-title";
import {
  buildPublicationHtml,
  buildStandalonePublicationHtml,
  publicationSummary,
  publicationThemes,
  validatePublicationMetadata,
  validateWechatCompliance,
  type PublicationTheme
} from "@/lib/publication-html";

type Props = {
  output: KitOutput;
  locale: Locale;
  canExport?: boolean;
  onLockedExport?: () => void;
  onConfirmImageRights?: () => Promise<boolean>;
  onClose: () => void;
};

export function PublicationStudio({ output, locale, canExport = true, onLockedExport, onConfirmImageRights, onClose }: Props) {
  const [theme, setTheme] = useState<PublicationTheme>("default");
  const [copied, setCopied] = useState(false);
  const presentableOutput = useMemo(
    () => ({ ...output, title: displayContentTitle(output.title, locale) }),
    [locale, output]
  );
  const fragment = useMemo(() => buildPublicationHtml(presentableOutput, theme), [presentableOutput, theme]);
  const standalone = useMemo(() => buildStandalonePublicationHtml(presentableOutput, theme, locale), [locale, presentableOutput, theme]);
  const checks = useMemo(() => validatePublicationMetadata(presentableOutput), [presentableOutput]);
  const passed = checks.filter((check) => check.ok).length;
  const compliance = useMemo(() => validateWechatCompliance(fragment), [fragment]);
  const compliancePassed = compliance.filter((check) => check.ok).length;

  async function copyRichHtml() {
    if (!canExport) {
      onLockedExport?.();
      return;
    }
    if (output.imageUrl && onConfirmImageRights && !(await onConfirmImageRights())) return;
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([fragment], { type: "text/html" }),
            "text/plain": new Blob([`${presentableOutput.title}\n\n${output.finalBody || output.body}\n\n${output.cta}`], { type: "text/plain" })
          })
        ]);
      } else {
        await navigator.clipboard.writeText(fragment);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      await navigator.clipboard.writeText(fragment);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  async function downloadHtml() {
    if (!canExport) {
      onLockedExport?.();
      return;
    }
    if (output.imageUrl && onConfirmImageRights && !(await onConfirmImageRights())) return;
    downloadFile(
      `finfold-article-${new Date().toISOString().slice(0, 10)}.html`,
      standalone,
      "text/html;charset=utf-8"
    );
  }

  async function downloadMetadata() {
    if (!canExport) {
      onLockedExport?.();
      return;
    }
    if (output.imageUrl && onConfirmImageRights && !(await onConfirmImageRights())) return;
    downloadFile(
      `finfold-article-metadata-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({
        schemaVersion: 1,
        title: presentableOutput.title,
        summary: publicationSummary(output),
        coverImageUrl: output.imageUrl || null,
        platform: output.platform,
        checks
      }, null, 2),
      "application/json"
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="publication-studio-title" className="fixed inset-0 z-50 flex items-center justify-center bg-fg/55 p-0 backdrop-blur-sm md:p-4">
      <div className="rk-enter flex h-dvh w-full max-w-[1280px] flex-col overflow-hidden border border-hairline bg-surface shadow-panel md:h-[calc(100vh-2rem)] md:rounded-2xl 2xl:max-w-[1600px]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3 md:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/[0.12] text-brand"><FileCode2 className="h-4 w-4" /></span>
              <div>
                <h2 id="publication-studio-title" className="text-sm font-bold text-fg">{locale === "zh" ? "公众号发布包" : "Editorial publication package"}</h2>
                <p className="text-[10px] text-fg-muted">{locale === "zh" ? "内联样式 HTML · 元数据检查 · 独立文件" : "Inline HTML · metadata gate · standalone file"}</p>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={locale === "zh" ? "关闭" : "Close"} className="focus-ring rounded-lg p-2 text-fg-muted hover:bg-surface-2 hover:text-fg"><X className="h-4 w-4" /></button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-b border-hairline p-4 lg:border-b-0 lg:border-r lg:p-5">
            <section>
              <p className="eyebrow">{locale === "zh" ? "排版主题" : "Editorial theme"}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(Object.keys(publicationThemes) as PublicationTheme[]).map((themeId) => {
                  const item = publicationThemes[themeId];
                  return (
                    <button key={themeId} type="button" onClick={() => setTheme(themeId)} aria-pressed={theme === themeId} className={`focus-ring rounded-xl border p-2 text-left ${theme === themeId ? "border-brand shadow-panel" : "border-hairline"}`}>
                      <span className="block h-8 rounded-lg" style={{ background: item.background, borderLeft: `8px solid ${item.accent}` }} />
                      <span className="mt-1.5 block text-[9px] font-bold text-fg">{locale === "zh" ? item.labelZh : item.labelEn}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mt-5 border-t border-hairline pt-5">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">{locale === "zh" ? "发布前检查" : "Preflight"}</p>
                <span className={`rounded-full px-2 py-1 text-[9px] font-black ${passed === checks.length ? "bg-positive/10 text-positive" : "bg-warn/10 text-warn"}`}>{passed}/{checks.length}</span>
              </div>
              <div className="mt-3 grid gap-2">
                {checks.map((check) => (
                  <div key={check.key} className="flex items-start gap-2 rounded-lg border border-hairline bg-surface-2/60 px-3 py-2">
                    {check.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" /> : <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warn" />}
                    <div>
                      <p className="text-[10px] font-bold text-fg">{locale === "zh" ? check.labelZh : check.labelEn}</p>
                      {!check.ok ? <p className="mt-0.5 text-[9px] leading-4 text-fg-muted">{locale === "zh" ? check.detailZh : check.detailEn}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-hairline pt-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-fg-muted">{locale === "zh" ? "粘贴安全" : "Paste safety"}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${compliancePassed === compliance.length ? "bg-positive/10 text-positive" : "bg-warn/10 text-warn"}`}>{compliancePassed}/{compliance.length}</span>
                </div>
                {compliancePassed === compliance.length ? (
                  <p className="mt-1.5 text-[9px] leading-4 text-fg-muted">{locale === "zh" ? "排版全部内联，粘贴进编辑器不会丢格式" : "Fully inlined formatting survives the editor paste"}</p>
                ) : (
                  <div className="mt-1.5 grid gap-1.5">
                    {compliance.filter((check) => !check.ok).map((check) => (
                      <div key={check.key} className="rounded-lg border border-hairline bg-warn/[0.06] px-3 py-1.5">
                        <p className="text-[10px] font-bold text-fg">{locale === "zh" ? check.labelZh : check.labelEn}</p>
                        <p className="mt-0.5 text-[9px] leading-4 text-fg-muted">{locale === "zh" ? check.detailZh : check.detailEn}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-brand/[0.06] px-3 py-2 text-[9px] leading-4 text-fg-muted">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                {locale === "zh" ? "Finfold 不会自动替你发布；确认标题、封面和正文后，再复制到公众号后台。" : "Finfold does not publish automatically. Confirm title, cover, and body before moving this package into your CMS."}
              </p>
            </section>

            <section className="mt-5 grid gap-2 border-t border-hairline pt-5">
              <button type="button" onClick={() => void copyRichHtml()} className="btn-primary focus-ring justify-center px-3 py-2.5 text-xs">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
                {!canExport ? (locale === "zh" ? "升级后复制" : "Upgrade to copy") : copied ? (locale === "zh" ? "已复制" : "Copied") : (locale === "zh" ? "复制富文本 HTML" : "Copy rich HTML")}
              </button>
              <button type="button" onClick={() => void downloadHtml()} className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline px-3 py-2.5 text-xs font-bold text-fg hover:bg-surface-2">
                <Download className="h-3.5 w-3.5" />{locale === "zh" ? "下载独立 HTML" : "Download standalone HTML"}
              </button>
              <button type="button" onClick={() => void downloadMetadata()} className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-bold text-fg-muted hover:bg-surface-2 hover:text-fg">
                <FileCode2 className="h-3.5 w-3.5" />{locale === "zh" ? "下载发布元数据" : "Download metadata"}
              </button>
            </section>
          </aside>

          <main className="min-h-0 overflow-auto bg-surface-2 p-4 md:p-8">
            <div className="mx-auto max-w-[760px] overflow-hidden rounded-2xl border border-hairline bg-white shadow-raised">
              <iframe title={locale === "zh" ? "公众号文章预览" : "Publication preview"} srcDoc={standalone} sandbox="" className="h-[760px] w-full border-0 bg-white" />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function downloadFile(filename: string, content: string, type: string) {
  const blobUrl = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(blobUrl);
}
