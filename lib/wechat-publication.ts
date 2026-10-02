import { z } from "zod";
import type { KitOutput } from "@/lib/content-schema";
import {
  buildPublicationHtml,
  publicationSummary,
  type PublicationTheme
} from "@/lib/publication-html";

export const wechatPublicationModes = ["draft_only", "scheduled_publish"] as const;
export type WechatPublicationMode = (typeof wechatPublicationModes)[number];

export const wechatPublicationStatuses = [
  "scheduled",
  "needs_reapproval",
  "preparing",
  "draft_ready",
  "submitted",
  "publishing",
  "published",
  "failed",
  "cancelled",
  "removed",
  "blocked",
  "attention_required"
] as const;
export type WechatPublicationStatus = (typeof wechatPublicationStatuses)[number];

export type WechatPublishingCapability = {
  canCreateDraft: boolean;
  canSubmitPublish: boolean;
  blockers: string[];
  verified: boolean;
  serviceType: number | null;
};

export type WechatPublicationSnapshot = {
  title: string;
  summary: string;
  contentHtml: string;
  coverImageUrl: string;
  inlineImageUrls: string[];
  theme: PublicationTheme;
  outputUpdatedAt: string;
};

export type WechatPreparedPublicationSnapshot = WechatPublicationSnapshot & {
  contentHtml: string;
  coverThumbMediaId: string;
  uploadedImageUrls: Record<string, string>;
};

export type WechatPublishingFeatureConfig = {
  componentEnabled: boolean;
  draftPublishingEnabled: boolean;
  formalPublishingEnabled: boolean;
};

type WechatPublishingEnvironment = Partial<Record<
  "WECHAT_COMPONENT_ENABLED" | "WECHAT_DRAFT_PUBLISHING_ENABLED" | "WECHAT_FORMAL_PUBLISHING_ENABLED",
  string | undefined
>>;

const providerMetadataSchema = z.object({
  verified: z.boolean().optional(),
  serviceType: z.coerce.number().int().nullable().optional(),
  permissionIds: z.array(z.coerce.number().int().nonnegative()).max(256).optional()
}).passthrough();

const DRAFT_PERMISSION_IDS = new Set([11, 100]);
const FORMAL_PUBLISH_PERMISSION_IDS = new Set([7]);
const PUBLISHABLE_SERVICE_TYPES = new Set([0, 2]);

export function getWechatPublishingFeatureConfig(
  environment: WechatPublishingEnvironment = process.env as unknown as WechatPublishingEnvironment
): WechatPublishingFeatureConfig {
  const componentEnabled = environment.WECHAT_COMPONENT_ENABLED === "true";
  return {
    componentEnabled,
    draftPublishingEnabled: componentEnabled && environment.WECHAT_DRAFT_PUBLISHING_ENABLED === "true",
    formalPublishingEnabled: componentEnabled && environment.WECHAT_FORMAL_PUBLISHING_ENABLED === "true"
  };
}

export function deriveWechatPublishingCapability(input: {
  grantedScopes: string[];
  providerMetadata?: unknown;
  features?: WechatPublishingFeatureConfig;
}): WechatPublishingCapability {
  const features = input.features ?? getWechatPublishingFeatureConfig();
  const metadata = providerMetadataSchema.safeParse(input.providerMetadata ?? {});
  const provider = metadata.success ? metadata.data : {};
  const scopeIds = new Set([
    ...input.grantedScopes
      .map((scope) => scope.match(/^wechat_func_(\d+)$/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number),
    ...(provider.permissionIds ?? [])
  ]);
  const verified = provider.verified === true;
  const serviceType = provider.serviceType ?? null;
  const hasDraftPermission = [...DRAFT_PERMISSION_IDS].some((id) => scopeIds.has(id));
  const hasFormalPermission = [...FORMAL_PUBLISH_PERMISSION_IDS].some((id) => scopeIds.has(id));

  const blockers: string[] = [];
  if (!features.componentEnabled) blockers.push("wechat_component_disabled");
  if (features.componentEnabled && !features.draftPublishingEnabled) blockers.push("wechat_draft_publishing_disabled");
  if (!hasDraftPermission) blockers.push("missing_draft_permission");
  const canCreateDraft = features.draftPublishingEnabled && hasDraftPermission;

  if (!features.formalPublishingEnabled) blockers.push("wechat_formal_publishing_disabled");
  if (!hasFormalPermission) blockers.push("missing_publish_permission");
  if (!verified) blockers.push("account_not_verified");
  if (!PUBLISHABLE_SERVICE_TYPES.has(serviceType ?? -1)) blockers.push("unsupported_account_type");
  const canSubmitPublish = canCreateDraft
    && features.formalPublishingEnabled
    && hasFormalPermission
    && verified
    && PUBLISHABLE_SERVICE_TYPES.has(serviceType ?? -1);

  return { canCreateDraft, canSubmitPublish, blockers: [...new Set(blockers)], verified, serviceType };
}

export function buildWechatPublicationSnapshot(input: {
  output: Pick<KitOutput, "title" | "body" | "summary" | "finalBody" | "cta" | "imageUrl" | "visualAssets">;
  outputUpdatedAt: string;
  theme?: PublicationTheme;
}): WechatPublicationSnapshot {
  const theme = input.theme ?? "default";
  const summary = (input.output.summary?.trim() || publicationSummary(input.output)).slice(0, 120);
  const inlineImageUrls = (input.output.visualAssets ?? [])
    .filter((asset) => asset.assetType === "article_illustration" && asset.isCurrent !== false)
    .sort((left, right) => left.positionIndex - right.positionIndex)
    .map((asset) => asset.imageUrl)
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
  return {
    title: input.output.title.trim(),
    summary,
    contentHtml: buildPublicationHtml(input.output, theme, {
      includeTitle: false,
      includeAttribution: false
    }),
    coverImageUrl: input.output.imageUrl?.trim() ?? "",
    inlineImageUrls,
    theme,
    outputUpdatedAt: input.outputUpdatedAt
  };
}

export function validateWechatPublicationSnapshot(
  snapshot: WechatPublicationSnapshot
): { ok: true } | { ok: false; code: string; message: string } {
  const titleLength = Array.from(snapshot.title).length;
  if (titleLength < 1 || titleLength > 32) {
    return { ok: false, code: "invalid_title", message: "微信公众号标题需控制在 32 个字符以内。" };
  }
  if (Array.from(snapshot.summary).length > 120) {
    return { ok: false, code: "invalid_summary", message: "微信公众号摘要需控制在 120 个字符以内。" };
  }
  if (!snapshot.coverImageUrl) {
    return { ok: false, code: "missing_cover", message: "微信公众号草稿需要封面图。" };
  }
  if (Array.from(snapshot.contentHtml).length > 20_000) {
    return { ok: false, code: "content_too_long", message: "微信公众号正文超过 20,000 字符限制。" };
  }
  if (new TextEncoder().encode(snapshot.contentHtml).byteLength >= 1_048_576) {
    return { ok: false, code: "content_too_large", message: "微信公众号正文超过 1 MB 限制。" };
  }
  return { ok: true };
}

export async function fingerprintWechatPublicationSnapshot(
  snapshot: WechatPublicationSnapshot
): Promise<string> {
  const canonical = JSON.stringify({
    title: snapshot.title,
    summary: snapshot.summary,
    contentHtml: snapshot.contentHtml,
    coverImageUrl: snapshot.coverImageUrl,
    inlineImageUrls: snapshot.inlineImageUrls,
    theme: snapshot.theme,
    outputUpdatedAt: snapshot.outputUpdatedAt
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function mapWechatProviderPublicationStatus(input: {
  status: number;
  articleUrl: string | null;
}): WechatPublicationStatus {
  if (input.status === 0) return input.articleUrl ? "published" : "publishing";
  if (input.status === 1) return "publishing";
  if (input.status === 5) return "removed";
  if (input.status === 4 || input.status === 6) return "blocked";
  return "failed";
}

const statusCopy: Record<WechatPublicationStatus, { zh: string; en: string }> = {
  scheduled: { zh: "已安排，等待后台处理", en: "Scheduled for background processing" },
  needs_reapproval: { zh: "内容已更新，需要重新确认", en: "Content changed and needs confirmation" },
  preparing: { zh: "正在上传素材并准备草稿", en: "Uploading assets and preparing the draft" },
  draft_ready: { zh: "草稿已同步到公众号", en: "Draft synchronized to WeChat" },
  submitted: { zh: "已提交微信审核", en: "Submitted to WeChat" },
  publishing: { zh: "微信正在发布", en: "WeChat is publishing the article" },
  published: { zh: "已正式发布", en: "Published" },
  failed: { zh: "发布失败，可查看原因后重试", en: "Publication failed" },
  cancelled: { zh: "排期已取消", en: "Schedule cancelled" },
  removed: { zh: "文章已被删除", en: "Article removed" },
  blocked: { zh: "微信拒绝或封禁了本次发布", en: "Publication rejected or blocked by WeChat" },
  attention_required: { zh: "结果待确认，Finfold 不会重复提交", en: "Result uncertain; Finfold will not resubmit" }
};

export function describeWechatPublicationStatus(status: WechatPublicationStatus, lang: "zh" | "en") {
  return statusCopy[status][lang];
}
