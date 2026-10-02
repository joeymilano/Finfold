import { createCipheriv, createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildWechatComponentAuthorizationUrl,
  buildWechatAnalyticsRequestRanges,
  decryptWechatAuthorizedAccountEvent,
  decryptWechatAuthorizedAccountEcho,
  decryptWechatComponentEcho,
  decryptWechatComponentEvent,
  fetchWechatUserCumulate,
  fetchWechatUserSummary,
  getWechatComponentConfig,
  shanghaiDateOffset,
  validateWechatAnalyticsRange,
  verifyWechatAuthorizedAccountEvent,
  type WechatComponentConfig
} from "@/lib/wechat-component";

const rawAesKey = Buffer.alloc(32, 7);
const encodingAesKey = rawAesKey.toString("base64").replace(/=$/, "");
const config: WechatComponentConfig = {
  appId: "wx_component_test",
  appSecret: "component-secret",
  token: "component-message-token",
  encodingAesKey
};

function encryptedEventXml(
  eventXml: string,
  timestamp: string,
  nonce: string,
  recipientAppId = config.appId
) {
  const random = Buffer.alloc(16, 3);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(Buffer.byteLength(eventXml));
  const plaintext = Buffer.concat([random, length, Buffer.from(eventXml), Buffer.from(recipientAppId)]);
  const paddingLength = 32 - (plaintext.byteLength % 32 || 32) || 32;
  const padded = Buffer.concat([plaintext, Buffer.alloc(paddingLength, paddingLength)]);
  const cipher = createCipheriv("aes-256-cbc", rawAesKey, rawAesKey.subarray(0, 16));
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]).toString("base64");
  const signature = createHash("sha1")
    .update([config.token, timestamp, nonce, encrypted].sort().join(""))
    .digest("hex");
  return {
    encrypted,
    signature,
    xml: `<xml><AppId><![CDATA[${config.appId}]]></AppId><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`
  };
}

describe("WeChat component integration", () => {
  it("stays fail-closed until the complete component configuration is enabled", () => {
    expect(getWechatComponentConfig({ ...config, enabled: "false" })).toBeNull();
    expect(getWechatComponentConfig({ ...config, enabled: "true", appSecret: "" })).toBeNull();
    expect(getWechatComponentConfig({ ...config, enabled: "true" })).toEqual(config);
  });

  it("verifies and decrypts a component_verify_ticket event", async () => {
    const timestamp = "1787600000";
    const nonce = "nonce-value";
    const envelope = encryptedEventXml(
      `<xml><AppId><![CDATA[${config.appId}]]></AppId><CreateTime>1787600000</CreateTime><InfoType><![CDATA[component_verify_ticket]]></InfoType><ComponentVerifyTicket><![CDATA[ticket-secret]]></ComponentVerifyTicket></xml>`,
      timestamp,
      nonce
    );

    await expect(decryptWechatComponentEvent({
      config,
      timestamp,
      nonce,
      signature: envelope.signature,
      xml: envelope.xml
    })).resolves.toEqual({
      appId: config.appId,
      infoType: "component_verify_ticket",
      componentVerifyTicket: "ticket-secret",
      createTime: 1787600000
    });

    await expect(decryptWechatComponentEvent({
      config,
      timestamp,
      nonce,
      signature: "0".repeat(40),
      xml: envelope.xml
    })).rejects.toThrow(/signature is invalid/i);
  });

  it("verifies encrypted authorized-account events against the substituted AppID", async () => {
    const timestamp = "1787600000";
    const nonce = "authorized-account-nonce";
    const authorizedAppId = "wx1234567890abcdef";
    const envelope = encryptedEventXml(
      `<xml><ToUserName><![CDATA[gh_test]]></ToUserName><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[subscribe]]></Event></xml>`,
      timestamp,
      nonce,
      authorizedAppId
    );

    await expect(verifyWechatAuthorizedAccountEvent({
      config,
      authorizedAppId,
      timestamp,
      nonce,
      signature: envelope.signature,
      xml: envelope.xml
    })).resolves.toBeUndefined();

    await expect(verifyWechatAuthorizedAccountEvent({
      config,
      authorizedAppId: "wxfedcba0987654321",
      timestamp,
      nonce,
      signature: envelope.signature,
      xml: envelope.xml
    })).rejects.toThrow(/targets another app/i);
  });

  it("extracts the final publication result from an authorized-account callback", async () => {
    const timestamp = "1787600000";
    const nonce = "publish-nonce";
    const authorizedAppId = "wx_authorizer";
    const envelope = encryptedEventXml(
      `<xml><ToUserName><![CDATA[wx_authorizer]]></ToUserName><CreateTime>1787600000</CreateTime><Event><![CDATA[PUBLISHJOBFINISH]]></Event><PublishId><![CDATA[publish-123]]></PublishId><PublishStatus>0</PublishStatus><ArticleId><![CDATA[article-123]]></ArticleId><ArticleUrl><![CDATA[https://mp.weixin.qq.com/s/article-123]]></ArticleUrl></xml>`,
      timestamp,
      nonce,
      authorizedAppId
    );
    await expect(decryptWechatAuthorizedAccountEvent({
      config,
      authorizedAppId,
      timestamp,
      nonce,
      signature: envelope.signature,
      xml: envelope.xml
    })).resolves.toMatchObject({
      infoType: "PUBLISHJOBFINISH",
      authorizerAppId: authorizedAppId,
      publishId: "publish-123",
      publishStatus: 0,
      articleId: "article-123",
      articleUrl: "https://mp.weixin.qq.com/s/article-123"
    });
  });

  it("verifies and decrypts callback URL challenges for both callback types", async () => {
    const timestamp = "1787600000";
    const nonce = "echo-nonce";
    const componentEcho = encryptedEventXml("component-echo", timestamp, nonce);
    await expect(decryptWechatComponentEcho({
      config,
      timestamp,
      nonce,
      signature: componentEcho.signature,
      echo: componentEcho.encrypted
    })).resolves.toBe("component-echo");

    const authorizedAppId = "wx1234567890abcdef";
    const authorizedEcho = encryptedEventXml("authorized-echo", timestamp, nonce, authorizedAppId);
    await expect(decryptWechatAuthorizedAccountEcho({
      config,
      authorizedAppId,
      timestamp,
      nonce,
      signature: authorizedEcho.signature,
      echo: authorizedEcho.encrypted
    })).resolves.toBe("authorized-echo");
  });

  it("builds a public-account-only component authorization URL without secrets", () => {
    const url = new URL(buildWechatComponentAuthorizationUrl({
      config,
      preAuthorizationCode: "pre-auth-code",
      callbackUrl: "https://www.finfold.app/api/settings/social-connections/wechat/callback?state=opaque"
    }));
    expect(url.origin).toBe("https://mp.weixin.qq.com");
    expect(url.searchParams.get("component_appid")).toBe(config.appId);
    expect(url.searchParams.get("pre_auth_code")).toBe("pre-auth-code");
    expect(url.searchParams.get("auth_type")).toBe("1");
    expect(url.searchParams.get("redirect_uri")).toContain("state=opaque");
    expect(url.toString()).not.toContain(config.appSecret);
    expect(url.toString()).not.toContain(config.token);
  });

  it("normalizes official aggregate user summary and cumulative counts", async () => {
    const summary = await fetchWechatUserSummary(
      "authorizer-token",
      "2026-08-24",
      "2026-08-24",
      async (input, init) => {
        expect(String(input)).toContain("/datacube/getusersummary?access_token=authorizer-token");
        expect(init?.body).toBe(JSON.stringify({ begin_date: "2026-08-24", end_date: "2026-08-24" }));
        return new Response(JSON.stringify({
          list: [
            { ref_date: "2026-08-24", user_source: 30, new_user: 8, cancel_user: 2 },
            { ref_date: "2026-08-24", user_source: 57, new_user: 3, cancel_user: 1 }
          ]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    );
    const cumulate = await fetchWechatUserCumulate(
      "authorizer-token",
      "2026-08-24",
      "2026-08-24",
      async () => new Response(JSON.stringify({
        list: [{ ref_date: "2026-08-24", cumulate_user: 1200 }]
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    expect(summary).toEqual([
      { refDate: "2026-08-24", userSource: 30, newUser: 8, cancelUser: 2 },
      { refDate: "2026-08-24", userSource: 57, newUser: 3, cancelUser: 1 }
    ]);
    expect(cumulate).toEqual([{ refDate: "2026-08-24", cumulateUser: 1200 }]);
  });

  it("defaults to yesterday in Shanghai and enforces the seven-day API window", () => {
    const now = new Date("2026-08-25T11:00:00.000Z");
    expect(shanghaiDateOffset(-1, now)).toBe("2026-08-24");
    expect(validateWechatAnalyticsRange({ now })).toEqual({ beginDate: "2026-08-24", endDate: "2026-08-24" });
    expect(validateWechatAnalyticsRange({ beginDate: "2026-08-18", endDate: "2026-08-24", now })).toEqual({
      beginDate: "2026-08-18",
      endDate: "2026-08-24"
    });
    expect(() => validateWechatAnalyticsRange({ beginDate: "2026-08-17", endDate: "2026-08-24", now })).toThrow(/at most 7/);
    expect(() => validateWechatAnalyticsRange({ beginDate: "2026-08-25", endDate: "2026-08-25", now })).toThrow(/available through 2026-08-24/);
    expect(buildWechatAnalyticsRequestRanges({ now })).toEqual([
      { beginDate: "2026-08-01", endDate: "2026-08-07" },
      { beginDate: "2026-08-08", endDate: "2026-08-14" },
      { beginDate: "2026-08-15", endDate: "2026-08-21" },
      { beginDate: "2026-08-22", endDate: "2026-08-24" }
    ]);
  });
});
