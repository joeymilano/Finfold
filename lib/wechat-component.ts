import { createDecipheriv, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { readTextWithLimit } from "@/lib/safe-url";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type WechatComponentEnvironment = {
  enabled?: string;
  appId?: string;
  appSecret?: string;
  token?: string;
  encodingAesKey?: string;
};

export type WechatComponentConfig = {
  appId: string;
  appSecret: string;
  token: string;
  encodingAesKey: string;
};

export type WechatComponentEvent = {
  appId: string;
  infoType: string;
  componentVerifyTicket: string | null;
  createTime: number | null;
  authorizerAppId?: string;
  publishId?: string;
  publishStatus?: number;
  articleId?: string;
  articleUrl?: string;
};

export type WechatPublicationProviderStatus = {
  publishId: string;
  status: number;
  articleId: string | null;
  articleUrl: string | null;
};

type WechatDecryptedEnvelope = {
  appId: string;
  message: string;
};

export type WechatAuthorizerToken = {
  authorizerAppId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  permissionIds: number[];
};

export type WechatAuthorizerAccount = {
  authorizerAppId: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  verified: boolean;
  serviceType: number | null;
};

export type WechatUserSummaryRow = {
  refDate: string;
  userSource: number;
  newUser: number;
  cancelUser: number;
};

export type WechatUserCumulateRow = {
  refDate: string;
  cumulateUser: number;
};

export class WechatApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null = null
  ) {
    super(message);
    this.name = "WechatApiError";
  }
}

const componentTokenSchema = z.object({
  component_access_token: z.string().min(1).max(16_384),
  expires_in: z.coerce.number().int().positive().max(31_536_000)
});

const preAuthorizationCodeSchema = z.object({
  pre_auth_code: z.string().min(1).max(4_096),
  expires_in: z.coerce.number().int().positive().max(86_400)
});

const queryAuthorizationSchema = z.object({
  authorization_info: z.object({
    authorizer_appid: z.string().min(1).max(128),
    authorizer_access_token: z.string().min(1).max(16_384),
    expires_in: z.coerce.number().int().positive().max(31_536_000),
    authorizer_refresh_token: z.string().min(1).max(16_384),
    func_info: z.array(z.object({
      funcscope_category: z.object({ id: z.coerce.number().int().nonnegative() })
    })).max(256).optional()
  })
});

const refreshAuthorizerTokenSchema = z.object({
  authorizer_access_token: z.string().min(1).max(16_384),
  expires_in: z.coerce.number().int().positive().max(31_536_000),
  authorizer_refresh_token: z.string().min(1).max(16_384)
});

const authorizerInfoSchema = z.object({
  authorizer_info: z.object({
    nick_name: z.string().trim().min(1).max(160).optional(),
    head_img: z.string().optional(),
    user_name: z.string().trim().min(1).max(160).optional(),
    principal_name: z.string().trim().min(1).max(160).optional(),
    verify_type_info: z.object({ id: z.coerce.number().int() }).optional(),
    service_type_info: z.object({ id: z.coerce.number().int() }).optional()
  })
});

const userSummarySchema = z.object({
  list: z.array(z.object({
    ref_date: z.string().date(),
    user_source: z.coerce.number().int().nonnegative(),
    new_user: z.coerce.number().int().nonnegative(),
    cancel_user: z.coerce.number().int().nonnegative()
  })).max(20_000)
});

const userCumulateSchema = z.object({
  list: z.array(z.object({
    ref_date: z.string().date(),
    cumulate_user: z.coerce.number().int().nonnegative()
  })).max(32)
});

const wechatErrorSchema = z.object({
  errcode: z.coerce.number().int(),
  errmsg: z.string().optional()
});

const uploadImageSchema = z.object({ url: z.string().url() });
const addMaterialSchema = z.object({ media_id: z.string().min(1).max(4_096) });
const addDraftSchema = z.object({ media_id: z.string().min(1).max(4_096) });
const draftBatchSchema = z.object({
  item: z.array(z.object({
    media_id: z.string().min(1).max(4_096),
    content: z.object({
      news_item: z.array(z.object({
        title: z.string(),
        digest: z.string().optional(),
        content: z.string().optional()
      })).max(8)
    })
  })).max(5).default([])
});
const publishSubmitSchema = z.object({ publish_id: z.string().min(1).max(4_096) });
const publishStatusSchema = z.object({
  publish_id: z.string().min(1).max(4_096).optional(),
  publish_status: z.coerce.number().int().min(0).max(6),
  article_id: z.string().max(4_096).optional(),
  article_detail: z.object({
    item: z.array(z.object({ article_url: z.string().url().optional() })).max(8).optional()
  }).optional()
});

function runtimeEnvironment(): WechatComponentEnvironment {
  return {
    enabled: process.env.WECHAT_COMPONENT_ENABLED,
    appId: process.env.WECHAT_COMPONENT_APP_ID,
    appSecret: process.env.WECHAT_COMPONENT_APP_SECRET,
    token: process.env.WECHAT_COMPONENT_TOKEN,
    encodingAesKey: process.env.WECHAT_COMPONENT_ENCODING_AES_KEY
  };
}

function configuredValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The component remains unavailable until an operator explicitly enables it
 * and provides the complete WeChat Open Platform credential set.
 */
export function getWechatComponentConfig(
  environment: WechatComponentEnvironment = runtimeEnvironment()
): WechatComponentConfig | null {
  if (environment.enabled !== "true") return null;
  const appId = configuredValue(environment.appId);
  const appSecret = configuredValue(environment.appSecret);
  const token = configuredValue(environment.token);
  const encodingAesKey = configuredValue(environment.encodingAesKey);
  if (!appId || !appSecret || !token || !encodingAesKey) return null;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(appId)) return null;
  if (encodingAesKey.length !== 43 || !/^[A-Za-z0-9+/]+$/.test(encodingAesKey)) return null;
  return { appId, appSecret, token, encodingAesKey };
}

function extractXmlValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${tag}>`, "i"));
  const value = match?.[1] ?? match?.[2];
  if (value === undefined) return null;
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .trim();
}

async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyMessageSignature(input: {
  token: string;
  timestamp: string;
  nonce: string;
  encrypted: string;
  signature: string;
}): Promise<boolean> {
  const expected = await sha1Hex([input.token, input.timestamp, input.nonce, input.encrypted].sort().join(""));
  if (!/^[0-9a-f]{40}$/i.test(input.signature)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(input.signature, "hex"));
}

function decodeWechatAesKey(encoded: string): Buffer {
  const key = Buffer.from(`${encoded}=`, "base64");
  if (key.byteLength !== 32) throw new Error("The WeChat component AES key is invalid.");
  return key;
}

function removeWechatPadding(value: Buffer): Buffer {
  const padding = value[value.byteLength - 1];
  if (!padding || padding > 32 || padding > value.byteLength) {
    throw new Error("The WeChat component message padding is invalid.");
  }
  for (let index = value.byteLength - padding; index < value.byteLength; index += 1) {
    if (value[index] !== padding) throw new Error("The WeChat component message padding is invalid.");
  }
  return value.subarray(0, value.byteLength - padding);
}

async function decryptWechatPayload(input: {
  config: WechatComponentConfig;
  timestamp: string;
  nonce: string;
  signature: string;
  encrypted: string;
}): Promise<WechatDecryptedEnvelope> {
  if (!await verifyMessageSignature({
    token: input.config.token,
    timestamp: input.timestamp,
    nonce: input.nonce,
    encrypted: input.encrypted,
    signature: input.signature
  })) {
    throw new Error("The WeChat component event signature is invalid.");
  }

  const key = decodeWechatAesKey(input.config.encodingAesKey);
  const decipher = createDecipheriv("aes-256-cbc", key, key.subarray(0, 16));
  decipher.setAutoPadding(false);
  const plaintext = removeWechatPadding(Buffer.concat([
    decipher.update(Buffer.from(input.encrypted, "base64")),
    decipher.final()
  ]));
  if (plaintext.byteLength < 20) throw new Error("The WeChat component event payload is invalid.");

  const xmlLength = plaintext.readUInt32BE(16);
  const xmlStart = 20;
  const xmlEnd = xmlStart + xmlLength;
  if (xmlLength < 1 || xmlEnd > plaintext.byteLength) {
    throw new Error("The WeChat component event payload is invalid.");
  }
  const appId = plaintext.subarray(xmlEnd).toString("utf8");
  const message = plaintext.subarray(xmlStart, xmlEnd).toString("utf8");
  return { appId, message };
}

async function decryptWechatEnvelope(input: {
  config: WechatComponentConfig;
  timestamp: string;
  nonce: string;
  signature: string;
  xml: string;
}): Promise<WechatDecryptedEnvelope> {
  const encrypted = extractXmlValue(input.xml, "Encrypt");
  if (!encrypted) throw new Error("The WeChat component event is missing its encrypted payload.");
  return decryptWechatPayload({ ...input, encrypted });
}

function parseWechatComponentEvent(envelope: WechatDecryptedEnvelope): WechatComponentEvent {
  const eventXml = envelope.message;
  const infoType = extractXmlValue(eventXml, "InfoType") ?? extractXmlValue(eventXml, "Event");
  if (!infoType) throw new Error("The WeChat component event type is missing.");
  const createTimeValue = extractXmlValue(eventXml, "CreateTime");
  const createTime = createTimeValue && /^\d+$/.test(createTimeValue) ? Number(createTimeValue) : null;
  const publishStatusValue = extractXmlValue(eventXml, "PublishStatus");
  const publishStatus = publishStatusValue && /^\d+$/.test(publishStatusValue)
    ? Number(publishStatusValue)
    : null;
  const articleUrl = extractXmlValue(eventXml, "ArticleUrl");
  return {
    appId: envelope.appId,
    infoType,
    componentVerifyTicket: extractXmlValue(eventXml, "ComponentVerifyTicket"),
    createTime: Number.isSafeInteger(createTime) ? createTime : null,
    ...((extractXmlValue(eventXml, "AuthorizerAppid") ?? extractXmlValue(eventXml, "ToUserName"))
      ? { authorizerAppId: (extractXmlValue(eventXml, "AuthorizerAppid") ?? extractXmlValue(eventXml, "ToUserName"))! }
      : {}),
    ...(extractXmlValue(eventXml, "PublishId")
      ? { publishId: extractXmlValue(eventXml, "PublishId")! }
      : {}),
    ...(Number.isSafeInteger(publishStatus) ? { publishStatus: publishStatus! } : {}),
    ...(extractXmlValue(eventXml, "ArticleId")
      ? { articleId: extractXmlValue(eventXml, "ArticleId")! }
      : {}),
    ...(articleUrl && safeHttpsUrl(articleUrl) ? { articleUrl } : {})
  };
}

/** Verifies and decrypts a WeChat Open Platform event without logging its XML. */
export async function decryptWechatComponentEvent(input: {
  config: WechatComponentConfig;
  timestamp: string;
  nonce: string;
  signature: string;
  xml: string;
}): Promise<WechatComponentEvent> {
  const envelope = await decryptWechatEnvelope(input);
  if (envelope.appId !== input.config.appId) {
    throw new Error("The WeChat component event targets another app.");
  }
  return parseWechatComponentEvent(envelope);
}

/** Verifies and decrypts an event sent for one authorized Official Account. */
export async function decryptWechatAuthorizedAccountEvent(input: {
  config: WechatComponentConfig;
  authorizedAppId: string;
  timestamp: string;
  nonce: string;
  signature: string;
  xml: string;
}): Promise<WechatComponentEvent> {
  const envelope = await decryptWechatEnvelope(input);
  if (envelope.appId !== input.authorizedAppId) {
    throw new Error("The WeChat authorized-account event targets another app.");
  }
  return parseWechatComponentEvent(envelope);
}

/** Verifies an encrypted event sent on behalf of one authorized Official Account. */
export async function verifyWechatAuthorizedAccountEvent(input: {
  config: WechatComponentConfig;
  authorizedAppId: string;
  timestamp: string;
  nonce: string;
  signature: string;
  xml: string;
}): Promise<void> {
  await decryptWechatAuthorizedAccountEvent(input);
}

async function decryptWechatEcho(input: {
  config: WechatComponentConfig;
  expectedAppId: string;
  timestamp: string;
  nonce: string;
  signature: string;
  echo: string;
}): Promise<string> {
  const envelope = await decryptWechatPayload({
    config: input.config,
    timestamp: input.timestamp,
    nonce: input.nonce,
    signature: input.signature,
    encrypted: input.echo
  });
  if (envelope.appId !== input.expectedAppId) {
    throw new Error("The WeChat callback verification targets another app.");
  }
  return envelope.message;
}

/** Verifies and decrypts the URL challenge for the component callback. */
export async function decryptWechatComponentEcho(input: {
  config: WechatComponentConfig;
  timestamp: string;
  nonce: string;
  signature: string;
  echo: string;
}): Promise<string> {
  return decryptWechatEcho({ ...input, expectedAppId: input.config.appId });
}

/** Verifies and decrypts the URL challenge for an authorized-account callback. */
export async function decryptWechatAuthorizedAccountEcho(input: {
  config: WechatComponentConfig;
  authorizedAppId: string;
  timestamp: string;
  nonce: string;
  signature: string;
  echo: string;
}): Promise<string> {
  return decryptWechatEcho({ ...input, expectedAppId: input.authorizedAppId });
}

async function readWechatJson<T>(
  response: Response,
  schema: z.ZodType<T>,
  fallbackMessage: string,
  maxBytes = 256 * 1024
): Promise<T> {
  let payload: unknown;
  try {
    payload = JSON.parse(await readTextWithLimit(response, maxBytes));
  } catch {
    throw new WechatApiError(`${fallbackMessage} WeChat returned an invalid response.`);
  }
  const apiError = wechatErrorSchema.safeParse(payload);
  if (apiError.success && apiError.data.errcode !== 0) {
    throw new WechatApiError(`${fallbackMessage} WeChat error ${apiError.data.errcode}.`, apiError.data.errcode);
  }
  if (!response.ok) throw new WechatApiError(fallbackMessage);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new WechatApiError(`${fallbackMessage} WeChat returned an invalid response.`);
  return parsed.data;
}

export async function fetchWechatComponentAccessToken(
  config: WechatComponentConfig,
  componentVerifyTicket: string,
  fetcher: FetchLike = fetch
): Promise<{ accessToken: string; expiresIn: number }> {
  const response = await fetcher("https://api.weixin.qq.com/cgi-bin/component/api_component_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      component_appid: config.appId,
      component_appsecret: config.appSecret,
      component_verify_ticket: componentVerifyTicket
    }),
    cache: "no-store"
  });
  const payload = await readWechatJson(response, componentTokenSchema, "Could not obtain the WeChat component token.");
  return { accessToken: payload.component_access_token, expiresIn: payload.expires_in };
}

export async function createWechatPreAuthorizationCode(
  config: WechatComponentConfig,
  componentAccessToken: string,
  fetcher: FetchLike = fetch
): Promise<string> {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/component/api_create_preauthcode");
  url.searchParams.set("component_access_token", componentAccessToken);
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ component_appid: config.appId }),
    cache: "no-store"
  });
  const payload = await readWechatJson(response, preAuthorizationCodeSchema, "Could not create the WeChat authorization link.");
  return payload.pre_auth_code;
}

export function buildWechatComponentAuthorizationUrl(input: {
  config: WechatComponentConfig;
  preAuthorizationCode: string;
  callbackUrl: string;
}): string {
  const url = new URL("https://mp.weixin.qq.com/cgi-bin/componentloginpage");
  url.search = new URLSearchParams({
    component_appid: input.config.appId,
    pre_auth_code: input.preAuthorizationCode,
    redirect_uri: input.callbackUrl,
    auth_type: "1"
  }).toString();
  return url.toString();
}

export async function exchangeWechatAuthorizationCode(
  config: WechatComponentConfig,
  componentAccessToken: string,
  authorizationCode: string,
  fetcher: FetchLike = fetch
): Promise<WechatAuthorizerToken> {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/component/api_query_auth");
  url.searchParams.set("component_access_token", componentAccessToken);
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      component_appid: config.appId,
      authorization_code: authorizationCode
    }),
    cache: "no-store"
  });
  const payload = await readWechatJson(response, queryAuthorizationSchema, "Could not complete WeChat authorization.");
  const authorization = payload.authorization_info;
  return {
    authorizerAppId: authorization.authorizer_appid,
    accessToken: authorization.authorizer_access_token,
    refreshToken: authorization.authorizer_refresh_token,
    expiresIn: authorization.expires_in,
    permissionIds: [...new Set((authorization.func_info ?? []).map((item) => item.funcscope_category.id))]
  };
}

export async function refreshWechatAuthorizerToken(
  config: WechatComponentConfig,
  componentAccessToken: string,
  authorizerAppId: string,
  refreshToken: string,
  fetcher: FetchLike = fetch
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/component/api_authorizer_token");
  url.searchParams.set("component_access_token", componentAccessToken);
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      component_appid: config.appId,
      authorizer_appid: authorizerAppId,
      authorizer_refresh_token: refreshToken
    }),
    cache: "no-store"
  });
  const payload = await readWechatJson(response, refreshAuthorizerTokenSchema, "Could not refresh the WeChat account authorization.");
  return {
    accessToken: payload.authorizer_access_token,
    refreshToken: payload.authorizer_refresh_token,
    expiresIn: payload.expires_in
  };
}

function wechatAuthorizerUrl(path: string, accessToken: string): URL {
  const url = new URL(`https://api.weixin.qq.com${path}`);
  url.searchParams.set("access_token", accessToken);
  return url;
}

function imageFilename(contentType: "image/jpeg" | "image/png"): string {
  return contentType === "image/png" ? "finfold.png" : "finfold.jpg";
}

function plainArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function uploadWechatArticleImage(
  accessToken: string,
  bytes: Uint8Array,
  contentType: "image/jpeg" | "image/png",
  fetcher: FetchLike = fetch
): Promise<string> {
  const form = new FormData();
  form.append("media", new Blob([plainArrayBuffer(bytes)], { type: contentType }), imageFilename(contentType));
  const response = await fetcher(wechatAuthorizerUrl("/cgi-bin/media/uploadimg", accessToken), {
    method: "POST",
    body: form,
    cache: "no-store"
  });
  const payload = await readWechatJson(response, uploadImageSchema, "Could not upload the WeChat article image.");
  return payload.url;
}

export async function uploadWechatCoverMaterial(
  accessToken: string,
  bytes: Uint8Array,
  contentType: "image/jpeg" | "image/png",
  fetcher: FetchLike = fetch
): Promise<string> {
  const url = wechatAuthorizerUrl("/cgi-bin/material/add_material", accessToken);
  url.searchParams.set("type", "image");
  const form = new FormData();
  form.append("media", new Blob([plainArrayBuffer(bytes)], { type: contentType }), imageFilename(contentType));
  const response = await fetcher(url, { method: "POST", body: form, cache: "no-store" });
  const payload = await readWechatJson(response, addMaterialSchema, "Could not upload the WeChat cover image.");
  return payload.media_id;
}

export async function addWechatArticleDraft(
  accessToken: string,
  article: {
    title: string;
    author?: string;
    digest: string;
    content: string;
    contentSourceUrl?: string;
    thumbMediaId: string;
  },
  fetcher: FetchLike = fetch
): Promise<string> {
  const response = await fetcher(wechatAuthorizerUrl("/cgi-bin/draft/add", accessToken), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      articles: [{
        article_type: "news",
        title: article.title,
        author: article.author ?? "Finfold",
        digest: article.digest,
        content: article.content,
        content_source_url: article.contentSourceUrl ?? "",
        thumb_media_id: article.thumbMediaId,
        need_open_comment: 0,
        only_fans_can_comment: 0
      }]
    }),
    cache: "no-store"
  });
  const payload = await readWechatJson(response, addDraftSchema, "Could not create the WeChat draft.");
  return payload.media_id;
}

export async function findRecentWechatArticleDraft(
  accessToken: string,
  article: { title: string; digest: string; content: string },
  fetcher: FetchLike = fetch
): Promise<string | null> {
  const response = await fetcher(wechatAuthorizerUrl("/cgi-bin/draft/batchget", accessToken), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ offset: 0, count: 5, no_content: 0 }),
    cache: "no-store"
  });
  const payload = await readWechatJson(
    response,
    draftBatchSchema,
    "Could not inspect recent WeChat drafts.",
    6 * 1024 * 1024
  );
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const match = (payload.item ?? []).find((item) => item.content.news_item.some((candidate) => (
    candidate.title.trim() === article.title.trim()
    && (candidate.digest ?? "").trim() === article.digest.trim()
    && normalize(candidate.content ?? "") === normalize(article.content)
  )));
  return match?.media_id ?? null;
}

export async function submitWechatArticleForPublication(
  accessToken: string,
  mediaId: string,
  fetcher: FetchLike = fetch
): Promise<string> {
  const response = await fetcher(wechatAuthorizerUrl("/cgi-bin/freepublish/submit", accessToken), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ media_id: mediaId }),
    cache: "no-store"
  });
  const payload = await readWechatJson(response, publishSubmitSchema, "Could not submit the WeChat article for publication.");
  return payload.publish_id;
}

export async function fetchWechatPublicationStatus(
  accessToken: string,
  publishId: string,
  fetcher: FetchLike = fetch
): Promise<WechatPublicationProviderStatus> {
  const response = await fetcher(wechatAuthorizerUrl("/cgi-bin/freepublish/get", accessToken), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ publish_id: publishId }),
    cache: "no-store"
  });
  const payload = await readWechatJson(response, publishStatusSchema, "Could not read the WeChat publication status.");
  return {
    publishId: payload.publish_id ?? publishId,
    status: payload.publish_status,
    articleId: payload.article_id ?? null,
    articleUrl: payload.article_detail?.item?.find((item) => item.article_url)?.article_url ?? null
  };
}

function safeHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export async function fetchWechatAuthorizerAccount(
  config: WechatComponentConfig,
  componentAccessToken: string,
  authorizerAppId: string,
  fetcher: FetchLike = fetch
): Promise<WechatAuthorizerAccount> {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/component/api_get_authorizer_info");
  url.searchParams.set("component_access_token", componentAccessToken);
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ component_appid: config.appId, authorizer_appid: authorizerAppId }),
    cache: "no-store"
  });
  const payload = await readWechatJson(response, authorizerInfoSchema, "Could not read the WeChat Official Account profile.");
  const info = payload.authorizer_info;
  return {
    authorizerAppId,
    displayName: info.nick_name || info.principal_name || authorizerAppId,
    handle: info.user_name ?? null,
    avatarUrl: safeHttpsUrl(info.head_img),
    verified: (info.verify_type_info?.id ?? -1) !== -1,
    serviceType: info.service_type_info?.id ?? null
  };
}

export async function fetchWechatUserSummary(
  accessToken: string,
  beginDate: string,
  endDate: string,
  fetcher: FetchLike = fetch
): Promise<WechatUserSummaryRow[]> {
  const url = new URL("https://api.weixin.qq.com/datacube/getusersummary");
  url.searchParams.set("access_token", accessToken);
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ begin_date: beginDate, end_date: endDate }),
    cache: "no-store"
  });
  const payload = await readWechatJson(response, userSummarySchema, "Could not read WeChat user growth data.");
  return payload.list.map((row) => ({
    refDate: row.ref_date,
    userSource: row.user_source,
    newUser: row.new_user,
    cancelUser: row.cancel_user
  }));
}

export async function fetchWechatUserCumulate(
  accessToken: string,
  beginDate: string,
  endDate: string,
  fetcher: FetchLike = fetch
): Promise<WechatUserCumulateRow[]> {
  const url = new URL("https://api.weixin.qq.com/datacube/getusercumulate");
  url.searchParams.set("access_token", accessToken);
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ begin_date: beginDate, end_date: endDate }),
    cache: "no-store"
  });
  const payload = await readWechatJson(response, userCumulateSchema, "Could not read WeChat cumulative user data.");
  return payload.list.map((row) => ({ refDate: row.ref_date, cumulateUser: row.cumulate_user }));
}

function dateAtUtcMidnight(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return new Date(time).toISOString().slice(0, 10) === value ? time : Number.NaN;
}

export function shanghaiDateOffset(days: number, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const base = new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function validateWechatAnalyticsRange(input: {
  beginDate?: string;
  endDate?: string;
  now?: Date;
}): { beginDate: string; endDate: string } {
  const latest = shanghaiDateOffset(-1, input.now);
  const beginDate = input.beginDate ?? latest;
  const endDate = input.endDate ?? beginDate;
  const begin = dateAtUtcMidnight(beginDate);
  const end = dateAtUtcMidnight(endDate);
  if (!Number.isFinite(begin) || !Number.isFinite(end)) throw new Error("WeChat analytics dates must use YYYY-MM-DD.");
  if (end < begin) throw new Error("The WeChat analytics end date must not be before the start date.");
  if ((end - begin) / 86_400_000 > 6) throw new Error("WeChat user analytics can synchronize at most 7 calendar days at a time.");
  if (endDate > latest) throw new Error(`WeChat analytics are available through ${latest}.`);
  return { beginDate, endDate };
}

function addIsoDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Builds month-to-date requests without exceeding WeChat's seven-day limit. */
export function buildWechatAnalyticsRequestRanges(input: {
  beginDate?: string;
  endDate?: string;
  now?: Date;
} = {}): Array<{ beginDate: string; endDate: string }> {
  if (input.beginDate || input.endDate) return [validateWechatAnalyticsRange(input)];
  const latest = validateWechatAnalyticsRange({ now: input.now }).endDate;
  const monthStart = `${latest.slice(0, 8)}01`;
  const ranges: Array<{ beginDate: string; endDate: string }> = [];
  let cursor = monthStart;
  while (cursor <= latest) {
    const endDate = [addIsoDays(cursor, 6), latest].sort()[0];
    ranges.push(validateWechatAnalyticsRange({ beginDate: cursor, endDate, now: input.now }));
    cursor = addIsoDays(endDate, 1);
  }
  return ranges;
}

export function isWechatAccessTokenError(error: unknown): boolean {
  return error instanceof WechatApiError && [40001, 40014, 42001].includes(error.code ?? 0);
}
