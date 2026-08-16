import type { KitOutput, VisualAsset } from "@/lib/content-schema";
import { escapeHtml, renderMarkdownBoldHtml, stripMarkdownBold } from "@/lib/inline-formatting";

export type PublicationTheme = "default" | "grace" | "simple";

export const publicationThemes: Record<PublicationTheme, {
  labelZh: string;
  labelEn: string;
  accent: string;
  text: string;
  muted: string;
  background: string;
  headingStyle: string;
  paragraphStyle: string;
}> = {
  default: {
    labelZh: "经典",
    labelEn: "Classic",
    accent: "#1f6f5f",
    text: "#20231f",
    muted: "#6d756e",
    background: "#ffffff",
    headingStyle: "margin:30px 0 14px;padding:0 0 8px;border-bottom:2px solid #1f6f5f;font-size:20px;line-height:1.45;font-weight:800;color:#20231f;",
    paragraphStyle: "margin:0 0 18px;font-size:16px;line-height:1.9;letter-spacing:.02em;color:#20231f;"
  },
  grace: {
    labelZh: "优雅",
    labelEn: "Grace",
    accent: "#a85f3a",
    text: "#332b27",
    muted: "#80736c",
    background: "#fffaf4",
    headingStyle: "margin:32px 0 16px;padding:12px 16px;border-left:4px solid #a85f3a;border-radius:0 12px 12px 0;background:#f7ede3;font-size:20px;line-height:1.45;font-weight:800;color:#332b27;",
    paragraphStyle: "margin:0 0 20px;font-size:16px;line-height:1.95;letter-spacing:.025em;color:#332b27;"
  },
  simple: {
    labelZh: "简洁",
    labelEn: "Simple",
    accent: "#3157d5",
    text: "#17191f",
    muted: "#697080",
    background: "#ffffff",
    headingStyle: "margin:34px 0 14px;font-size:21px;line-height:1.4;font-weight:850;color:#17191f;",
    paragraphStyle: "margin:0 0 17px;font-size:16px;line-height:1.82;letter-spacing:.01em;color:#17191f;"
  }
};

export type PublicationMetadataCheck = {
  key: "title" | "summary" | "cover" | "body" | "illustrations";
  ok: boolean;
  labelZh: string;
  labelEn: string;
  detailZh: string;
  detailEn: string;
};

export function validatePublicationMetadata(output: Pick<KitOutput, "title" | "body" | "finalBody" | "imageUrl" | "visualAssets">): PublicationMetadataCheck[] {
  const body = (output.finalBody || output.body).trim();
  const summary = firstUsefulParagraph(body);
  const currentAssets = currentVisualAssets(output.visualAssets);
  return [
    {
      key: "title",
      ok: output.title.trim().length >= 6 && output.title.trim().length <= 64,
      labelZh: "标题",
      labelEn: "Title",
      detailZh: "标题建议 6–30 个汉字，并在前半段写清主题。",
      detailEn: "Keep the title concise and name the topic early."
    },
    {
      key: "summary",
      ok: summary.length >= 36,
      labelZh: "摘要",
      labelEn: "Summary",
      detailZh: "会从第一段生成摘要；第一段应独立表达文章价值。",
      detailEn: "The first paragraph becomes the summary and should stand on its own."
    },
    {
      key: "cover",
      ok: Boolean(output.imageUrl),
      labelZh: "封面",
      labelEn: "Cover",
      detailZh: "公众号草稿需要一张独立封面图。",
      detailEn: "A dedicated cover image is required for a publishable article draft."
    },
    {
      key: "body",
      ok: body.length >= 350,
      labelZh: "正文",
      labelEn: "Body",
      detailZh: "正文至少应完整推进一个观点，而不是短帖扩写。",
      detailEn: "The body should advance a complete argument rather than pad a short post."
    },
    {
      key: "illustrations",
      ok: currentAssets.length > 0 || body.length < 900,
      labelZh: "配图节奏",
      labelEn: "Illustration rhythm",
      detailZh: "长文建议在证据、流程或对比处安排配图。",
      detailEn: "Long-form pieces benefit from visuals at evidence, process, or comparison moments."
    }
  ];
}

export function buildPublicationHtml(
  output: Pick<KitOutput, "title" | "body" | "finalBody" | "cta" | "visualAssets">,
  themeId: PublicationTheme
): string {
  const theme = publicationThemes[themeId];
  const body = (output.finalBody || output.body).trim();
  const assets = currentVisualAssets(output.visualAssets);
  const used = new Set<string>();
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const rendered = blocks.map((block) => {
    const asset = findMatchingAsset(block, assets, used);
    const content = renderBlock(block, theme);
    return asset ? `${content}${renderAsset(asset, theme)}` : content;
  });
  const unplaced = assets.filter((asset) => !used.has(assetKey(asset))).map((asset) => renderAsset(asset, theme));
  const cta = output.cta.trim()
    ? `<section style="margin:34px 0 8px;padding:18px 20px;border-radius:14px;background:${themeId === "simple" ? "#f3f6ff" : themeId === "grace" ? "#f7ede3" : "#edf5f2"};"><p style="margin:0;font-size:16px;line-height:1.75;font-weight:750;color:${theme.accent};">${renderMarkdownBoldHtml(output.cta, (content) => `<strong>${content}</strong>`)}</p></section>`
    : "";

  return `<section data-finfold-publication-theme="${themeId}" style="box-sizing:border-box;max-width:680px;margin:0 auto;padding:8px 4px 36px;background:${theme.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:${theme.text};word-break:break-word;"><h1 style="margin:8px 0 24px;font-size:28px;line-height:1.35;font-weight:900;letter-spacing:-.02em;color:${theme.text};">${renderMarkdownBoldHtml(output.title, (content) => `<strong>${content}</strong>`)}</h1>${[...rendered, ...unplaced].join("")}${cta}<p style="margin:30px 0 0;padding-top:14px;border-top:1px solid rgba(120,120,120,.18);font-size:11px;line-height:1.6;color:${theme.muted};">Finfold · Content Operations</p></section>`;
}

export function buildStandalonePublicationHtml(
  output: Pick<KitOutput, "title" | "body" | "finalBody" | "cta" | "visualAssets">,
  themeId: PublicationTheme,
  lang: "zh" | "en"
): string {
  const fragment = buildPublicationHtml(output, themeId);
  const description = stripMarkdownBold(firstUsefulParagraph((output.finalBody || output.body).trim())).slice(0, 160);
  return `<!doctype html>
<html lang="${lang === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="description" content="${escapeAttribute(description)}" />
  <title>${escapeHtml(stripMarkdownBold(output.title))}</title>
</head>
<body style="margin:0;padding:32px 18px;background:${publicationThemes[themeId].background};">
${fragment}
</body>
</html>`;
}

export function publicationSummary(output: Pick<KitOutput, "body" | "finalBody">): string {
  return firstUsefulParagraph((output.finalBody || output.body).trim()).slice(0, 120);
}

function renderBlock(block: string, theme: (typeof publicationThemes)[PublicationTheme]): string {
  const headingMatch = block.match(/^#{1,4}\s+([\s\S]+)$/);
  if (headingMatch) return `<h2 style="${theme.headingStyle}">${inlineMarkdown(headingMatch[1].trim(), theme.accent)}</h2>`;

  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  const listLines = lines.filter((line) => /^(?:[-*•]|[✅❌📌]|\d+[.)、])\s*/u.test(line));
  if (listLines.length >= 2 && listLines.length === lines.length) {
    return `<ul style="margin:4px 0 22px;padding:0;list-style:none;">${listLines.map((line) => {
      const clean = line.replace(/^(?:[-*•]|[✅❌📌]|\d+[.)、])\s*/u, "");
      return `<li style="position:relative;margin:0 0 10px;padding:10px 14px 10px 34px;border-radius:10px;background:rgba(120,120,120,.07);font-size:15px;line-height:1.75;color:${theme.text};"><span style="position:absolute;left:14px;color:${theme.accent};font-weight:900;">•</span>${inlineMarkdown(clean, theme.accent)}</li>`;
    }).join("")}</ul>`;
  }

  if (/^>\s*/u.test(block)) {
    return `<blockquote style="margin:4px 0 22px;padding:14px 18px;border-left:4px solid ${theme.accent};background:rgba(120,120,120,.06);font-size:15px;line-height:1.8;color:${theme.muted};">${inlineMarkdown(block.replace(/^>\s*/gm, ""), theme.accent)}</blockquote>`;
  }
  return `<p style="${theme.paragraphStyle}">${inlineMarkdown(block, theme.accent).replace(/\n/g, "<br/>")}</p>`;
}

function inlineMarkdown(value: string, accent: string): string {
  return renderMarkdownBoldHtml(value, (content) => `<strong style="font-weight:850;color:${accent};">${content}</strong>`)
    .replace(/`([^`]+)`/g, '<code style="padding:2px 5px;border-radius:5px;background:rgba(120,120,120,.1);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;">$1</code>');
}

function renderAsset(asset: VisualAsset, theme: (typeof publicationThemes)[PublicationTheme]): string {
  return `<figure style="margin:24px 0 28px;"><img src="${escapeAttribute(asset.imageUrl)}" alt="${escapeAttribute(asset.altText)}" style="display:block;width:100%;height:auto;border-radius:14px;box-shadow:0 10px 28px rgba(20,22,20,.08);"/><figcaption style="margin-top:8px;font-size:11px;line-height:1.5;text-align:center;color:${theme.muted};">${escapeHtml(asset.altText)}</figcaption></figure>`;
}

function currentVisualAssets(assets: VisualAsset[] | undefined): VisualAsset[] {
  return [...(assets ?? [])]
    .filter((asset) => asset.assetType === "article_illustration" && asset.isCurrent !== false && Boolean(asset.imageUrl))
    .sort((a, b) => a.positionIndex - b.positionIndex);
}

function findMatchingAsset(block: string, assets: VisualAsset[], used: Set<string>): VisualAsset | undefined {
  const normalized = normalize(block);
  const match = assets.find((asset) => {
    if (used.has(assetKey(asset))) return false;
    const anchor = normalize(asset.sourceExcerpt).replace(/…$/u, "");
    const probe = Array.from(anchor).slice(0, 56).join("");
    return Boolean(probe) && (normalized.includes(probe) || anchor.includes(Array.from(normalized).slice(0, 56).join("")));
  });
  if (match) used.add(assetKey(match));
  return match;
}

function firstUsefulParagraph(body: string): string {
  return body
    .replace(/^---[\s\S]*?---\s*/u, "")
    .split(/\n\s*\n/)
    .map((item) => item.replace(/^#{1,6}\s+/u, "").trim())
    .find((item) => item.length > 20) ?? "";
}

function assetKey(asset: VisualAsset): string {
  return asset.id || `${asset.positionIndex}:${asset.imageUrl}`;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
