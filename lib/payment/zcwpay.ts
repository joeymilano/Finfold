// 真川文化聚合支付 (zhenchuanwenhua.cn) — V2 API client.
//
// The aggregate gateway behind Finfold's CN checkout: one merchant account,
// Alipay + WeChat QR/wap payment, RSA-signed requests and callbacks.
//
// Protocol (doc/index.html, doc/sign_note.html):
//   • POST https://<gateway>/api/pay/create  — unified order, returns
//     pay_type ("qrcode" | "jump" | …) + pay_info (QR content / redirect URL)
//   • POST https://<gateway>/api/pay/query   — order status by out_trade_no
//   • GET  notify_url / return_url           — async + browser callbacks
//   • Signature: filter non-empty params (drop sign/sign_type), sort keys by
//     ASCII, join as k=v&k=v, SHA256WithRSA with the merchant private key.
//     Responses + callbacks verify against the PLATFORM public key.
//
// Edge/Workers safe: node:crypto via the nodejs_compat flag (wrangler.toml).

import { createSign, createVerify } from "node:crypto";

export const ZCW_PROVIDER = "zcwpay";

export type ZcwChannel = "alipay" | "wxpay";

/** Device hint derived from the buyer's UA (doc/pay_create.html 设备类型列表). */
export type ZcwDevice = "pc" | "mobile" | "wechat" | "alipay";

export function zcwGateway(): string {
  return (process.env.ZCWPAY_GATEWAY ?? "https://pay.zhenchuanwenhua.cn").replace(/\/+$/, "");
}

export function isZcwPayConfigured(): boolean {
  return Boolean(
    process.env.ZCWPAY_PID && process.env.ZCWPAY_MERCHANT_PRIVATE_KEY && process.env.ZCWPAY_PLATFORM_PUBLIC_KEY
  );
}

// ---- PEM normalization -----------------------------------------------------
// Merchant-console key material is often pasted as a single bare base64 line
// without PEM armor. createSign/createVerify need armored PEM, so wrap it.

export function normalizePem(key: string, kind: "private" | "public"): string {
  const trimmed = key.trim();
  if (trimmed.includes("-----BEGIN")) return ensurePemLineBreaks(trimmed);
  const base64 = trimmed.replace(/\s+/g, "");
  const header =
    kind === "private" ? "PRIVATE KEY" : "PUBLIC KEY";
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${header}-----\n${lines.join("\n")}\n-----END ${header}-----`;
}

function ensurePemLineBreaks(pem: string): string {
  // Some consoles hand out armored keys on one line; rebuild with breaks.
  return pem
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      if (line.includes("-----")) return line;
      return line.trim();
    })
    .join("\n");
}

// ---- Signature core --------------------------------------------------------

export type SignParams = Record<string, string | number | undefined | null>;

/**
 * The canonical signature payload: non-empty params, sign/sign_type dropped,
 * keys sorted by ASCII ascending, joined as key=value with &.
 * Values are used verbatim — no URL encoding at signing time.
 */
export function buildSignPayload(params: SignParams): string {
  const entries = Object.entries(params)
    .filter(
      ([key, value]) =>
        key !== "sign" &&
        key !== "sign_type" &&
        value !== undefined &&
        value !== null &&
        String(value) !== ""
    )
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([key, value]) => `${key}=${value}`).join("&");
}

/** SHA256WithRSA signature (base64) with the merchant private key. */
export function zcwSign(payload: string, privateKeyPem: string): string {
  const signer = createSign("RSA-SHA256");
  signer.update(payload, "utf8");
  return signer.sign(normalizePem(privateKeyPem, "private"), "base64");
}

/** Verify a gateway signature (base64) against the platform public key. */
export function zcwVerify(payload: string, sign: string, publicKeyPem: string): boolean {
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(payload, "utf8");
    return verifier.verify(normalizePem(publicKeyPem, "public"), Buffer.from(sign, "base64"));
  } catch {
    return false;
  }
}

/** True when the unsigned params carry a valid gateway signature. */
export function verifySignedParams(
  params: SignParams,
  publicKeyPem: string
): boolean {
  const sign = params.sign;
  if (typeof sign !== "string" || sign === "") return false;
  return zcwVerify(buildSignPayload(params), sign, publicKeyPem);
}

// ---- Signed gateway call ---------------------------------------------------

type GatewayResponse = Record<string, unknown> & { code?: number; msg?: string };

/**
 * POST to the gateway with an RSA signature, then verify the response
 * signature with the platform key before returning it. A code!==0 body is an
 * error; a response that fails verification is treated as an error too — an
 * unsigned body must never influence order state.
 */
export async function zcwPost(path: string, params: SignParams): Promise<GatewayResponse> {
  const pid = process.env.ZCWPAY_PID;
  const privateKey = process.env.ZCWPAY_MERCHANT_PRIVATE_KEY;
  const publicKey = process.env.ZCWPAY_PLATFORM_PUBLIC_KEY;
  if (!pid || !privateKey || !publicKey) {
    throw new Error("ZCW Pay is not configured.");
  }

  const body: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
        .map(([k, v]) => [k, String(v)])
    ),
    pid,
    timestamp: String(Math.floor(Date.now() / 1000)),
    sign_type: "RSA"
  };
  body.sign = zcwSign(buildSignPayload(body), privateKey);

  const res = await fetch(`${zcwGateway()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString()
  });
  if (!res.ok) {
    throw new Error(`ZCW Pay gateway error (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as GatewayResponse;

  if (data.code !== 0) {
    throw new Error(data.msg || "ZCW Pay rejected the request.");
  }
  if (typeof data.sign === "string" && data.sign !== "") {
    // Narrow the JSON body to the signable scalar fields (drop nested values).
    const signable: SignParams = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "string" || typeof value === "number") {
        signable[key] = value;
      }
    }
    if (!verifySignedParams(signable, publicKey)) {
      throw new Error("ZCW Pay response failed signature verification.");
    }
  }
  return data;
}

// ---- API wrappers ----------------------------------------------------------

export type CreateOrderInput = {
  channel: ZcwChannel;
  device: ZcwDevice;
  /** Merchant order no (our FF- order_code) — unique per order. */
  outTradeNo: string;
  /** Yuan with up to 2 decimals, e.g. "79.00". */
  money: string;
  name: string;
  notifyUrl: string;
  returnUrl: string;
  clientIp: string;
};

export type CreateOrderResult = {
  tradeNo: string;
  /** qrcode | jump | urlscheme | … (doc 发起支付类型说明). */
  payType: string;
  /** QR content (weixin://…) or redirect URL, depending on payType. */
  payInfo: string;
};

/** 统一下单 — returns the QR content / redirect URL to render. */
export async function createZcwGatewayOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const data = await zcwPost("/api/pay/create", {
    method: "web",
    device: input.device,
    type: input.channel,
    out_trade_no: input.outTradeNo,
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    name: input.name,
    money: input.money,
    clientip: input.clientIp
  });
  const tradeNo = typeof data.trade_no === "string" ? data.trade_no : "";
  const payType = typeof data.pay_type === "string" ? data.pay_type : "";
  const payInfo = typeof data.pay_info === "string" ? data.pay_info : "";
  if (!tradeNo || !payType || !payInfo) {
    throw new Error("ZCW Pay returned an incomplete order payload.");
  }
  return { tradeNo, payType, payInfo };
}

export type GatewayOrderStatus = {
  status: "unpaid" | "paid" | "refunded" | "frozen" | "preauth" | "unknown";
  money: string;
  tradeNo: string;
};

const GATEWAY_STATUS: Record<string, GatewayOrderStatus["status"]> = {
  "0": "unpaid",
  "1": "paid",
  "2": "refunded",
  "3": "frozen",
  "4": "preauth"
};

/** 订单查询 — status by merchant order no. */
export async function queryZcwGatewayOrder(outTradeNo: string): Promise<GatewayOrderStatus | null> {
  const data = await zcwPost("/api/pay/query", { out_trade_no: outTradeNo });
  const rawStatus = data.status === undefined ? "" : String(data.status);
  if (!(rawStatus in GATEWAY_STATUS)) return null;
  return {
    status: GATEWAY_STATUS[rawStatus],
    money: typeof data.money === "string" ? data.money : "",
    tradeNo: typeof data.trade_no === "string" ? data.trade_no : ""
  };
}

// ---- Callback verification ---------------------------------------------------

export type ZcwNotifyParams = {
  pid: string;
  tradeNo: string;
  outTradeNo: string;
  apiTradeNo: string;
  type: string;
  tradeStatus: string;
  money: string;
  buyer: string;
  timestamp: string;
  sign: string;
};

/**
 * Parse + verify a GET notify/return callback. Returns null when the payload
 * is malformed; throws nothing — callers distinguish "bad signature" (fail
 * closed, non-"success" reply so the gateway retries) from valid payloads.
 */
export function parseZcwNotify(searchParams: URLSearchParams): ZcwNotifyParams | null {
  const get = (key: string) => searchParams.get(key) ?? "";
  const params: ZcwNotifyParams = {
    pid: get("pid"),
    tradeNo: get("trade_no"),
    outTradeNo: get("out_trade_no"),
    apiTradeNo: get("api_trade_no"),
    type: get("type"),
    tradeStatus: get("trade_status"),
    money: get("money"),
    buyer: get("buyer"),
    timestamp: get("timestamp"),
    sign: get("sign")
  };
  if (!params.outTradeNo || !params.money || !params.sign) return null;
  return params;
}

/** Full callback verification: signature (platform key) + pid + trade_status. */
export function verifyZcwNotify(params: ZcwNotifyParams): boolean {
  const publicKey = process.env.ZCWPAY_PLATFORM_PUBLIC_KEY;
  const pid = process.env.ZCWPAY_PID;
  if (!publicKey || !pid) return false;
  if (params.pid !== pid) return false;
  if (params.tradeStatus !== "TRADE_SUCCESS") return false;
  return verifySignedParams(
    {
      pid: params.pid,
      trade_no: params.tradeNo,
      out_trade_no: params.outTradeNo,
      api_trade_no: params.apiTradeNo,
      type: params.type,
      trade_status: params.tradeStatus,
      money: params.money,
      buyer: params.buyer,
      timestamp: params.timestamp,
      // verifySignedParams drops `sign` from the payload itself and uses it
      // as the signature to check against.
      sign: params.sign
    },
    publicKey
  );
}

// ---- Device / channel helpers ----------------------------------------------

/** Map a User-Agent onto the gateway device hint. */
export function deviceFromUserAgent(ua: string | null): ZcwDevice {
  const s = (ua ?? "").toLowerCase();
  if (s.includes("micromessenger")) return "wechat";
  if (s.includes("alipayclient")) return "alipay";
  if (s.includes("mobile") || s.includes("iphone") || s.includes("android")) return "mobile";
  return "pc";
}

/**
 * Inside WeChat's browser only WeChat Pay can settle (Alipay QR is
 * unscannable there), and vice versa inside the Alipay app. Force the
 * channel to match the container; elsewhere the user's choice stands.
 */
export function resolveChannel(channel: ZcwChannel, device: ZcwDevice): ZcwChannel {
  if (device === "wechat") return "wxpay";
  if (device === "alipay") return "alipay";
  return channel;
}
