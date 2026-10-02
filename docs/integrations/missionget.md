# MissionGet × Finfold integration

## Integration shape

MissionGet calls a dedicated Finfold webhook using its **OpenAI-compatible
(chat completions)** format:

`POST https://www.finfold.app/api/integrations/missionget/v1/chat/completions`

This adapter is intentionally separate from `/api/mcp`:

- MissionGet sends chat-completions JSON; `/api/mcp` speaks MCP JSON-RPC.
- MissionGet authenticates with a raw-body HMAC signature, not a user's MCP
  Bearer token.
- Partner prompts are stateless. They do not read, mutate, or save any user's
  Brand Memory, content kits, Letta memory, or publishing connections.
- Finfold bills a dedicated partner account's Credits without treating that
  account as content context.

## MissionGet form values

| Field | Value |
| --- | --- |
| Name | `Finfold 多平台内容生成器` |
| Intro | `把产品介绍、活动信息或创作想法，改写成小红书、公众号、LinkedIn、X 等平台原生内容。支持中文、英文和双语。` |
| Category | `营销` |
| Mode | `外部 Agent（Webhook）` |
| Webhook URL | `https://www.finfold.app/api/integrations/missionget/v1/chat/completions` |
| Format | `OpenAI 兼容 (chat completions)` |
| Signing secret | The same random value deployed as `MISSIONGET_WEBHOOK_SECRET` |
| Price | `0` for the partner launch pilot; revisit after latency and completion-rate evidence |

Suggested System Prompt for the marketplace listing:

```text
你是 Finfold 的多平台内容策略 Agent。把用户提供的产品介绍、活动信息或创作想法，转化成适合指定社交平台的原生内容草稿。用户可以指定小红书、公众号、朋友圈、LinkedIn、X、Reddit、Product Hunt 等平台；未指定时，根据语言选择默认平台。内容要具体、自然、可直接编辑使用，不编造数据、客户评价、价格或产品能力，也不要声称内容已经保存或发布。
```

The server does not trust or execute MissionGet's System Prompt as privileged
instructions. Only `user` messages become the content brief; all safety and
generation rules are owned by Finfold server code.

## Runtime configuration

Create a dedicated Finfold/Supabase partner account with a `profiles` row and
an adequate AI Credits balance. Do not reuse Joey's or a customer's user ID.
Then deploy these server-only values to both staging and production:

```bash
npx wrangler secret put MISSIONGET_WEBHOOK_SECRET --config wrangler.staging.toml
npx wrangler secret put MISSIONGET_PARTNER_USER_ID --config wrangler.staging.toml
npx wrangler secret put MISSIONGET_WEBHOOK_SECRET --config wrangler.toml
npx wrangler secret put MISSIONGET_PARTNER_USER_ID --config wrangler.toml
```

`MISSIONGET_WEBHOOK_SECRET` must be at least 32 random characters.
`MISSIONGET_PARTNER_USER_ID` must be the dedicated account's UUID.
`MISSIONGET_MODEL_TIER` is optional and may be `haiku` (default), `sonnet`, or
`opus`. Partner traffic requires a direct OpenAI-compatible provider; it never
falls back to a persistent Letta agent.

## Request contract

MissionGet must sign the exact raw request bytes with HMAC-SHA256 and send the
digest in `X-MissionGet-Signature`. The adapter accepts hex, `sha256=<hex>`, or
Base64 encoding. It accepts string content or OpenAI text content parts.

```json
{
  "model": "finfold",
  "messages": [
    {
      "role": "user",
      "content": "为一款面向独立开发者的内容工具写小红书和 LinkedIn 发布内容，中文和英文各一版。"
    }
  ],
  "stream": false,
  "request_id": "missionget-invocation-unique-id"
}
```

The combined user content must be 20–8,000 characters. Streaming and image
parts are not supported in V1. For reliable idempotency, MissionGet should send
a stable unique value in `X-MissionGet-Request-Id`, `X-Request-Id`,
`request_id`, `id`, or `metadata.invocation_id` and reuse it only when retrying
the same invocation.

The response is a standard non-streaming chat completion. The assistant's
`content` contains labelled drafts for every generated platform. Finfold does
not report fabricated token usage.

## Launch checklist

1. Ask MissionGet to confirm its exact request JSON, signature encoding,
   stable invocation-ID field, retry behavior, and webhook timeout (Finfold
   needs up to 60 seconds).
2. Create and fund the dedicated partner account.
3. Configure staging secrets and run a signed end-to-end call.
4. Confirm Chinese, English, explicit-platform, duplicate-request, invalid
   signature, timeout, and insufficient-Credits behavior.
5. Configure production secrets, deploy, and publish the marketplace listing.
6. Review completion rate, P95 latency, provider errors, Credit spend, and
   MissionGet conversion before changing the pilot price.
