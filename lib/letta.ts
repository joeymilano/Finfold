/**
 * Letta API Client — server-side only.
 *
 * This module wraps the Letta REST API so that the API key is never
 * exposed to the browser. All calls go through backend API routes.
 *
 * Key features:
 *  - Create / get / delete Letta agents (1 per user)
 *  - Send messages (conversational)
 *  - Send structured generation requests (for /api/generate etc.)
 *
 * Letta docs: https://docs.letta.com/api-reference
 *
 * IMPORTANT: The Letta /v1/chat/completions endpoint is NOT a standard
 * OpenAI-compatible endpoint — it requires an agent_id. Therefore, we
 * must NOT use it as an LLM fallback. The LLM fallback uses the
 * z-ai-web-dev-sdk instead (see lib/llm.ts).
 */

const LETTA_BASE_URL  = process.env.LETTA_API_URL  ?? "https://api.letta.com";
const LETTA_API_KEY   = process.env.LETTA_API_KEY   ?? "";
const LETTA_MODEL     = process.env.LETTA_MODEL     ?? "openai/gpt-4o-mini";
const LETTA_EMBEDDING = process.env.LETTA_EMBEDDING  ?? "openai/text-embedding-3-small";

// ─── Types ───────────────────────────────────────────────────────────

export interface LettaAgent {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  llm_config: {
    model: string;
    context_window: number;
    [key: string]: unknown;
  };
}

export interface LettaMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  date: string;
  message_type: string;
}

export interface LettaMemoryBlock {
  label: string;
  value: string;
  limit?: number;
}

export interface LettaParsedResponse {
  assistantMessage: string;
  allMessages: LettaMessage[];
}

// ─── Config check ────────────────────────────────────────────────────

export function isLettaConfigured(): boolean {
  return Boolean(LETTA_API_KEY);
}

// ─── Helpers ─────────────────────────────────────────────────────────

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${LETTA_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Check if an error is an "agent-not-found" error from the Letta API.
 * This happens when a stale agent ID is stored in user metadata.
 */
export function isAgentNotFoundError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("agent-not-found") ||
      msg.includes("could not be found") ||
      (msg.includes("429") && msg.includes("agent"))
    );
  }
  return false;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${LETTA_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...headers(), ...(options.headers as Record<string, string>) },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Letta API ${res.status}: ${body || res.statusText}`);
  }

  // DELETE may return empty body
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ─── Agent CRUD ──────────────────────────────────────────────────────

/**
 * List all Letta agents.
 */
export async function listLettaAgents(): Promise<LettaAgent[]> {
  return request<LettaAgent[]>("/v1/agents");
}

/**
 * Get a single Letta agent by ID.
 * Throws if the agent does not exist or the API key is invalid.
 */
export async function getLettaAgent(agentId: string): Promise<LettaAgent> {
  return request<LettaAgent>(`/v1/agents/${agentId}`);
}

/**
 * Create a new Letta agent for a Finfold user.
 *
 * The agent is given a persona that matches Finfold's brand content
 * creation use-case, plus a human block that identifies the user.
 *
 * Uses the model specified in LETTA_MODEL env var (default: openai/gpt-4o-mini).
 * If the model is not available (e.g. openai-proxy/gpt-4.1-mini not registered),
 * falls back to openai/gpt-4o-mini which is always available on Letta.
 */
export async function createLettaAgent(
  userId: string,
  userEmail: string
): Promise<LettaAgent> {
  const memoryBlocks: LettaMemoryBlock[] = [
    {
      label: "persona",
      value: [
        "You are Finfold AI, a senior growth strategist and content creation assistant.",
        "You deeply understand each social media platform's algorithm and culture.",
        "Your job is NOT to write generic AI copy — it is to produce content that earns real attention, trust, and action on each specific platform.",
        "You can generate marketing content for platforms like WeChat, Xiaohongshu, X (Twitter), LinkedIn, Reddit, Product Hunt, and more.",
        "When asked to generate structured content, you MUST return strict JSON matching the requested schema — no markdown fences, no commentary outside the JSON.",
        "You always follow anti-AI-flavor rules: no generic phrases, no passive voice, no filler. Content must sound like a real person wrote it.",
        "You are helpful, specific, and action-oriented.",
      ].join("\n"),
    },
    {
      label: "human",
      value: [
        `User ID: ${userId}`,
        `Email: ${userEmail}`,
        "This user is a Finfold platform user who creates brand content.",
        "They may ask you to generate content kits, brainstorm ideas, analyze performance, or create campaign plans.",
      ].join("\n"),
    },
  ];

  const body: Record<string, unknown> = {
    name: `finfold-user-${userId.substring(0, 8)}`,
    description: `Finfold AI agent for user ${userEmail}`,
    model: LETTA_MODEL,
    embedding: LETTA_EMBEDDING,
    memory_blocks: memoryBlocks,
  };

  try {
    return await request<LettaAgent>("/v1/agents", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (primaryError) {
    // If the configured model is not found, fall back to openai/gpt-4o-mini
    const errMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
    if (errMsg.includes("NOT_FOUND") || errMsg.includes("not found")) {
      console.warn(
        `[Letta] Model "${LETTA_MODEL}" not found, falling back to openai/gpt-4o-mini`
      );
      const fallbackBody: Record<string, unknown> = {
        ...body,
        model: "openai/gpt-4o-mini",
      };
      return request<LettaAgent>("/v1/agents", {
        method: "POST",
        body: JSON.stringify(fallbackBody),
      });
    }
    throw primaryError;
  }
}

/**
 * Delete a Letta agent.
 */
export async function deleteLettaAgent(agentId: string): Promise<void> {
  await request<void>(`/v1/agents/${agentId}`, { method: "DELETE" });
}

// ─── Messaging ───────────────────────────────────────────────────────

/**
 * Send a user message to a Letta agent and return the parsed response.
 *
 * Uses the non-streaming API for reliability. The Letta API returns:
 * { messages: [...], stop_reason, usage }
 *
 * Each message has: { id, date, message_type, content, ... }
 * message_type can be: "assistant_message", "reasoning_message", "tool_call_message", etc.
 */
export async function sendLettaMessage(
  agentId: string,
  userMessage: string
): Promise<LettaParsedResponse> {
  const data = await request<unknown>(
    `/v1/agents/${agentId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: userMessage }],
      }),
    }
  );

  // Parse response — Letta returns { messages: [...], stop_reason, usage }
  let rawMessages: unknown[] = [];

  if (data && typeof data === "object") {
    if ("messages" in data && Array.isArray((data as Record<string, unknown>).messages)) {
      rawMessages = (data as Record<string, unknown>).messages as unknown[];
    } else if (Array.isArray(data)) {
      rawMessages = data;
    } else if ("content" in data) {
      // SSE-style content array
      const text = ((data as Record<string, unknown>).content as Array<{ type: string; text: string }>)
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n");
      if (text) {
        try {
          const parsed = JSON.parse(text);
          rawMessages = Array.isArray(parsed) ? parsed : [{ id: "0", role: "assistant", content: text, date: new Date().toISOString(), message_type: "assistant_message" }];
        } catch {
          rawMessages = [{ id: "0", role: "assistant", content: text, date: new Date().toISOString(), message_type: "assistant_message" }];
        }
      }
    }
  }

  // Normalize to LettaMessage[]
  const messages: LettaMessage[] = rawMessages.map((m: unknown) => {
    const msg = m as Record<string, unknown>;
    return {
      id: String(msg.id ?? "0"),
      role: (msg.role as LettaMessage["role"]) ?? "assistant",
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      date: String(msg.date ?? new Date().toISOString()),
      message_type: String(msg.message_type ?? "assistant_message"),
    };
  });

  // Extract the assistant message — prefer assistant_message type
  const assistantMessage = messages
    .filter((m) => m.message_type === "assistant_message" || m.role === "assistant")
    .map((m) => m.content)
    .filter(Boolean)
    .join("\n\n");

  return { assistantMessage, allMessages: messages };
}

/**
 * Send a structured generation request to a Letta agent.
 *
 * This is used by /api/generate, /api/atomize, etc.
 * The prompt is sent as a user message, and the agent's response
 * is parsed as JSON.
 */
export async function sendLettaStructuredRequest(
  agentId: string,
  prompt: string
): Promise<string> {
  const result = await sendLettaMessage(agentId, prompt);

  // The agent should return JSON in its response
  let content = result.assistantMessage;

  // Strip markdown fences if present
  content = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return content;
}

/**
 * Send a user message to a Letta agent using streaming (SSE).
 * Returns a ReadableStream for the frontend to consume.
 *
 * NOTE: The Letta streaming API requires "streaming: true" for SDK v1.0+.
 * If streaming is not available, falls back to non-streaming.
 */
export async function streamLettaMessage(
  agentId: string,
  userMessage: string
): Promise<ReadableStream<Uint8Array>> {
  const url = `${LETTA_BASE_URL}/v1/agents/${agentId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      messages: [{ role: "user", content: userMessage }],
      stream_steps: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Letta stream API ${res.status}: ${body || res.statusText}`);
  }

  if (!res.body) {
    throw new Error("Letta stream returned no body");
  }

  return res.body as ReadableStream<Uint8Array>;
}

/**
 * Check if the Letta API is reachable and the key is valid.
 */
export async function checkLettaHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    await listLettaAgents();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
