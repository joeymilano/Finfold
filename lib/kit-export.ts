import type { ContentKit, KitOutput, VisualAsset } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import { escapeHtml, renderMarkdownBoldHtml, stripMarkdownBold } from "@/lib/inline-formatting";
import { getPlatform } from "@/lib/platforms";
import { displayContentTitle } from "@/lib/content-title";

export function formatOutput(output: KitOutput, platformLabel: string, locale: Locale): string {
  // finalBody holds the user's edited copy (migration 015) — copy/export
  // must reflect what the user actually approved, not the original AI draft.
  const body = stripMarkdownBold(formatBodyWithVisualAssets(output));
  const title = stripMarkdownBold(displayContentTitle(output.title, locale));
  const cta = stripMarkdownBold(output.cta);

  if (locale === "zh") {
    return `${platformLabel}\n\n标题：${title}\n\n正文：\n${body}\n\n转化动作：${cta}\n\n注意事项：${stripMarkdownBold(output.notes)}\n\n平台策略：${stripMarkdownBold(output.strategy)}`;
  }

  return `${platformLabel}\n\nTitle: ${title}\n\nBody:\n${body}\n\nCTA: ${cta}\n\nNotes: ${stripMarkdownBold(output.notes)}\n\nStrategy: ${stripMarkdownBold(output.strategy)}`;
}

export function formatAllOutputs(outputs: KitOutput[], locale: Locale): string {
  const header = locale === "zh"
    ? `# Finfold 内容包\n\n生成时间：${new Date().toLocaleString()}`
    : `# Finfold Content Kit\n\nGenerated: ${new Date().toLocaleString()}`;
  const body = outputs
    .map((output) => {
      const platform = getPlatform(output.platform);
      return `## ${platform.label}\n\n${formatOutput(output, platform.label, locale)}`;
    })
    .join("\n\n---\n\n");

  return `${header}\n\n${body}\n`;
}

export function downloadMarkdown(filename: string, markdown: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadKitMarkdown(kit: ContentKit, locale: Locale): void {
  downloadMarkdown(`finfold-content-kit-${kit.id.slice(0, 8)}.md`, formatAllOutputs(kit.outputs, locale));
}

export async function copyOutputsToClipboard(outputs: KitOutput[], locale: Locale): Promise<void> {
  const plain = formatAllOutputs(outputs, locale);
  const html = formatAllOutputsHTML(outputs, locale);
  await writeRichText(plain, html);
}

export async function copyKitToClipboard(kit: ContentKit, locale: Locale): Promise<void> {
  await copyOutputsToClipboard(kit.outputs, locale);
}

/**
 * 生成单平台草稿的结构化 HTML —— 标题/正文段落/CTA 分层，段落内单换行转 <br/>。
 * 这样复制到公众号、LinkedIn、Medium、Product Hunt 等富文本编辑器后排版（换行、
 * 段落、强调）不乱；纯文本平台（小红书/X/Reddit）会自动 fallback 到 text/plain。
 */
export function formatOutputHTML(output: KitOutput, locale: Locale): string {
  const body = output.finalBody ?? output.body;
  const assets = orderedVisualAssets(output.visualAssets);
  const usedAssets = new Set<string>();
  const bodyBlocks = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const bodyHtml = bodyBlocks
    .map((block) => {
      const paragraph = `<p style="margin:0 0 12px;line-height:1.7;">${renderMarkdownBoldHtml(block, (content) => `<strong style="font-weight:700;">${content}</strong>`).replace(/\n/g, "<br/>")}</p>`;
      const matched = findMatchingAsset(block, assets, usedAssets);
      return matched ? `${paragraph}${formatVisualAssetHTML(matched)}` : paragraph;
    })
    .join("") + assets.filter((asset) => !usedAssets.has(assetKey(asset))).map(formatVisualAssetHTML).join("");

  const titleHtml = `<h2 style="font-size:18px;font-weight:700;margin:0 0 12px;line-height:1.4;">${renderMarkdownBoldHtml(displayContentTitle(output.title, locale), (content) => `<strong>${content}</strong>`)}</h2>`;
  const ctaHtml = output.cta
    ? `<p style="margin:16px 0 0;font-weight:600;">${renderMarkdownBoldHtml(output.cta, (content) => `<strong>${content}</strong>`)}</p>`
    : "";

  return `<section style="font-family:-apple-system,'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;color:#1a1a1a;max-width:680px;">${titleHtml}${bodyHtml}${ctaHtml}</section>`;
}

/** 整包 HTML：各平台用分隔线隔开。 */
export function formatAllOutputsHTML(outputs: KitOutput[], locale: Locale): string {
  const header = locale === "zh"
    ? `<h1 style="font-size:20px;font-weight:700;margin:0 0 16px;">Finfold 内容包</h1>`
    : `<h1 style="font-size:20px;font-weight:700;margin:0 0 16px;">Finfold Content Kit</h1>`;
  const body = outputs
    .map((output, index) => {
      const sep = index > 0 ? `<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;"/>` : "";
      return `${sep}${formatOutputHTML(output, locale)}`;
    })
    .join("");
  return `<div style="max-width:680px;">${header}${body}</div>`;
}

/**
 * 同时写入 text/plain 与 text/html。富文本平台拿到 HTML 保留排版，纯文本平台
 * 自动用 plain。ClipboardItem 不支持或 write 被拒时降级为 writeText（纯文本）。
 */
async function writeRichText(plain: string, html: string): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && typeof navigator !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" })
        })
      ]);
      return;
    } catch {
      // write 失败（如非用户手势触发）→ fallback writeText。
    }
  }
  await navigator.clipboard.writeText(plain);
}

/** 复制单平台草稿到剪贴板（富文本，多 MIME）。 */
export async function copyOutputRich(output: KitOutput, locale: Locale): Promise<void> {
  const platform = getPlatform(output.platform);
  const plain = formatOutput(output, platform.label, locale);
  const html = formatOutputHTML(output, locale);
  await writeRichText(plain, html);
}

export function formatBodyWithVisualAssets(output: Pick<KitOutput, "body" | "finalBody" | "visualAssets">): string {
  const body = stripMarkdownBold(output.finalBody ?? output.body);
  const assets = orderedVisualAssets(output.visualAssets);
  if (assets.length === 0) return body;

  const usedAssets = new Set<string>();
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const withPlacedAssets = blocks.map((block) => {
    const matched = findMatchingAsset(block, assets, usedAssets);
    return matched ? `${block}\n\n${formatVisualAssetMarkdown(matched)}` : block;
  });
  const unplaced = assets.filter((asset) => !usedAssets.has(assetKey(asset))).map(formatVisualAssetMarkdown);
  return [...withPlacedAssets, ...unplaced].join("\n\n");
}

function orderedVisualAssets(assets: VisualAsset[] | undefined): VisualAsset[] {
  return [...(assets ?? [])]
    .filter((asset) => asset.assetType === "article_illustration" && asset.isCurrent !== false && Boolean(asset.imageUrl))
    .sort((a, b) => a.positionIndex - b.positionIndex);
}

function findMatchingAsset(block: string, assets: VisualAsset[], used: Set<string>): VisualAsset | undefined {
  const normalizedBlock = normalizePlacementText(block);
  const matched = assets.find((asset) => {
    if (used.has(assetKey(asset))) return false;
    const anchor = normalizePlacementText(asset.sourceExcerpt).replace(/…$/u, "");
    if (!anchor) return false;
    const probe = Array.from(anchor).slice(0, 56).join("");
    return normalizedBlock.includes(probe) || anchor.includes(Array.from(normalizedBlock).slice(0, 56).join(""));
  });
  if (matched) used.add(assetKey(matched));
  return matched;
}

function formatVisualAssetMarkdown(asset: VisualAsset): string {
  return `![${markdownAlt(asset.altText)}](${asset.imageUrl})`;
}

function formatVisualAssetHTML(asset: VisualAsset): string {
  return `<figure style="margin:18px 0 22px;"><img src="${escapeHtml(asset.imageUrl)}" alt="${escapeHtml(asset.altText)}" style="display:block;width:100%;height:auto;border-radius:12px;"/></figure>`;
}

function normalizePlacementText(value: string): string {
  return stripMarkdownBold(value).replace(/\s+/g, "").trim();
}

function markdownAlt(value: string): string {
  return value.replace(/[\[\]\\]/g, "").trim();
}

function assetKey(asset: VisualAsset): string {
  return asset.id || `${asset.assetType}:${asset.positionIndex}:${asset.imageUrl}`;
}
