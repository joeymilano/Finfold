# Production observability

Finfold now emits one searchable correlation chain across HTTP requests,
durable generation runs, provider attempts, and model calls.

## Cloudflare collection

Both the main web Worker and the scheduled poller enable:

- Workers Logs at 100% head sampling
- invocation logs
- automatic traces at 5% head sampling

The initial traffic level fits the Workers Free daily observability allowance.
Sampling must be reviewed before traffic materially increases.

## Correlation fields

Every structured product/AI log uses flat fields so Cloudflare can index them:

- `request_id`: generation idempotency key where applicable
- `trace_id`: durable generation trace identifier
- `generation_run_id`: persisted run identifier
- `user_id`: internal Supabase user identifier
- `http_request_id`: middleware request identifier

Middleware validates or creates `x-request-id`, forwards it into route handlers,
and returns the same value to the client.

`workspace_id` is intentionally absent until the workspace/tenant data model is
implemented. It must not be synthesized from `user_id`.

## Generation events

- `generation_started`
- `generation_duplicate_request`
- `generation_completed`
- `generation_failed`
- `ai_route_fallback`
- `ai_provider_attempt`
- `ai_vision_fallback`
- `ai_model_request_completed`
- `ai_model_request_failed`

Model events include provider, model, prompt version, latency, attempt number,
fallback state, token counts, normalized failure type, and HTTP status where
available. Structured logs never include prompts, generated content, provider
keys, or raw provider error bodies.

## Cost configuration

Costs are not guessed. Set `LLM_PRICING_USD_PER_1M` as deployment configuration
using provider/model prices in USD per million tokens:

```json
{
  "provider:model": {
    "input": 0.15,
    "output": 0.6
  }
}
```

If the provider omits token usage or no matching price is configured,
`estimated_cost_usd` remains `null`.

## Data retention and privacy

Logs contain operational identifiers and metrics only. Source text, prompts,
model output, email, remote URL path/query, authorization headers, and payment
payloads are excluded.
