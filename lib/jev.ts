/**
 * TypeSafe "Jev" (System One) decision client.
 *
 * Jev is not a chat model: it answers typed questions — boolean probability
 * (noul), single choice with a full distribution, ordered scale position —
 * about a text/JSON state in one fan-out call. Finfold uses it as the cheap,
 * fast decision layer between content generation (sonnet drafts) and
 * execution (X API publish / human review console). It never generates
 * text and never executes anything itself.
 *
 * Fail-closed contract: every call site must treat JevUnavailableError as
 * "fall back to the pre-Jev behavior" (human review, unfiltered draft
 * pass-through) — never as "act anyway".
 */

import { logInfo, logWarn } from "@/lib/observability";

const JEV_API_URL = "https://api.typesafe.ai/v1/systemone";
const REQUEST_TIMEOUT_MS = 10_000;
/** Initial attempt + two exponential-backoff retries on 429/529 only. */
const MAX_ATTEMPTS = 3;

/** Both vars must be set together, mirroring the X_OAUTH_ENABLED gate. */
export function jevEnabled(): boolean {
  return process.env.JEV_ENABLED === "true" && Boolean(process.env.JEV_API_KEY?.trim());
}

export class JevUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JevUnavailableError";
  }
}

export type JevNoulQuestion = { type: "noul"; instructions: string };
export type JevChoiceQuestion = {
  type: "choice";
  instructions: string;
  /** Option name → description. Keep an explicit "other" escape hatch. */
  criteria: Record<string, string>;
};
export type JevScoreQuestion = {
  type: "score";
  instructions: string;
  /** Ordered low→high scale descriptions, 2–10 levels. */
  criteria: [string, string, ...string[]];
};

export type JevQuestion = JevNoulQuestion | JevChoiceQuestion | JevScoreQuestion;
export type JevQuestions = Record<string, JevQuestion>;
export type JevState = string | Record<string, unknown> | unknown[];

export type JevNoulAnswer = { type: "noul"; probability: number };
export type JevChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number | null;
};
export type JevScoreAnswer = {
  type: "score";
  /** Probability-weighted mean; may land between levels. */
  score: number;
  probabilities: number[];
  confidence: number | null;
};
export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;

export type JevUsage = { inputTokens: number; outputTokens: number };

export type JevResult<Q extends JevQuestions> = {
  /** Versioned model id that actually answered (log/audit this). */
  model: string;
  answers: { [K in keyof Q]: JevAnswer };
  usage: JevUsage;
};

function parseAnswer(questionId: string, raw: unknown): JevAnswer {
  if (!raw || typeof raw !== "object") throw new JevUnavailableError(`missing answer for "${questionId}"`);
  const value = raw as Record<string, unknown>;
  const type = value.type;
  if (type === "noul") {
    if (typeof value.noul !== "number" || !Number.isFinite(value.noul)) {
      throw new JevUnavailableError(`answer "${questionId}" has no usable noul probability`);
    }
    return { type: "noul", probability: Math.min(1, Math.max(0, value.noul)) };
  }
  if (type === "choice") {
    if (typeof value.choice !== "string") throw new JevUnavailableError(`answer "${questionId}" has no choice`);
    const probabilities =
      value.probabilities && typeof value.probabilities === "object"
        ? Object.fromEntries(
            Object.entries(value.probabilities as Record<string, unknown>)
              .filter(([, p]) => typeof p === "number" && Number.isFinite(p))
              .map(([k, p]) => [k, p as number])
          )
        : {};
    return {
      type: "choice",
      choice: value.choice,
      probabilities,
      confidence: typeof value.confidence === "number" ? value.confidence : null
    };
  }
  if (type === "score") {
    if (typeof value.score !== "number" || !Number.isFinite(value.score)) {
      throw new JevUnavailableError(`answer "${questionId}" has no usable score`);
    }
    return {
      type: "score",
      score: value.score,
      probabilities: Array.isArray(value.probabilities)
        ? value.probabilities.filter((p): p is number => typeof p === "number" && Number.isFinite(p))
        : [],
      confidence: typeof value.confidence === "number" ? value.confidence : null
    };
  }
  throw new JevUnavailableError(`answer "${questionId}" has unknown type "${String(type)}"`);
}

function parseJevResponse<Q extends JevQuestions>(rawBody: unknown): JevResult<Q> {
  if (!rawBody || typeof rawBody !== "object") throw new JevUnavailableError("empty response body");
  const body = rawBody as Record<string, unknown>;
  if (!body.answers || typeof body.answers !== "object") throw new JevUnavailableError("response has no answers");
  const rawAnswers = body.answers as Record<string, unknown>;
  const answers: Record<string, JevAnswer> = {};
  for (const questionId of Object.keys(rawAnswers)) {
    answers[questionId] = parseAnswer(questionId, rawAnswers[questionId]);
  }
  const usageRaw = body.usage && typeof body.usage === "object" ? body.usage as Record<string, unknown> : {};
  return {
    model: typeof body.model === "string" ? body.model : "unknown",
    answers: answers as { [K in keyof Q]: JevAnswer },
    usage: {
      inputTokens: typeof usageRaw.input_tokens === "number" ? usageRaw.input_tokens : 0,
      outputTokens: typeof usageRaw.output_tokens === "number" ? usageRaw.output_tokens : 0
    }
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ask Jev a batch of independent questions about one state (the official
 * "speculative fan-out" pattern — one HTTP call per decision point, not per
 * question). Throws JevUnavailableError on any transport/parse failure so
 * callers fail closed.
 */
export async function askJev<Q extends JevQuestions>(
  state: JevState,
  questions: Q,
  options: { operation: string; userId?: string }
): Promise<JevResult<Q>> {
  if (!jevEnabled()) throw new JevUnavailableError("jev_disabled");

  const body = JSON.stringify({
    model: process.env.JEV_MODEL?.trim() || "jev-latest",
    state,
    questions
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetch(JEV_API_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.JEV_API_KEY?.trim()}`,
          "content-type": "application/json"
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (response.status === 429 || response.status === 529) {
        // Overloaded / rate limited — the only retryable outcomes per docs.
        if (attempt < MAX_ATTEMPTS) {
          await sleep(2 ** (attempt - 1) * 500);
          continue;
        }
        throw new JevUnavailableError(`jev_overloaded_${response.status}`);
      }
      if (!response.ok) {
        // 401/422 are configuration or schema bugs — retrying cannot help.
        throw new JevUnavailableError(`jev_rejected_${response.status}`);
      }
      const result = parseJevResponse<Q>(await response.json());
      logInfo("jev_decision", { userId: options.userId }, {
        operation: options.operation,
        model: result.model,
        questions: Object.keys(questions).length,
        latency_ms: Date.now() - startedAt,
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      const unavailable = error instanceof JevUnavailableError
        ? error
        : new JevUnavailableError(`jev_transport_error:${message.slice(0, 120)}`);
      // Rejected requests and malformed answers are deterministic — only
      // genuine transport errors (fetch throw / timeout) benefit from a retry.
      if (error instanceof JevUnavailableError || attempt >= MAX_ATTEMPTS) {
        logWarn("jev_unavailable", { userId: options.userId }, {
          operation: options.operation,
          latency_ms: Date.now() - startedAt,
          reason: unavailable.message
        });
        throw unavailable;
      }
      await sleep(2 ** (attempt - 1) * 500);
    }
  }
  throw new JevUnavailableError("jev_exhausted_retries");
}
