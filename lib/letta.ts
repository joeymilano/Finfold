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
 */

// IMPORTANT: read env lazily, NOT at module scope.
// In the Cloudflare Workers / edge runtime, secrets are bound per-request and
// are NOT available when this module is first evaluated. Capturing them in
// module-level consts yields empty strings (which made isLettaConfigured()
// return false at runtime). Always read process.env inside functions.
const lettaBaseUrl  = () => process.env.LETTA_API_URL   ?? "https://api.letta.com";
const lettaApiKey   = () => process.env.LETTA_API_KEY   ?? "";
const lettaModel    = () => process.env.LETTA_MODEL     ?? "openai/gpt-4o-mini";
const lettaEmbedding = () => process.env.LETTA_EMBEDDING ?? "openai/text-embedding-3-small";

/**
 * Model used specifically for structured multi-platform generation, where
 * stronger JSON adherence matters. Falls back to the agent's base model.
 * Set LETTA_GENERATION_MODEL to a valid Letta handle (see GET /v1/models).
 */
export const lettaGenerationModel = () =>
  process.env.LETTA_GENERATION_MODEL ?? lettaModel();

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
  return Boolean(lettaApiKey());
}

// ─── Helpers ─────────────────────────────────────────────────────────

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${lettaApiKey()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${lettaBaseUrl()}${path}`;
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
 */
export async function getLettaAgent(agentId: string): Promise<LettaAgent> {
  return request<LettaAgent>(`/v1/agents/${agentId}`);
}

/**
 * Create a new Letta agent for a Finfold user.
 *
 * The agent is given a persona that matches Finfold's brand content
 * creation use-case, plus a human block that identifies the user.
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
    model: lettaModel(),
    embedding: lettaEmbedding(),
    memory_blocks: memoryBlocks,
  };

  return request<LettaAgent>("/v1/agents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Delete a Letta agent.
 */
export async function deleteLettaAgent(agentId: string): Promise<void> {
  await request<void>(`/v1/agents/${agentId}`, { method: "DELETE" });
}

// ─── Shared generator agent (trial + fallback) ───────────────────────

/**
 * A single shared agent used for generation when no per-user agent is
 * available — e.g. anonymous trial users, or as a backstop when the
 * per-user agent could not be resolved.
 *
 * Letta has NO agent-less chat-completions endpoint, so every generation
 * MUST target a real agent. This guarantees one always exists.
 */
const SHARED_AGENT_NAME = "finfold-shared-generator";
let sharedAgentIdCache: string | null = null;

export async function getSharedLettaAgentId(): Promise<string | null> {
  if (!isLettaConfigured()) {
    return null;
  }

  if (sharedAgentIdCache) {
    return sharedAgentIdCache;
  }

  try {
    // Reuse an existing shared agent if one is already on the account.
    const existing = await request<LettaAgent[]>(
      `/v1/agents?name=${encodeURIComponent(SHARED_AGENT_NAME)}&limit=1`
    ).catch(() => [] as LettaAgent[]);

    const match = Array.isArray(existing)
      ? existing.find((agent) => agent.name === SHARED_AGENT_NAME)
      : undefined;

    if (match) {
      sharedAgentIdCache = match.id;
      return match.id;
    }

    const created = await createSharedLettaAgent();
    sharedAgentIdCache = created.id;
    return created.id;
  } catch {
    return null;
  }
}

async function createSharedLettaAgent(): Promise<LettaAgent> {
  const memoryBlocks: LettaMemoryBlock[] = [
    {
      label: "persona",
      value: [
        "You are Finfold AI, a senior growth strategist and content creation assistant.",
        "You deeply understand each social media platform's algorithm and culture.",
        "Your job is NOT to write generic AI copy — it is to produce content that earns real attention, trust, and action on each specific platform.",
        "When asked to generate structured content, you MUST return strict JSON matching the requested schema — no markdown fences, no commentary outside the JSON.",
        "You always follow anti-AI-flavor rules: no generic phrases, no passive voice, no filler.",
      ].join("\n"),
    },
    {
      label: "human",
      value: "This is a shared Finfold agent used for trial and fallback content generation.",
    },
  ];

  const body: Record<string, unknown> = {
    name: SHARED_AGENT_NAME,
    description: "Finfold shared generator agent (trial + fallback).",
    model: lettaModel(),
    embedding: lettaEmbedding(),
    memory_blocks: memoryBlocks,
  };

  return request<LettaAgent>("/v1/agents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Messaging ───────────────────────────────────────────────────────

/**
 * Send a user message to a Letta agent and return the parsed response.
 *
 * `overrideModel` pins a specific model handle for this single request
 * (without recreating the agent) — useful for structured generation where
 * a stronger model returns more reliable JSON.
 */
export async function sendLettaMessage(
  agentId: string,
  userMessage: string,
  overrideModel?: string
): Promise<LettaParsedResponse> {
  const payload: Record<string, unknown> = {
    messages: [{ role: "user", content: userMessage }],
  };
  if (overrideModel) {
    payload.override_model = overrideModel;
  }

  const data = await request<unknown>(
    `/v1/agents/${agentId}/messages`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );

  // Parse response — Letta returns { messages: [...], stop_reason, usage }
  // but may also return a plain array or content array in some versions
  let rawMessages: unknown[] = [];

  if (data && typeof data === "object") {
    if ("messages" in data && Array.isArray((data as Record<string, unknown>).messages)) {
      // Standard Letta response: { messages: [...], stop_reason, usage }
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

  // Extract the assistant message
  const assistantMessage = messages
    .filter((m) => m.role === "assistant" || m.message_type === "assistant_message")
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
  prompt: string,
  overrideModel?: string
): Promise<string> {
  const result = await sendLettaMessage(agentId, prompt, overrideModel);

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
 */
export async function streamLettaMessage(
  agentId: string,
  userMessage: string
): Promise<ReadableStream<Uint8Array>> {
  const url = `${lettaBaseUrl()}/v1/agents/${agentId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      messages: [{ role: "user", content: userMessage }],
      stream_tokens: true,
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
