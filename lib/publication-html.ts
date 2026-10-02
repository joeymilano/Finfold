import type { KitOutput, VisualAsset } from "@/lib/content-schema";
import { escapeHtml, renderMarkdownBoldHtml, stripMarkdownBold } from "@/lib/inline-formatting";

export type PublicationTheme = "default" | "grace" | "simple" | "magazine" | "techblue" | "sunset";

export type PublicationHtmlOptions = {
  includeTitle?: boolean;
  includeAttribution?: boolean;
};

export type PublicationThemeDef = {
  labelZh: string;
  labelEn: string;
  accent: string;
  text: string;
  muted: string;
  background: string;
  headingStyle: string;
  paragraphStyle: string;
  quoteStyle: string;
  dividerHtml: string;
  preStyle: string;
  preCodeStyle: string;
  olItemStyle: string;
  olBadgeStyle: string;
  tableWrapStyle: string;
  tableStyle: string;
  thStyle: string;
  tdStyle: string;
};

export const publicationThemes: Record<PublicationTheme, PublicationThemeDef> = {
  default: {
    labelZh: "经典",
    labelEn: "Classic",
    accent: "#1f6f5f",
    text: "#20231f",
    muted: "#6d756e",
    background: "#ffffff",
    headingStyle: "margin:30px 0 14px;padding:0 0 8px;border-bottom:2px solid #1f6f5f;font-size:20px;line-height:1.45;font-weight:800;color:#20231f;",
    paragraphStyle: "margin:0 0 18px;font-size:16px;line-height:1.9;letter-spacing:.02em;color:#20231f;",
    quoteStyle: "margin:4px 0 22px;padding:16px 20px;border-left:4px solid #1f6f5f;border-radius:0 12px 12px 0;background:#f2f7f5;font-size:16px;line-height:1.85;font-weight:600;color:#1f6f5f;",
    dividerHtml: '<hr style="margin:30px 0;border:none;border-top:1px solid rgba(32,35,31,.16);" />',
    preStyle: "margin:4px 0 22px;padding:14px 16px;border-radius:12px;background:#1f2622;overflow-x:auto;",
    preCodeStyle: "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.7;color:#e6efe9;white-space:pre;",
    olItemStyle: "position:relative;margin:0 0 10px;padding:10px 14px 10px 46px;border-radius:10px;background:rgba(31,111,95,.08);font-size:15px;line-height:1.75;color:#20231f;",
    olBadgeStyle: "position:absolute;left:14px;top:12px;width:22px;height:22px;border-radius:50%;background:#1f6f5f;color:#ffffff;font-size:12px;font-weight:900;line-height:22px;text-align:center;",
    tableWrapStyle: "margin:4px 0 24px;padding:0;overflow-x:auto;",
    tableStyle: "width:100%;border-collapse:collapse;font-size:14px;",
    thStyle: "padding:10px 12px;background:rgba(31,111,95,.12);border:1px solid rgba(31,111,95,.22);font-weight:800;color:#1f6f5f;text-align:left;",
    tdStyle: "padding:9px 12px;border:1px solid rgba(32,35,31,.14);color:#20231f;"
  },
  grace: {
    labelZh: "优雅",
    labelEn: "Grace",
    accent: "#a85f3a",
    text: "#332b27",
    muted: "#80736c",
    background: "#fffaf4",
    headingStyle: "margin:32px 0 16px;padding:12px 16px;border-left:4px solid #a85f3a;border-radius:0 12px 12px 0;background:#f7ede3;font-size:20px;line-height:1.45;font-weight:800;color:#332b27;",
    paragraphStyle: "margin:0 0 20px;font-size:16px;line-height:1.95;letter-spacing:.025em;color:#332b27;",
    quoteStyle: "margin:4px 0 22px;padding:18px 20px;border-radius:14px;background:#f7ede3;font-size:16px;line-height:1.85;font-weight:600;color:#a85f3a;text-align:center;",
    dividerHtml: '<hr style="margin:32px 0;border:none;border-top:1px dashed rgba(168,95,58,.38);" />',
    preStyle: "margin:4px 0 22px;padding:14px 16px;border-radius:12px;background:#2d221a;overflow-x:auto;",
    preCodeStyle: "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.7;color:#f3e6da;white-space:pre;",
    olItemStyle: "position:relative;margin:0 0 10px;padding:10px 14px 10px 46px;border-radius:12px;background:#f7ede3;font-size:15px;line-height:1.75;color:#332b27;",
    olBadgeStyle: "position:absolute;left:14px;top:12px;width:22px;height:22px;border-radius:50%;background:#a85f3a;color:#ffffff;font-size:12px;font-weight:900;line-height:22px;text-align:center;",
    tableWrapStyle: "margin:4px 0 24px;padding:12px;border-radius:14px;background:#f7ede3;overflow-x:auto;",
    tableStyle: "width:100%;border-collapse:collapse;font-size:14px;",
    thStyle: "padding:10px 12px;border-bottom:2px solid #a85f3a;font-weight:800;color:#a85f3a;text-align:left;",
    tdStyle: "padding:9px 12px;border-bottom:1px solid rgba(168,95,58,.22);color:#332b27;"
  },
  simple: {
    labelZh: "简洁",
    labelEn: "Simple",
    accent: "#3157d5",
    text: "#17191f",
    muted: "#697080",
    background: "#ffffff",
    headingStyle: "margin:34px 0 14px;font-size:21px;line-height:1.4;font-weight:850;color:#17191f;",
    paragraphStyle: "margin:0 0 17px;font-size:16px;line-height:1.82;letter-spacing:.01em;color:#17191f;",
    quoteStyle: "margin:4px 0 22px;padding:14px 18px;border-left:3px solid #3157d5;background:#f5f7ff;font-size:15px;line-height:1.8;color:#44506e;",
    dividerHtml: '<hr style="margin:30px 0;border:none;border-top:1px solid rgba(23,25,31,.14);" />',
    preStyle: "margin:4px 0 22px;padding:14px 16px;border-radius:10px;background:#141821;overflow-x:auto;",
    preCodeStyle: "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.7;color:#e3e8f4;white-space:pre;",
    olItemStyle: "position:relative;margin:0 0 10px;padding:9px 12px 9px 42px;font-size:15px;line-height:1.75;color:#17191f;",
    olBadgeStyle: "position:absolute;left:10px;top:10px;min-width:20px;font-size:14px;font-weight:900;color:#3157d5;",
    tableWrapStyle: "margin:4px 0 24px;padding:0;overflow-x:auto;",
    tableStyle: "width:100%;border-collapse:collapse;font-size:14px;",
    thStyle: "padding:10px 12px;border-top:2px solid #3157d5;border-bottom:1px solid rgba(23,25,31,.22);font-weight:800;color:#17191f;text-align:left;",
    tdStyle: "padding:9px 12px;border-bottom:1px solid rgba(23,25,31,.12);color:#17191f;"
  },
  magazine: {
    labelZh: "杂志",
    labelEn: "Magazine",
    accent: "#b3402a",
    text: "#26211d",
    muted: "#7a7168",
    background: "#fbfaf7",
    headingStyle: "margin:36px 0 14px;font-family:Georgia,'Times New Roman','Songti SC','SimSun',serif;font-size:22px;line-height:1.42;font-weight:700;color:#26211d;",
    paragraphStyle: "margin:0 0 19px;font-family:Georgia,'Times New Roman','Songti SC','SimSun',serif;font-size:16px;line-height:1.92;color:#26211d;",
    quoteStyle: "margin:6px 24px 26px;padding:4px 0 4px 20px;border-left:none;text-align:center;font-family:Georgia,'Times New Roman','Songti SC','SimSun',serif;font-size:18px;line-height:1.8;font-style:italic;font-weight:600;color:#b3402a;",
    dividerHtml: '<p style="margin:32px 0;text-align:center;letter-spacing:.6em;color:#b3402a;">◆◆◆</p>',
    preStyle: "margin:4px 0 22px;padding:14px 16px;border-radius:8px;background:#2a2420;overflow-x:auto;",
    preCodeStyle: "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.7;color:#f0e9df;white-space:pre;",
    olItemStyle: "position:relative;margin:0 0 12px;padding:2px 0 2px 44px;font-family:Georgia,'Times New Roman','Songti SC','SimSun',serif;font-size:16px;line-height:1.8;color:#26211d;",
    olBadgeStyle: "position:absolute;left:0;top:2px;width:30px;font-family:Georgia,'Times New Roman','Songti SC','SimSun',serif;font-size:26px;line-height:1.1;font-weight:700;color:#b3402a;",
    tableWrapStyle: "margin:6px 0 26px;padding:0;overflow-x:auto;",
    tableStyle: "width:100%;border-collapse:collapse;font-family:Georgia,'Times New Roman','Songti SC','SimSun',serif;font-size:14px;",
    thStyle: "padding:10px 12px;border-top:2px solid #26211d;border-bottom:1px solid #26211d;font-weight:700;color:#26211d;text-align:left;",
    tdStyle: "padding:9px 12px;border-bottom:1px solid rgba(38,33,29,.2);color:#26211d;"
  },
  techblue: {
    labelZh: "科技",
    labelEn: "Tech Blue",
    accent: "#2563eb",
    text: "#16203a",
    muted: "#64708c",
    background: "#f7faff",
    headingStyle: "margin:32px 0 14px;padding:10px 14px;border-radius:10px;background:#eaf1fe;border-left:4px solid #2563eb;font-size:20px;line-height:1.45;font-weight:800;color:#16203a;",
    paragraphStyle: "margin:0 0 18px;font-size:16px;line-height:1.85;color:#16203a;",
    quoteStyle: "margin:4px 0 22px;padding:14px 18px;border-radius:12px;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.2);font-size:15px;line-height:1.8;color:#2c3f6b;",
    dividerHtml: '<hr style="margin:30px 0;border:none;height:2px;background:linear-gradient(90deg,#2563eb 0%,rgba(37,99,235,.08) 100%);" />',
    preStyle: "margin:4px 0 22px;padding:14px 16px;border-radius:12px;border:1px solid rgba(37,99,235,.24);background:#101828;overflow-x:auto;",
    preCodeStyle: "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.7;color:#9ec1ff;white-space:pre;",
    olItemStyle: "position:relative;margin:0 0 10px;padding:10px 14px 10px 48px;border-radius:10px;background:#eaf1fe;font-size:15px;line-height:1.75;color:#16203a;",
    olBadgeStyle: "position:absolute;left:14px;top:11px;width:24px;height:24px;border-radius:7px;background:#2563eb;color:#ffffff;font-size:12px;font-weight:900;line-height:24px;text-align:center;",
    tableWrapStyle: "margin:4px 0 24px;padding:12px;border-radius:12px;border:1px solid rgba(37,99,235,.18);background:#ffffff;overflow-x:auto;",
    tableStyle: "width:100%;border-collapse:collapse;font-size:14px;",
    thStyle: "padding:10px 12px;background:#eaf1fe;border-bottom:2px solid #2563eb;font-weight:800;color:#16203a;text-align:left;",
    tdStyle: "padding:9px 12px;border-bottom:1px solid rgba(22,32,58,.12);color:#16203a;"
  },
  sunset: {
    labelZh: "暖阳",
    labelEn: "Sunset",
    accent: "#d9622b",
    text: "#3f3128",
    muted: "#8c7a6a",
    background: "#fff9f2",
    headingStyle: "margin:32px 0 14px;padding:10px 18px;border-radius:999px;background:rgba(217,98,43,.12);font-size:20px;line-height:1.45;font-weight:800;color:#d9622b;",
    paragraphStyle: "margin:0 0 19px;font-size:16px;line-height:1.9;color:#3f3128;",
    quoteStyle: "margin:6px 0 24px;padding:16px 20px;border-radius:16px;background:rgba(217,98,43,.1);font-size:16px;line-height:1.85;font-weight:650;color:#b14e1d;text-align:center;",
    dividerHtml: '<p style="margin:32px 0;text-align:center;font-size:18px;letter-spacing:.5em;color:#d9622b;">· · ·</p>',
    preStyle: "margin:4px 0 22px;padding:14px 16px;border-radius:16px;background:#3a2c22;overflow-x:auto;",
    preCodeStyle: "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.7;color:#f7e8db;white-space:pre;",
    olItemStyle: "position:relative;margin:0 0 10px;padding:10px 14px 10px 46px;border-radius:14px;background:rgba(217,98,43,.09);font-size:15px;line-height:1.75;color:#3f3128;",
    olBadgeStyle: "position:absolute;left:14px;top:12px;width:22px;height:22px;border-radius:50%;background:#d9622b;color:#ffffff;font-size:12px;font-weight:900;line-height:22px;text-align:center;",
    tableWrapStyle: "margin:4px 0 24px;padding:12px;border-radius:16px;background:#ffffff;overflow-x:auto;",
    tableStyle: "width:100%;border-collapse:separate;border-spacing:0;font-size:14px;",
    thStyle: "padding:10px 12px;background:rgba(217,98,43,.14);font-weight:800;color:#b14e1d;text-align:left;",
    tdStyle: "padding:9px 12px;border-bottom:1px solid rgba(217,98,43,.18);color:#3f3128;"
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

export type WechatComplianceCheck = {
  key: "inline-styles" | "forbidden-tags" | "forbidden-attributes" | "forbidden-css";
  ok: boolean;
  labelZh: string;
  labelEn: string;
  detailZh: string;
  detailEn: string;
};

/**
 * The WeChat editor strips classes, ids, and unsupported tags on paste.
 * A publishable fragment must be self-contained through inline styles only —
 * anything this check rejects would silently lose formatting in the editor.
 */
export function validateWechatCompliance(fragment: string): WechatComplianceCheck[] {
  const tags = fragment.match(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g) ?? [];
  const styleless = tags.filter((tag) => !/^<br\b/i.test(tag) && !/\sstyle="/.test(tag));
  const forbiddenTagMatch = fragment.match(/<(script|style|iframe|form|input|link|meta)\b/i);
  const usesClassOrId = /\s(?:class|id)="/.test(fragment);
  const forbiddenCssMatch = fragment.match(/position:\s*fixed|javascript:|expression\s*\(/i);
  return [
    {
      key: "inline-styles",
      ok: styleless.length === 0,
      labelZh: "样式内联",
      labelEn: "Inline styles",
      detailZh: "每个元素自带内联样式，粘贴后排版不丢失",
      detailEn: "Every element carries its own inline style so formatting survives paste"
    },
    {
      key: "forbidden-tags",
      ok: !forbiddenTagMatch,
      labelZh: "安全标签",
      labelEn: "Safe tags",
      detailZh: forbiddenTagMatch ? `包含会被编辑器过滤的标签：${forbiddenTagMatch[0]}` : "不含会被编辑器过滤的标签",
      detailEn: "No tags that the editor filters out on paste"
    },
    {
      key: "forbidden-attributes",
      ok: !usesClassOrId,
      labelZh: "安全属性",
      labelEn: "Safe attributes",
      detailZh: usesClassOrId ? "存在 class 或 id 属性，粘贴时会被剥离" : "不含 class 或 id 属性",
      detailEn: "No class or id attributes that the editor strips"
    },
    {
      key: "forbidden-css",
      ok: !forbiddenCssMatch,
      labelZh: "安全样式",
      labelEn: "Safe CSS",
      detailZh: forbiddenCssMatch ? `包含会被过滤的样式：${forbiddenCssMatch[0]}` : "不含 fixed 定位或脚本协议",
      detailEn: "No fixed positioning or script protocols inside styles"
    }
  ];
}

export function buildPublicationHtml(
  output: Pick<KitOutput, "title" | "body" | "finalBody" | "cta" | "visualAssets">,
  themeId: PublicationTheme,
  options: PublicationHtmlOptions = {}
): string {
  const includeTitle = options.includeTitle !== false;
  const includeAttribution = options.includeAttribution !== false;
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

  const title = includeTitle
    ? `<h1 style="margin:8px 0 24px;font-size:28px;line-height:1.35;font-weight:900;letter-spacing:-.02em;color:${theme.text};">${renderMarkdownBoldHtml(output.title, (content) => `<strong>${content}</strong>`)}</h1>`
    : "";
  const attribution = includeAttribution
    ? `<p style="margin:30px 0 0;padding-top:14px;border-top:1px solid rgba(120,120,120,.18);font-size:11px;line-height:1.6;color:${theme.muted};">Finfold · Content Operations</p>`
    : "";

  return `<section data-finfold-publication-theme="${themeId}" style="box-sizing:border-box;max-width:680px;margin:0 auto;padding:8px 4px 36px;background:${theme.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:${theme.text};word-break:break-word;">${title}${[...rendered, ...unplaced].join("")}${cta}${attribution}</section>`;
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

function renderBlock(block: string, theme: PublicationThemeDef): string {
  const headingMatch = block.match(/^#{1,4}\s+([\s\S]+)$/);
  if (headingMatch) return `<h2 style="${theme.headingStyle}">${inlineMarkdown(headingMatch[1].trim(), theme.accent)}</h2>`;

  const trimmed = block.trim();
  if (/^(?:-{3,}|\*{3,}|_{3,})$/u.test(trimmed)) return theme.dividerHtml;

  const fenced = trimmed.match(/^```[a-zA-Z0-9+-]*\n([\s\S]*?)\n?```$/u);
  if (fenced) return `<pre style="${theme.preStyle}"><code style="${theme.preCodeStyle}">${escapeHtml(fenced[1])}</code></pre>`;

  const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/u);
  if (imageMatch) {
    const alt = imageMatch[1].trim();
    return `<figure style="margin:24px 0 28px;"><img src="${escapeAttribute(imageMatch[2])}" alt="${escapeAttribute(alt)}" style="display:block;width:100%;height:auto;border-radius:14px;box-shadow:0 10px 28px rgba(20,22,20,.08);" />${alt ? `<figcaption style="margin-top:8px;font-size:11px;line-height:1.5;text-align:center;color:${theme.muted};">${escapeHtml(alt)}</figcaption>` : ""}</figure>`;
  }

  const table = parseMarkdownTable(trimmed);
  if (table) {
    const [header, ...rows] = table;
    return `<section style="${theme.tableWrapStyle}"><table style="${theme.tableStyle}"><thead style="display:table-header-group;"><tr style="page-break-inside:avoid;">${header.map((cell) => `<th style="${theme.thStyle}">${inlineMarkdown(cell, theme.accent)}</th>`).join("")}</tr></thead><tbody style="display:table-row-group;">${rows.map((row) => `<tr style="page-break-inside:avoid;">${row.map((cell) => `<td style="${theme.tdStyle}">${inlineMarkdown(cell, theme.accent)}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
  }

  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);

  const orderedLines = lines.filter((line) => /^\d+[.)、）]\s*/u.test(line));
  if (orderedLines.length >= 2 && orderedLines.length === lines.length) {
    return `<ol style="margin:4px 0 22px;padding:0;list-style:none;">${lines.map((line, index) => {
      const clean = line.replace(/^\d+[.)、）]\s*/u, "");
      return `<li style="${theme.olItemStyle}"><span style="${theme.olBadgeStyle}">${index + 1}</span>${inlineMarkdown(clean, theme.accent)}</li>`;
    }).join("")}</ol>`;
  }

  const listLines = lines.filter((line) => /^(?:[-*•]|[✅❌📌])\s*/u.test(line));
  if (listLines.length >= 2 && listLines.length === lines.length) {
    return `<ul style="margin:4px 0 22px;padding:0;list-style:none;">${listLines.map((line) => {
      const clean = line.replace(/^(?:[-*•]|[✅❌📌])\s*/u, "");
      return `<li style="position:relative;margin:0 0 10px;padding:10px 14px 10px 34px;border-radius:10px;background:rgba(120,120,120,.07);font-size:15px;line-height:1.75;color:${theme.text};"><span style="position:absolute;left:14px;color:${theme.accent};font-weight:900;">•</span>${inlineMarkdown(clean, theme.accent)}</li>`;
    }).join("")}</ul>`;
  }

  if (/^>\s*/u.test(block)) {
    return `<blockquote style="${theme.quoteStyle}">${inlineMarkdown(block.replace(/^>\s*/gm, ""), theme.accent).replace(/\n/g, "<br/>")}</blockquote>`;
  }
  return `<p style="${theme.paragraphStyle}">${inlineMarkdown(block, theme.accent).replace(/\n/g, "<br/>")}</p>`;
}

function parseMarkdownTable(block: string): string[][] | null {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) return null;
  const looksRow = (line: string) => line.startsWith("|") && line.endsWith("|") && line.length > 2;
  if (!lines.every(looksRow)) return null;
  if (!/^\|?[\s:|-]+\|?$/u.test(lines[1]) || !lines[1].includes("-")) return null;
  const cells = (line: string) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  return [cells(lines[0]), ...lines.slice(2).map(cells)];
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
