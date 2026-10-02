import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fingerprintXContentSnapshot,
  xContentSnapshotSchema,
  type XContentSnapshot
} from "@/lib/x-pipeline/content";
import { dispatchXPublicationJobs } from "@/lib/x-pipeline/jobs";
import { getActiveXPublishingCredentials } from "@/lib/x-connections";

vi.mock("@/lib/x-connections", () => ({
  getActiveXPublishingCredentials: vi.fn()
}));

const mockCredentials = vi.mocked(getActiveXPublishingCredentials);

type JobRow = Record<string, unknown> & { id: string };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function makeSnapshot(overrides: Record<string, unknown> = {}): XContentSnapshot {
  return xContentSnapshotSchema.parse({
    kind: "post",
    tweets: [{ text: "Ship the pipeline.", mediaUrl: null }],
    replyToTweetId: null,
    quoteTweetId: null,
    language: "en",
    topic: { source: "manual", ref: "test-run", title: "Test topic" },
    notes: null,
    ...overrides
  });
}

async function makeJob(overrides: Record<string, unknown> = {}): Promise<JobRow> {
  const snapshot = (overrides.content_snapshot as XContentSnapshot) ?? makeSnapshot();
  return {
    id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    connection_account_id: null,
    kind: snapshot.kind,
    status: "scheduled",
    scheduled_for: new Date(Date.now() - 3_600_000).toISOString(),
    approved_at: new Date(Date.now() - 1_800_000).toISOString(),
    content_fingerprint: await fingerprintXContentSnapshot(snapshot),
    content_snapshot: snapshot,
    posted_tweet_ids: [],
    reply_to_tweet_id: snapshot.replyToTweetId,
    tweet_id: null,
    tweet_url: null,
    attempt_count: 0,
    next_attempt_at: new Date(Date.now() - 60_000).toISOString(),
    lease_token: null,
    lease_expires_at: null,
    error_code: null,
    error_message: null,
    idempotency_key: crypto.randomUUID(),
    published_at: null,
    created_at: new Date(Date.now() - 7_200_000).toISOString(),
    updated_at: new Date(Date.now() - 1_800_000).toISOString(),
    ...overrides
  };
}

function createFakeAdmin(rows: JobRow[], settings: Record<string, Record<string, unknown>> = {}) {
  return {
    settingsStore: settings,
    rpc: async (name: string) => {
      if (name !== "claim_due_x_publication_jobs") throw new Error(`Unexpected rpc ${name}.`);
      return {
        data: rows.map((row) => {
          const leaseToken = crypto.randomUUID();
          row.lease_token = leaseToken;
          row.lease_expires_at = new Date(Date.now() + 90_000).toISOString();
          row.attempt_count = (row.attempt_count as number) + 1;
          return { ...row };
        }),
        error: null
      };
    },
    from: (table: string) => {
      if (table === "x_pipeline_settings") {
        return {
          select: () => ({
            eq: (_column: string, value: unknown) => ({
              maybeSingle: async () => ({ data: settings[String(value)] ?? null, error: null })
            })
          }),
          upsert: (patch: Record<string, unknown>) => {
            const key = String(patch.user_id);
            settings[key] = { ...settings[key], ...patch };
            return Promise.resolve({ data: null, error: null });
          }
        };
      }
      if (table !== "x_publication_jobs") throw new Error(`Unexpected table ${table}.`);
      return {
        update: (patch: Record<string, unknown>) => ({
          eq: (column: string, value: unknown) => ({
            eq: (column2: string, value2: unknown) => ({
              select: () => ({
                maybeSingle: async () => {
                  const match = rows.find(
                    (row) => row[column] === value && row[column2] === value2
                  );
                  if (!match) return { data: null, error: null };
                  Object.assign(match, { ...patch, updated_at: new Date().toISOString() });
                  return { data: { id: match.id }, error: null };
                }
              })
            })
          })
        })
      };
    }
  };
}

type PostedTweet = { text: string; replyTo: string | null; mediaIds: string[] | undefined };

function createXProvider(posted: PostedTweet[]) {
  let sequence = 100;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.endsWith("/2/tweets")) throw new Error(`Unexpected X endpoint ${url}.`);
    const body = JSON.parse(String(init?.body)) as {
      text: string;
      reply?: { in_reply_to_tweet_id: string };
      media?: { media_ids: string[] };
    };
    sequence += 1;
    posted.push({
      text: body.text,
      replyTo: body.reply?.in_reply_to_tweet_id ?? null,
      mediaIds: body.media?.media_ids
    });
    return jsonResponse({ data: { id: String(sequence) } });
  });
}

beforeEach(() => {
  mockCredentials.mockReset();
  mockCredentials.mockResolvedValue({
    connectionId: "connection-1",
    accessToken: "user-token",
    refreshToken: "refresh-token",
    tokenExpiresAt: null,
    grantedScopes: ["tweet.read", "tweet.write", "users.read", "offline.access"]
  });
});

describe("X publication content contracts", () => {
  it("enforces the per-kind tweet shape", () => {
    expect(() => makeSnapshot({ kind: "post", tweets: [
      { text: "one", mediaUrl: null },
      { text: "two", mediaUrl: null }
    ] })).toThrow();
    expect(() => makeSnapshot({ kind: "thread", tweets: [
      { text: "only", mediaUrl: null }
    ] })).toThrow();
    expect(() => makeSnapshot({ kind: "reply" })).toThrow();
    expect(() => makeSnapshot({ replyToTweetId: "123" })).toThrow();
    expect(() => makeSnapshot({ tweets: [{ text: "x".repeat(281), mediaUrl: null }] })).toThrow();
    expect(() => makeSnapshot({
      kind: "reply",
      replyToTweetId: "1747000000000000000",
      tweets: [{ text: "Great point.", mediaUrl: null }]
    })).not.toThrow();
  });

  it("fingerprints content canonically regardless of key order", async () => {
    const reverseKeysDeep = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reverseKeysDeep);
      if (value !== null && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .reverse()
            .map(([key, item]) => [key, reverseKeysDeep(item)])
        );
      }
      return value;
    };
    const a = makeSnapshot();
    const b = reverseKeysDeep(a) as XContentSnapshot;
    expect(await fingerprintXContentSnapshot(a)).toBe(await fingerprintXContentSnapshot(b));
    const changed = makeSnapshot({ tweets: [{ text: "Different.", mediaUrl: null }] });
    expect(await fingerprintXContentSnapshot(a)).not.toBe(await fingerprintXContentSnapshot(changed));
  });
});

describe("X publication dispatch", () => {
  it("publishes a single approved post end to end", async () => {
    const job = await makeJob();
    const admin = createFakeAdmin([job]);
    const posted: PostedTweet[] = [];
    const provider = createXProvider(posted);

    const result = await dispatchXPublicationJobs(admin as never, { providerFetch: provider });

    expect(result).toEqual({ claimed: 1, succeeded: 1, failed: 0 });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ text: "Ship the pipeline.", replyTo: null });
    expect(job.status).toBe("published");
    expect(job.tweet_id).toBe("101");
    expect(job.tweet_url).toBe("https://x.com/i/web/status/101");
    expect(Date.parse(job.published_at as string)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("chains a thread through replies and resumes only the unposted tail", async () => {
    const threadSnapshot = makeSnapshot({
      kind: "thread",
      tweets: [
        { text: "T1 hook", mediaUrl: null },
        { text: "T2 body", mediaUrl: null },
        { text: "T3 close", mediaUrl: null }
      ]
    });
    const job = await makeJob({
      kind: "thread",
      status: "publishing",
      attempt_count: 1,
      content_snapshot: threadSnapshot,
      posted_tweet_ids: ["900"],
      tweet_id: "900",
      tweet_url: "https://x.com/i/web/status/900"
    });
    const admin = createFakeAdmin([job]);
    const posted: PostedTweet[] = [];
    const provider = createXProvider(posted);

    const result = await dispatchXPublicationJobs(admin as never, { providerFetch: provider });

    expect(result.succeeded).toBe(1);
    expect(posted.map((tweet) => tweet.text)).toEqual(["T2 body", "T3 close"]);
    expect(posted[0].replyTo).toBe("900");
    expect(posted[1].replyTo).toBe("101");
    expect(job.posted_tweet_ids).toEqual(["900", "101", "102"]);
    // The shareable URL stays on the thread root.
    expect(job.tweet_id).toBe("900");
    expect(job.status).toBe("published");
  });

  it("settles a thread whose final tweet landed before the crash", async () => {
    const threadSnapshot = makeSnapshot({
      kind: "thread",
      tweets: [
        { text: "T1", mediaUrl: null },
        { text: "T2", mediaUrl: null }
      ]
    });
    const job = await makeJob({
      kind: "thread",
      status: "publishing",
      content_snapshot: threadSnapshot,
      posted_tweet_ids: ["900", "901"],
      tweet_id: "900"
    });
    const admin = createFakeAdmin([job]);
    const posted: PostedTweet[] = [];

    const result = await dispatchXPublicationJobs(admin as never, {
      providerFetch: createXProvider(posted)
    });

    expect(posted).toHaveLength(0);
    expect(result.succeeded).toBe(1);
    expect(job.status).toBe("published");
    expect(job.tweet_url).toBe("https://x.com/i/web/status/900");
  });

  it("fails closed when the snapshot no longer matches the approved fingerprint", async () => {
    const job = await makeJob({
      content_fingerprint: "a".repeat(64)
    });
    const admin = createFakeAdmin([job]);
    const posted: PostedTweet[] = [];

    const result = await dispatchXPublicationJobs(admin as never, {
      providerFetch: createXProvider(posted)
    });

    expect(posted).toHaveLength(0);
    expect(result.failed).toBe(1);
    expect(job.status).toBe("failed");
    expect(job.error_code).toBe("content_fingerprint_mismatch");
  });

  it("schedules a retry for rate limits but fails provider rejections", async () => {
    const rateLimited = await makeJob();
    const rejected = await makeJob({
      content_snapshot: makeSnapshot({ tweets: [{ text: "Duplicate.", mediaUrl: null }] })
    });
    const admin = createFakeAdmin([rateLimited, rejected]);
    let call = 0;
    const provider = vi.fn(async () => {
      call += 1;
      return call === 1
        ? jsonResponse({ title: "Too Many Requests", status: 429 }, 429)
        : jsonResponse({ errors: [{ code: 187, message: "Status is a duplicate." }] }, 403);
    });

    const result = await dispatchXPublicationJobs(admin as never, { providerFetch: provider });

    expect(result).toEqual({ claimed: 2, succeeded: 0, failed: 2 });
    expect(rateLimited.status).toBe("scheduled");
    expect(rateLimited.error_code).toBe("transient_processing_error");
    expect(Date.parse(rateLimited.next_attempt_at as string)).toBeGreaterThan(Date.now());
    expect(rejected.status).toBe("failed");
    expect(rejected.error_code).toBe("x_api_403");
  });

  it("trips the circuit breaker after three consecutive failed jobs", async () => {
    const userId = crypto.randomUUID();
    const jobs = await Promise.all([
      makeJob({ user_id: userId, content_snapshot: makeSnapshot({ tweets: [{ text: "A", mediaUrl: null }] }) }),
      makeJob({ user_id: userId, content_snapshot: makeSnapshot({ tweets: [{ text: "B", mediaUrl: null }] }) }),
      makeJob({ user_id: userId, content_snapshot: makeSnapshot({ tweets: [{ text: "C", mediaUrl: null }] }) })
    ]);
    const settings: Record<string, Record<string, unknown>> = {};
    const admin = createFakeAdmin(jobs, settings);
    const provider = vi.fn(async () =>
      jsonResponse({ errors: [{ code: 187, message: "Status is a duplicate." }] }, 403)
    );

    const result = await dispatchXPublicationJobs(admin as never, { providerFetch: provider });

    expect(result).toEqual({ claimed: 3, succeeded: 0, failed: 3 });
    expect(jobs.every((job) => job.status === "failed")).toBe(true);
    expect(settings[userId]).toMatchObject({
      consecutive_failures: 3,
      paused: true,
      paused_reason: "circuit_breaker"
    });
  });

  it("resets the failure streak after any successful publish", async () => {
    const userId = crypto.randomUUID();
    const failing = await makeJob({
      user_id: userId,
      content_snapshot: makeSnapshot({ tweets: [{ text: "dup", mediaUrl: null }] })
    });
    const settings: Record<string, Record<string, unknown>> = {
      [userId]: { consecutive_failures: 2, paused: false }
    };
    const admin = createFakeAdmin([failing], settings);
    let call = 0;
    const provider = vi.fn(async () => {
      call += 1;
      return call === 1
        ? jsonResponse({ errors: [{ code: 187, message: "Status is a duplicate." }] }, 403)
        : jsonResponse({ data: { id: "555" } });
    });

    // First wave: the duplicate fails (streak would be 3).
    await dispatchXPublicationJobs(admin as never, { providerFetch: provider });
    expect(settings[userId]).toMatchObject({ consecutive_failures: 3, paused: true });

    // After clearing the pause, one success zeroes the streak.
    settings[userId].paused = false;
    failing.status = "scheduled";
    failing.error_code = null;
    failing.attempt_count = 0;
    const retryJob = await makeJob({
      id: failing.id,
      user_id: userId,
      content_snapshot: makeSnapshot({ tweets: [{ text: "fresh take", mediaUrl: null }] })
    });
    const secondAdmin = createFakeAdmin([retryJob], settings);
    await dispatchXPublicationJobs(secondAdmin as never, { providerFetch: provider });
    expect(settings[userId]).toMatchObject({ consecutive_failures: 0, paused: false });
  });

  it("refreshes the user token once after a 401 and completes the publish", async () => {
    const job = await makeJob();
    const admin = createFakeAdmin([job]);
    const posted: PostedTweet[] = [];
    const provider = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (headers.get("authorization") === "Bearer user-token") {
        return jsonResponse({ title: "Unauthorized", status: 401 }, 401);
      }
      posted.push({
        text: (JSON.parse(String(init?.body)) as { text: string }).text,
        replyTo: null,
        mediaIds: undefined
      });
      return jsonResponse({ data: { id: "777" } });
    });
    mockCredentials.mockImplementation(async (_admin, _userId, forceRefresh) => ({
      connectionId: "connection-1",
      accessToken: forceRefresh ? "refreshed-token" : "user-token",
      refreshToken: "refresh-token",
      tokenExpiresAt: null,
      grantedScopes: ["tweet.write"]
    }));

    const result = await dispatchXPublicationJobs(admin as never, { providerFetch: provider });

    expect(result).toEqual({ claimed: 1, succeeded: 1, failed: 0 });
    expect(job.status).toBe("published");
    expect(mockCredentials).toHaveBeenCalledWith(
      expect.anything(),
      job.user_id,
      true,
      expect.anything()
    );
  });
});
