import { z } from "zod";
import { focalPointSchema, sourceImageConfidenceSchema } from "@/lib/source-image";
import type { SourceImageCandidate } from "@/lib/source-image";
import type { UnsignedSourceImageCandidate } from "@/lib/source-image-discovery";

const selectionPayloadSchema = z.object({
  v: z.literal(1),
  userId: z.string().uuid(),
  imageUrl: z.string().url().max(2048),
  pageUrl: z.string().url().max(2048),
  provider: z.enum(["official_page", "official_social"]),
  title: z.string().max(300).optional(),
  domain: z.string().min(1).max(253),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  alt: z.string().max(500).optional(),
  confidence: sourceImageConfidenceSchema,
  focalPoint: focalPointSchema.optional(),
  score: z.number().finite(),
  exp: z.number().int().positive()
});

export type SourceImageSelectionPayload = z.infer<typeof selectionPayloadSchema>;

const TOKEN_TTL_MS = 10 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function signSourceImageSelection(
  payload: Omit<SourceImageSelectionPayload, "v" | "exp">,
  nowMs = Date.now()
): Promise<string> {
  const complete = selectionPayloadSchema.parse({
    ...payload,
    v: 1,
    exp: nowMs + TOKEN_TTL_MS
  });
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(complete)));
  const signature = await sign(encodedPayload);
  return `${encodedPayload}.${bytesToBase64Url(signature)}`;
}

export async function attachSourceImageSelectionTokens(
  userId: string,
  candidates: UnsignedSourceImageCandidate[]
): Promise<SourceImageCandidate[]> {
  return Promise.all(candidates.map(async (candidate) => ({
    ...candidate,
    selectionToken: await signSourceImageSelection({
      userId,
      imageUrl: candidate.originalUrl,
      pageUrl: candidate.pageUrl,
      provider: candidate.provider,
      title: candidate.title,
      domain: candidate.domain,
      width: candidate.width,
      height: candidate.height,
      alt: candidate.alt,
      confidence: candidate.confidence,
      focalPoint: candidate.focalPoint,
      score: candidate.score
    })
  })));
}

export async function verifySourceImageSelection(
  token: string,
  expectedUserId: string,
  nowMs = Date.now()
): Promise<SourceImageSelectionPayload> {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) throw new Error("Invalid image selection token.");

  const key = await selectionKey();
  const signature = base64UrlToBytes(encodedSignature);
  const signatureBytes = signature.buffer.slice(
    signature.byteOffset,
    signature.byteOffset + signature.byteLength
  ) as ArrayBuffer;
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(encodedPayload)
  );
  if (!valid) throw new Error("Invalid image selection token.");

  let decoded: unknown;
  try {
    decoded = JSON.parse(decoder.decode(base64UrlToBytes(encodedPayload)));
  } catch {
    throw new Error("Invalid image selection token.");
  }
  const payload = selectionPayloadSchema.parse(decoded);
  if (payload.userId !== expectedUserId) throw new Error("This image selection belongs to another account.");
  if (payload.exp < nowMs) throw new Error("This image selection expired. Refresh the source and choose it again.");
  return payload;
}

async function sign(value: string): Promise<Uint8Array> {
  const key = await selectionKey();
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function selectionKey(): Promise<CryptoKey> {
  const encoded = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error("Source-image selection signing is not configured.");
  const sourceKey = base64ToBytes(encoded);
  if (sourceKey.byteLength !== 32) {
    throw new Error("Source-image selection signing key is invalid.");
  }
  const domainSeparated = encoder.encode("finfold/source-image-selection/v1");
  const material = new Uint8Array(sourceKey.byteLength + domainSeparated.byteLength);
  material.set(sourceKey, 0);
  material.set(domainSeparated, sourceKey.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  return base64ToBytes(value.replace(/-/g, "+").replace(/_/g, "/"));
}

function base64ToBytes(value: string): Uint8Array {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("Invalid image selection token.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
