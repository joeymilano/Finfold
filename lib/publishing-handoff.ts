import type { KitOutput } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import type { PlatformId } from "@/lib/platforms";

export const publishingHandoffPlatforms = ["wechat", "linkedin", "xiaohongshu"] as const;

export type PublishingHandoffPlatform = (typeof publishingHandoffPlatforms)[number];
export type PublishingCopyFormat = "rich_html" | "plain_text";

export type PublishingHandoffProfile = {
  platform: PublishingHandoffPlatform;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  editorUrl: string;
  editorLabelZh: string;
  editorLabelEn: string;
  copyFormat: PublishingCopyFormat;
  imageWorkflow: "cover-and-inline" | "cover-and-inline-reverse" | "ordered-carousel";
  stepsZh: string[];
  stepsEn: string[];
};

export type PublishingHandoffCheck = {
  key: "title" | "body" | "cover" | "images";
  ok: boolean;
  labelZh: string;
  labelEn: string;
  detailZh: string;
  detailEn: string;
};

const profiles: Record<PublishingHandoffPlatform, PublishingHandoffProfile> = {
  wechat: {
    platform: "wechat",
    titleZh: "公众号发布交接",
    titleEn: "WeChat publishing handoff",
    descriptionZh: "标题、富文本正文、封面与配图顺序",
    descriptionEn: "Title, rich body, cover, and inline image order",
    editorUrl: "https://mp.weixin.qq.com/",
    editorLabelZh: "打开公众号后台",
    editorLabelEn: "Open WeChat editor",
    copyFormat: "rich_html",
    imageWorkflow: "cover-and-inline",
    stepsZh: ["复制标题", "复制富文本正文", "在公众号后台核对封面、配图与摘要", "预览后保存草稿或发布"],
    stepsEn: ["Copy the title", "Copy the rich-text body", "Verify cover, inline images, and summary in WeChat", "Preview, then save a draft or publish"]
  },
  linkedin: {
    platform: "linkedin",
    titleZh: "LinkedIn 长文发布交接",
    titleEn: "LinkedIn article handoff",
    descriptionZh: "标题、富文本正文、封面与插图顺序",
    descriptionEn: "Title, rich body, cover, and illustration order",
    editorUrl: "https://www.linkedin.com/article/new/",
    editorLabelZh: "打开 LinkedIn 编辑器",
    editorLabelEn: "Open LinkedIn editor",
    copyFormat: "rich_html",
    imageWorkflow: "cover-and-inline-reverse",
    stepsZh: ["复制标题", "复制富文本正文", "先放封面，再按清单从后往前插入正文图片", "等待 LinkedIn 显示已保存后再离开"],
    stepsEn: ["Copy the title", "Copy the rich-text body", "Add the cover, then insert body images from last to first", "Wait for LinkedIn to confirm the draft is saved"]
  },
  xiaohongshu: {
    platform: "xiaohongshu",
    titleZh: "小红书图文发布交接",
    titleEn: "Xiaohongshu publishing handoff",
    descriptionZh: "标题、正文、标签与 3:4 图组顺序",
    descriptionEn: "Title, caption, tags, and ordered 3:4 carousel",
    editorUrl: "https://creator.xiaohongshu.com/publish/publish",
    editorLabelZh: "打开小红书创作中心",
    editorLabelEn: "Open Xiaohongshu Creator Center",
    copyFormat: "plain_text",
    imageWorkflow: "ordered-carousel",
    stepsZh: ["先导出 3:4 图组", "按编号一次上传全部图片", "分别复制标题和正文", "检查站外导流与最终预览后保存草稿或发布"],
    stepsEn: ["Export the 3:4 carousel first", "Upload every image in numbered order", "Copy the title and caption separately", "Check outbound-promotion risk and the final preview before saving or publishing"]
  }
};

export function supportsPublishingHandoff(platform: PlatformId): platform is PublishingHandoffPlatform {
  return publishingHandoffPlatforms.includes(platform as PublishingHandoffPlatform);
}

export function getPublishingHandoffProfile(platform: PlatformId): PublishingHandoffProfile | null {
  return supportsPublishingHandoff(platform) ? profiles[platform] : null;
}

export function publishingTitle(output: Pick<KitOutput, "title">): string {
  return output.title.trim();
}

export function publishingBody(output: Pick<KitOutput, "body" | "finalBody" | "cta">): string {
  return [output.finalBody || output.body, output.cta]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function publishingImageUrls(output: Pick<KitOutput, "imageUrl" | "visualAssets">): string[] {
  const candidates = [
    output.imageUrl,
    ...(output.visualAssets ?? [])
      .filter((asset) => asset.isCurrent !== false)
      .sort((left, right) => left.positionIndex - right.positionIndex)
      .map((asset) => asset.imageUrl)
  ];
  return Array.from(new Set(candidates.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

export function validatePublishingHandoff(
  output: Pick<KitOutput, "platform" | "title" | "body" | "finalBody" | "cta" | "imageUrl" | "visualAssets">,
  locale: Locale
): PublishingHandoffCheck[] {
  void locale;
  const profile = getPublishingHandoffProfile(output.platform);
  if (!profile) return [];
  const titleLength = Array.from(publishingTitle(output)).length;
  const bodyLength = Array.from(publishingBody(output)).length;
  const images = publishingImageUrls(output);
  const article = profile.platform !== "xiaohongshu";
  const titleOk = profile.platform === "xiaohongshu"
    ? titleLength >= 6 && titleLength <= 20
    : profile.platform === "wechat"
      ? titleLength >= 1 && titleLength <= 32
      : titleLength >= 6;
  const bodyOk = article ? bodyLength >= 350 : bodyLength >= 80;

  return [
    {
      key: "title",
      ok: titleOk,
      labelZh: "标题",
      labelEn: "Title",
      detailZh: profile.platform === "xiaohongshu" ? "建议控制在 6–20 个字符，并在前半段写清场景。" : profile.platform === "wechat" ? "公众号标题应在 32 个字符以内。" : "标题应独立表达文章主题。",
      detailEn: profile.platform === "xiaohongshu" ? "Keep it within 6–20 characters and name the situation early." : profile.platform === "wechat" ? "Keep the WeChat title within 32 characters." : "The title should state the article topic on its own."
    },
    {
      key: "body",
      ok: bodyOk,
      labelZh: article ? "正文" : "发布文案",
      labelEn: article ? "Body" : "Caption",
      detailZh: article ? "长文应完整推进一个观点，避免把短帖直接拉长。" : "正文至少应交付一个完整观点、清单或步骤。",
      detailEn: article ? "Advance a complete argument instead of stretching a short post." : "Deliver one complete idea, checklist, or sequence."
    },
    {
      key: "cover",
      ok: Boolean(output.imageUrl),
      labelZh: "封面",
      labelEn: "Cover",
      detailZh: profile.platform === "xiaohongshu" ? "先准备一张独立 3:4 封面，再补齐后续图页。" : "发布长文前先准备独立封面。",
      detailEn: profile.platform === "xiaohongshu" ? "Prepare a dedicated 3:4 cover before the remaining pages." : "Prepare a dedicated cover before handing off the article."
    },
    {
      key: "images",
      ok: profile.platform === "xiaohongshu" ? images.length >= 1 : true,
      labelZh: profile.platform === "xiaohongshu" ? "3:4 图组" : "配图顺序",
      labelEn: profile.platform === "xiaohongshu" ? "3:4 carousel" : "Image order",
      detailZh: profile.platform === "xiaohongshu" ? "在内容图组中导出编号图片，再按顺序上传。" : "清单会按正文位置列出配图，发布时按顺序核对。",
      detailEn: profile.platform === "xiaohongshu" ? "Export numbered pages from the carousel studio, then upload them in order." : "The handoff manifest lists inline images in body order."
    }
  ];
}

export function buildPublishingHandoffManifest(
  output: Pick<KitOutput, "platform" | "title" | "body" | "finalBody" | "cta" | "imageUrl" | "visualAssets">,
  locale: Locale
) {
  const profile = getPublishingHandoffProfile(output.platform);
  if (!profile) throw new Error(`Publishing handoff is unavailable for ${output.platform}.`);
  return {
    schemaVersion: 1,
    platform: profile.platform,
    deliveryMode: "guided_handoff" as const,
    directPublishing: false,
    editorUrl: profile.editorUrl,
    copyFormat: profile.copyFormat,
    title: publishingTitle(output),
    body: publishingBody(output),
    coverImageUrl: output.imageUrl || null,
    imageUrls: publishingImageUrls(output),
    imageWorkflow: profile.imageWorkflow,
    checks: validatePublishingHandoff(output, locale),
    steps: locale === "zh" ? profile.stepsZh : profile.stepsEn
  };
}
