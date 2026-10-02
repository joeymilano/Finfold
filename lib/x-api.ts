import { z } from "zod";

/**
 * Minimal X API v2 client for the publication pipeline. Every call takes the
 * decrypted user-context access token and an injectable fetcher so tests can
 * validate request shape without network access. Endpoint surface stays
 * deliberate: posting tweets (posts, thread continuation, replies) and
 * uploading the media that attaches to them. Reads are NOT wrapped — the
 * free API tier's monthly read cap is far below what target discovery needs,
 * so discovery happens through public web search instead (lib/x-pipeline/*).
 */

const X_API_BASE = "https://api.x.com";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class XApiError extends Error {
  readonly status: number;
  readonly code: number | null;

  constructor(message: string, status: number, code: number | null = null) {
    super(message);
    this.name = "XApiError";
    this.status = status;
    this.code = code;
  }
}

const tweetResponseSchema = z.object({
  data: z.object({
    id: z.string().min(1).max(64)
  })
});

const mediaUploadResponseSchema = z.object({
  data: z
    .object({ id: z.string().min(1).max(128) })
    .optional(),
  id: z.string().min(1).max(128).optional(),
  media_id_string: z.string().min(1).max(128).optional()
});

const errorBodySchema = z.object({
  title: z.string().max(512).optional(),
  detail: z.string().max(2_048).optional(),
  errors: z
    .array(z.object({
      code: z.coerce.number().int().optional(),
      message: z.string().max(2_048).optional()
    }))
    .optional()
});

async function raiseForError(response: Response, context: string): Promise<never> {
  let message = `X API rejected the ${context} request (${response.status}).`;
  try {
    const parsed = errorBodySchema.safeParse(await response.json());
    if (parsed.success) {
      const first = parsed.data.errors?.[0];
      const summary = parsed.data.detail
        ?? parsed.data.title
        ?? first?.message
        ?? null;
      if (summary) {
        message = first?.code !== undefined
          ? `X API rejected the ${context} request (${first.code}): ${summary}`
          : `X API rejected the ${context} request: ${summary}`;
        throw new XApiError(message.slice(0, 1_000), response.status, first?.code ?? null);
      }
    }
  } catch (error) {
    if (error instanceof XApiError) throw error;
  }
  throw new XApiError(message, response.status);
}

export function isXUnauthorizedError(error: unknown): boolean {
  return error instanceof XApiError && error.status === 401;
}

export function isXRetryableError(error: unknown): boolean {
  if (!(error instanceof XApiError)) return true;
  return error.status === 429 || error.status >= 500;
}

export function buildXTweetUrl(tweetId: string): string {
  return `https://x.com/i/web/status/${tweetId}`;
}

export type PostTweetInput = {
  text: string;
  replyToTweetId?: string | null;
  quoteTweetId?: string | null;
  mediaIds?: readonly string[];
};

export async function postTweet(
  accessToken: string,
  input: PostTweetInput,
  fetcher: FetchLike = fetch
): Promise<{ id: string }> {
  const body: Record<string, unknown> = { text: input.text };
  if (input.replyToTweetId) {
    body.reply = { in_reply_to_tweet_id: input.replyToTweetId };
  }
  if (input.quoteTweetId) {
    body.quote_tweet_id = input.quoteTweetId;
  }
  if (input.mediaIds?.length) {
    body.media = { media_ids: [...input.mediaIds] };
  }

  const response = await fetcher(new URL("/2/tweets", X_API_BASE), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    await raiseForError(response, "tweet posting");
  }
  const parsed = tweetResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new XApiError("X API returned a tweet response without an id.", 200);
  }
  return { id: parsed.data.data.id };
}

export async function uploadXMedia(
  accessToken: string,
  media: { bytes: Uint8Array; contentType: "image/jpeg" | "image/png" | "image/webp" },
  fetcher: FetchLike = fetch
): Promise<{ mediaId: string }> {
  const form = new FormData();
  form.append(
    "media",
    new Blob([new Uint8Array(media.bytes)], { type: media.contentType }),
    `upload.${media.contentType.split("/")[1]}`
  );

  const response = await fetcher(new URL("/2/media/upload", X_API_BASE), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    },
    body: form
  });
  if (!response.ok) {
    await raiseForError(response, "media upload");
  }
  const parsed = mediaUploadResponseSchema.safeParse(await response.json().catch(() => null));
  const mediaId = parsed.success
    ? (parsed.data.data?.id ?? parsed.data.id ?? parsed.data.media_id_string ?? null)
    : null;
  if (!mediaId) {
    throw new XApiError("X API returned a media upload response without an id.", 200);
  }
  return { mediaId };
}
