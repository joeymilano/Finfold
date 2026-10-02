import { z } from "zod";
import { extensionPlatformSchema, extensionResultSchema, type ExtensionResult } from "@/lib/extension/contracts";

const encoder = new TextEncoder();
const claimPayloadSchema = z.object({
  v: z.literal(1),
  actionId: z.string().uuid(),
  platform: extensionPlatformSchema,
  resultHash: z.string().regex(/^[a-f0-9]{64}$/),
  exp: z.number().int().positive()
}).strict();

export type ClaimPayload = z.infer<typeof claimPayloadSchema>;

function signingSecret(): string {
  const value = process.env.EXTENSION_SIGNING_SECRET ?? process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!value || value.length < 32) throw new Error("Extension signing is not configured.");
  return value;
}

async function hmacBytes(purpose: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${purpose}\u0000${value}`))
  );
}

export async function hmacHex(purpose: string, value: string): Promise<string> {
  return Array.from(await hmacBytes(purpose, value), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function resultHash(result: ExtensionResult): Promise<string> {
  const canonical = extensionResultSchema.parse(result);
  return sha256Hex(JSON.stringify(canonical));
}

export async function createClaimReceipt(input: {
  actionId: string;
  result: ExtensionResult;
  expiresAt: Date;
}): Promise<string> {
  const payload: ClaimPayload = {
    v: 1,
    actionId: input.actionId,
    platform: input.result.platform,
    resultHash: await resultHash(input.result),
    exp: Math.floor(input.expiresAt.getTime() / 1_000)
  };
  const encoded = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = base64UrlEncode(await hmacBytes("extension-claim-v1", encoded));
  return `${encoded}.${signature}`;
}

export async function verifyClaimReceipt(receipt: string): Promise<ClaimPayload | null> {
  const [payloadPart, signaturePart, extra] = receipt.split(".");
  if (!payloadPart || !signaturePart || extra) return null;
  const expected = base64UrlEncode(await hmacBytes("extension-claim-v1", payloadPart));
  if (!timingSafeEqual(expected, signaturePart)) return null;
  try {
    return claimPayloadSchema.parse(JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart))));
  } catch {
    return null;
  }
}

export function randomOpaqueToken(prefix: "ff_ext_a_" | "ff_ext_r_" | "ff_ext_c_"): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `${prefix}${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function base64UrlEncode(value: Uint8Array): string {
  let binary = "";
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
