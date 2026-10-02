/**
 * Finfold 云桥 — 小程序与 finfold.app 之间的唯一通道。
 *
 * 职责：
 *  - login：用云函数上下文里的 OPENID/UNIONID 向 Finfold 换会话 token
 *  - call：把 /api/weapp/v1/* 请求（带 Bearer token）转发到 finfold.app
 *  - wxacode：生成不限量小程序码并上传云存储，返回 fileID
 *
 * 环境变量（云开发控制台配置）：
 *  - FINFOLD_API_BASE     例如 https://www.finfold.app
 *  - WEAPP_BRIDGE_SECRET  与 Finfold 侧 WEAPP_BRIDGE_SECRET 一致的共享密钥
 */
const cloud = require("wx-server-sdk");
const https = require("https");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const REQUEST_TIMEOUT_MS = 20000;
const ALLOWED_PATH = /^\/api\/weapp\/v1\/[A-Za-z0-9\-/]*$/;

function httpRequest(method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = https.request(
      {
        hostname: target.hostname,
        path: target.pathname + target.search,
        method,
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          "content-type": "application/json",
          ...(payload ? { "content-length": Buffer.byteLength(payload) } : {}),
          ...headers
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch (e) {
            data = { error: `invalid upstream response: ${raw.slice(0, 200)}` };
          }
          resolve({ status: res.statusCode, data });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("upstream timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function bridgeHeaders() {
  const secret = process.env.WEAPP_BRIDGE_SECRET;
  if (!secret) throw new Error("WEAPP_BRIDGE_SECRET is not configured");
  return { "x-weapp-bridge-secret": secret };
}

exports.main = async (event) => {
  const base = process.env.FINFOLD_API_BASE;
  if (!base) {
    return { ok: false, error: "FINFOLD_API_BASE is not configured" };
  }
  const op = event && event.op;

  try {
    if (op === "login") {
      const { OPENID, UNIONID } = cloud.getWXContext();
      if (!OPENID) return { ok: false, error: "no openid in cloud context" };
      const { status, data } = await httpRequest(
        "POST",
        `${base}/api/weapp/v1/session`,
        { openid: OPENID, unionid: UNIONID || null, nickname: event.nickname || null },
        bridgeHeaders()
      );
      return { ok: status === 200, status, data };
    }

    if (op === "call") {
      const { method, path, body, token } = event;
      if (typeof path !== "string" || !ALLOWED_PATH.test(path)) {
        return { ok: false, error: "path not allowed" };
      }
      const normalizedMethod = String(method || "GET").toUpperCase();
      if (!["GET", "POST", "PATCH"].includes(normalizedMethod)) {
        return { ok: false, error: "method not allowed" };
      }
      const { status, data } = await httpRequest(
        normalizedMethod,
        `${base}${path}`,
        body,
        token ? { authorization: `Bearer ${token}` } : {}
      );
      return { ok: status >= 200 && status < 400, status, data };
    }

    if (op === "skillCall") {
      // 微信 AI（小程序 AI 开发模式）入口：无客户端 token，
      // 服务端先以当前微信用户身份换会话，再转发；只放行只读面 + 成稿。
      const { OPENID: SKILL_OPENID, UNIONID: SKILL_UNIONID } = cloud.getWXContext();
      if (!SKILL_OPENID) return { ok: false, error: "no openid in cloud context" };
      const { method, path, body } = event;
      if (typeof path !== "string" || !ALLOWED_PATH.test(path)) {
        return { ok: false, error: "path not allowed" };
      }
      const SKILL_ALLOWED = path.startsWith("/api/weapp/v1/opportunities") || path.startsWith("/api/weapp/v1/drafts");
      if (!SKILL_ALLOWED) return { ok: false, error: "path not allowed for skill" };
      const normalizedMethod = String(method || "GET").toUpperCase();
      if (!["GET", "POST"].includes(normalizedMethod)) {
        return { ok: false, error: "method not allowed" };
      }
      const session = await httpRequest(
        "POST",
        `${base}/api/weapp/v1/session`,
        { openid: SKILL_OPENID, unionid: SKILL_UNIONID || null },
        bridgeHeaders()
      );
      if (session.status !== 200 || !session.data || !session.data.token) {
        return { ok: false, status: session.status, data: session.data };
      }
      const { status, data } = await httpRequest(normalizedMethod, `${base}${path}`, body, {
        authorization: `Bearer ${session.data.token}`
      });
      return { ok: status >= 200 && status < 400, status, data };
    }

    if (op === "wxacode") {
      const result = await cloud.openapi.wxacode.getUnlimited({
        page: event.page,
        scene: event.scene,
        checkPath: false,
        envVersion: event.envVersion || "release",
        width: 430
      });
      const upload = await cloud.uploadFile({
        cloudPath: `wxacode/${Date.now()}-${Math.round(Math.random() * 1e6)}.png`,
        fileContent: result.buffer
      });
      return { ok: true, data: { fileID: upload.fileID } };
    }

    return { ok: false, error: `unknown op: ${op}` };
  } catch (error) {
    return { ok: false, error: (error && error.errMsg) || (error && error.message) || "bridge error" };
  }
};
