import { NextResponse } from "next/server";
import { resolveLLMProviders } from "@/lib/llm-providers";
import { directLLMModelForTier } from "@/lib/llm";
import type { ModelTier } from "@/lib/payment/types";

// TEMP diagnostic: returns resolved LLM provider chain + per-tier model names,
// AND pings the primary provider's flash model to verify it actually responds.
// Does NOT expose API keys.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function pingProvider(apiBase: string, apiKey: string, model: string) {
  const startedAt = Date.now();
  try {
    const res = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        temperature: 0.7,
        messages: [{ role: "user", content: "Reply with the single word: ok" }]
      }),
      signal: AbortSignal.timeout(45_000)
    });
    const elapsedMs = Date.now() - startedAt;
    const text = await res.text().catch(() => "");
    let snippet = "";
    let content = "";
    try {
      const data = JSON.parse(text);
      content = data?.choices?.[0]?.message?.content ?? "";
      snippet = JSON.stringify(data?.error ?? data?.choices?.[0] ?? {}).slice(0, 200);
    } catch {
      snippet = text.slice(0, 200);
    }
    return { ok: res.ok, status: res.status, elapsedMs, content, snippet };
  } catch (err: unknown) {
    return {
      ok: false,
      status: null,
      elapsedMs: Date.now() - startedAt,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    };
  }
}

export async function GET() {
  const providers = resolveLLMProviders().map((p) => ({
    name: p.name,
    apiBase: p.apiBase,
    hasKey: Boolean(p.apiKey),
    models: p.models,
    visionModel: p.visionModel,
    jsonMode: p.jsonMode
  }));

  const perTier = (["haiku", "sonnet", "opus"] as ModelTier[]).map((tier) => ({
    tier,
    model: directLLMModelForTier(tier)
  }));

  // Live-ping the primary provider's flash (haiku) model.
  const primary = resolveLLMProviders()[0];
  const ping = primary?.apiKey
    ? await pingProvider(primary.apiBase, primary.apiKey, primary.models.haiku)
    : { error: "no primary provider key" };

  return NextResponse.json({
    perTier,
    primaryProvider: primary ? { name: primary.name, model: primary.models.haiku } : null,
    ping,
    resolvedProviders: providers
  });
}
