# Finfold

[中文说明](./README.zh-CN.md)

[![CI](https://github.com/joeymilano/finfold/actions/workflows/ci.yml/badge.svg)](https://github.com/joeymilano/finfold/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](./LICENSE)

Finfold is an AI growth operator for founders, indie builders, and lean growth teams: it watches the growth loop — surfacing content opportunities, preparing platform-native drafts, answering comments in the browser through the Chrome extension, and recording what each action actually brought back (clicks, leads, signups, revenue).

Instead of asking users to manually rewrite the same launch note for every channel and then lose the results in spreadsheets, Finfold combines product context, brand memory, channel rules, growth missions, and an AI agent workflow so a small team can move from "what happened in the product" to "what should we do next" — with every consequential action confirmed by a human.

This repository contains the whole product: the Next.js application, the Chrome extension ([`apps/chrome-extension`](./apps/chrome-extension)), the WeChat mini program ([`apps/weapp`](./apps/weapp)), the WorkBuddy skill package ([`apps/workbuddy-skill`](./apps/workbuddy-skill)), and the Supabase schema (125 ordered migrations). Every credential is supplied through environment variables — no API key is committed anywhere in this repository.

## Current Product Scope

Finfold is focused on one operator-style growth loop for solo users and small teams:

1. Understand the current growth context from the dashboard and operating objectives.
2. Save brand memory and brand rules once.
3. Let the agent surface opportunities and draft growth missions for review.
4. Generate platform drafts in the Workbench and publish them with the Chrome extension.
5. Track outcomes through tracking links, native lead capture, and outcome webhooks.
6. Review saved content and results in the content library.
7. Manage subscription and usage from Billing.

Team approval, editorial scheduling, and multi-person review workflows are intentionally not part of the primary surface right now. They can be added later, but the current experience keeps the first user journey lightweight.

## Core Features

### Dashboard

The dashboard highlights the few signals a cross-border marketing user cares about most:

- Which channels are growing.
- Which channels need more content.
- What should be created next.
- Where brand memory or the AI Agent can help.

### Workbench

The Workbench is the main creation surface. Users enter a product update, select a goal and target platforms, optionally attach media context, and generate channel-specific drafts.

Generated outputs include:

- Platform-specific title and body copy.
- CTA suggestions.
- Strategy notes.
- Brand and quality scoring.
- Editable draft states.

### Brand Memory

Brand Memory stores the context that makes AI output feel specific to the user:

- Brand or product name.
- Product description.
- Target audience.
- Tone keywords.
- Approved examples.
- Banned phrases.
- Competitor and positioning notes.

This is the core product advantage: the platform becomes more useful as users save more of their own brand context.

### Brand Rules

Brand Rules add a stricter layer for quality control:

- Prohibited phrases.
- Voice and CTA constraints.
- Channel-specific guidance.
- Safety and moderation hints.

These rules are injected into generation and scoring so output stays closer to the user's real brand.

### AI Agent

Finfold includes a conversational AI Assistant backed by Letta. The Agent can help users decide:

- Which platform to create for next.
- How to reuse Brand Memory.
- What content gaps matter most.
- How to turn a product note into a creation brief.

Letta manages the agent memory and model orchestration. Finfold stores each user's Letta agent mapping and routes chat or structured generation requests through the backend.

### Finfold for Agents (MCP)

Finfold can also be called by Claude, GPT, or a custom agent over a remote,
streamable-HTTP MCP server. Each user creates a revocable token from **AI
Agent → Agent Access**. The MCP server resolves Brand Memory, Brand Rules, and
industry packs on the server, so an agent never needs a Finfold password or a
copy of the user's private brand configuration.

Available tools:

- `finfold_get_brand_context` — Brand Memory, guardrails, and enabled packs.
- `finfold_get_platform_rules` — native channel constraints and anti-patterns.
- `finfold_generate_content` — generates and saves a content kit, consuming
  the same workspace allowance as the Finfold app.

Setup instructions are available at `/for-agents`; the remote MCP endpoint is
`https://www.finfold.app/api/mcp`.

### Content Library

The content library is intentionally simple. It shows saved content history and keeps generated kits easy to find without adding team-review concepts too early.

### Billing

Billing supports paid plans, usage limits, and subscription state. Creem is used for checkout and webhook handling.

## Architecture

Finfold is a Next.js application deployed to Cloudflare Workers through the
OpenNext adapter.

```text
User Interface
  Next.js App Router + React + Tailwind

Backend Routes
  Next.js route handlers running in the Workers Node.js compatibility runtime

Durable Generation
  Postgres transactional outbox + Cloudflare Queues consumer in finfold-app
  Database leases, per-attempt audit, dead-letter handling, and cron recovery

Data Layer
  Supabase Auth, Postgres, Row Level Security, Storage-ready user profiles

AI Layer
  Letta user agents for memory and model orchestration
  Optional OpenAI-compatible fallback for local or backup generation

Payments
  Creem checkout, subscription webhooks, plan limits, entitlement checks

Deployment
  Cloudflare Workers via @opennextjs/cloudflare and Wrangler
```

## Main Routes

| Route | Purpose |
| --- | --- |
| `/dashboard` | Finfold Agent workspace for conversational operations |
| `/workbench` | Main content creation workspace |
| `/operations/opportunities` | Opportunity radar: scored content opportunities with momentum signals |
| `/operations/x-pipeline` | X (Twitter) review-and-publish pipeline |
| `/operations/daily-pipeline` | Daily long-form and shareable card-pack pipeline |
| `/operations/xiaohongshu` | Xiaohongshu account diagnostics and posting coach |
| `/operations/account-health` | Cross-platform account health checks |
| `/operations/lead-tools` | Native lead capture tools |
| `/packages` | Saved content history |
| `/brand-memory` | Brand memory setup and persistence |
| `/guardrails` | Brand rules and prohibited wording |
| `/agents` | Legacy compatibility redirect to the Agent workspace |
| `/billing` | Subscription plans, usage, and checkout |
| `/settings` | Account, language, local devices, and preferences |

## API Surface

| API route | Purpose |
| --- | --- |
| `/api/generate` | Authenticated content kit generation with quota checks |
| `/api/trial/generate` | Trial generation flow |
| `/api/kits` | Saved kit retrieval |
| `/api/brand-brain` | Brand Memory load and save |
| `/api/letta/agent` | Get, create, or reset the user's Letta agent |
| `/api/letta/chat` | Chat with the user's Letta agent |
| `/api/checkout` | Start Creem checkout |
| `/api/webhooks/creem` | Process Creem subscription lifecycle events |
| `/api/entitlements/check` | Read current plan and usage entitlement |
| `/api/settings/locale` | Persist language preference |
| `/api/mcp` | Remote MCP endpoint for agent calls (Bearer token required) |
| `/api/mcp/tokens` | Create/list a user's revocable MCP tokens |
| `/api/integrations/missionget/v1/chat/completions` | HMAC-signed, stateless MissionGet partner webhook |
| `/api/weapp/v1/*` | WeChat mini program API: session, profile, opportunities, drafts (shared-secret bridge) |

## Data Model

The Supabase schema includes:

- `profiles` - account profile, plan, monthly limit, locale, and subscription metadata.
- `content_kits` - generated kit metadata and source brief.
- `kit_outputs` - per-platform generated outputs.
- `brand_brains` - Brand Memory fields.
- `subscriptions` - Creem subscription state.
- `usage_events` - generation and product usage events.
- `performance_metrics` - future-ready metrics for generated content.
- `user_agents` - Supabase user to Letta agent mapping.

Row Level Security is enabled so users can only read and mutate their own data. Service-role access is kept inside backend API routes.

## Tech Stack

- Next.js 15 with App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase Auth and Postgres
- Letta AI agents
- Creem payments
- Vitest
- Cloudflare Workers (via OpenNext)
- Wrangler

## Environment Variables

Create `.env.local` from `.env.example`.

```bash
cp .env.example .env.local
```

Minimal set to run locally (everything else is optional and fails closed — features simply stay off until their credentials are provided):

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service role key |
| `LETTA_API_KEY` **or** `LLM_API_KEY` | At least one generation provider |

Required for a full hosted experience:

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Public app URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service role key |
| `LINKEDIN_OAUTH_ENABLED` | Enables read-only Community Management company-Page discovery and post performance; keep `false` until official approval and a real Page test pass |
| `LINKEDIN_OAUTH_CLIENT_ID` / `LINKEDIN_OAUTH_CLIENT_SECRET` | Server-only LinkedIn OAuth credentials |
| `LINKEDIN_API_VERSION` | Pinned LinkedIn Marketing API version for organization and performance reads |
| `INSTAGRAM_OAUTH_ENABLED` | Enables read-only Instagram professional-account OAuth; keep `false` until Meta App Review and a real account test are complete |
| `INSTAGRAM_OAUTH_CLIENT_ID` / `INSTAGRAM_OAUTH_CLIENT_SECRET` | Server-only Business Login for Instagram credentials |
| `INSTAGRAM_GRAPH_API_VERSION` | Pinned Graph API version used for read-only account, media, and Insights requests |
| `WECHAT_COMPONENT_ENABLED` | Enables the approved WeChat Open Platform component; keep `false` until encrypted ticket callbacks and credentials are ready |
| `WECHAT_DRAFT_PUBLISHING_ENABLED` | Enables background image upload and draft synchronization only after migration 096 and a real authorized-account draft test pass |
| `WECHAT_FORMAL_PUBLISHING_ENABLED` | Enables one-confirmation scheduled formal submission; keep `false` until draft sync, publish callbacks, fixed-IP egress, and a single-account gray test pass |
| `WECHAT_COMPONENT_APP_ID` / `WECHAT_COMPONENT_APP_SECRET` | Server-only WeChat third-party component credentials |
| `WECHAT_COMPONENT_TOKEN` / `WECHAT_COMPONENT_ENCODING_AES_KEY` | Server-only signature and encrypted-event credentials for WeChat component callbacks |
| `GENERATION_WORKER_SECRET` | Server-only random secret authenticating same-Worker internal queue and cron requests |
| `MISSIONGET_WEBHOOK_SECRET` | Server-only HMAC secret for MissionGet's raw webhook body (minimum 32 characters) |
| `MISSIONGET_PARTNER_USER_ID` | Dedicated partner account UUID used only for MissionGet Credits settlement |
| `FOUNDER_EMAILS` | Comma-separated emails allowed to access the private `/founder` evidence dashboard |
| `RESEND_API_KEY` | Resend key used for founder welcome emails and authenticated in-app bug reports |
| `BUG_REPORT_NOTIFY_EMAIL` | Optional bug-report recipient; defaults to `joey@finfold.app` |
| `LETTA_API_URL` | Letta API URL, usually `https://api.letta.com` |
| `LETTA_API_KEY` | Server-only Letta API key |
| `LETTA_MODEL` | Model used by Letta agents |
| `LETTA_EMBEDDING` | Embedding model used by Letta |
| `CREEM_API_KEY` | Creem API key |
| `CREEM_WEBHOOK_SECRET` | Creem webhook verification secret |
| `CREEM_*_PRODUCT_ID` | Product IDs for paid plans |
| `CREEM_*_PAYMENT_LINK` | Optional hosted Creem payment links used when API checkout is unavailable |
| `NEXT_PUBLIC_ALLOW_MOCK` | Keep `false` in production |

Optional direct generation fallback:

| Variable | Description |
| --- | --- |
| `LLM_API_BASE` | OpenAI-compatible chat completions endpoint |
| `LLM_API_KEY` | Server-only model API key |
| `LLM_MODEL` | Direct fallback model name |
| `LLM_VISION_MODEL` | Optional multimodal model for OCR and screenshot analysis; falls back to `LLM_MODEL` when unset |
| `DASHSCOPE_FREE_API_KEY` | General Beijing key used first so Alibaba consumes per-model free quotas |
| `DASHSCOPE_API_KEY` | Workspace/Token Plan key used after free pools stop, and by Wan 2.7 |
| `IMAGE_DASHSCOPE_FREE_API_BASE` | General endpoint for the Qwen Image 3.0 free pools |
| `IMAGE_DASHSCOPE_API_BASE` | Alibaba Cloud workspace domain used by Wan image generation |
| `IMAGE_DASHSCOPE_MODEL` | Wan image model; production defaults to the rolling `wan2.7-image` alias |
| `MISSIONGET_MODEL_TIER` | Optional MissionGet generation tier: `haiku` (default), `sonnet`, or `opus` |

Production uses the ordered direct-provider chain configured by `LLM_PROVIDERS`: general-endpoint free pools first, then the purchased workspace route and cross-vendor fallbacks. Letta remains a final fallback for supported generation paths.

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Set up Supabase:

1. Create a Supabase project.
2. Run every file in `supabase/migrations` in order (000, 001, 002, 003, ...) in the Supabase SQL Editor. Migration 000 supplies the fresh-project core schema that older migrations assumed existed. Apply migrations in strict filename order without skipping — later migrations build on earlier ones.
3. Add the Supabase URL, publishable key, and service-role key to `.env.local`.

Set up Letta:

1. Create a Letta API key.
2. Add `LETTA_API_KEY`, `LETTA_API_URL`, `LETTA_MODEL`, and `LETTA_EMBEDDING`.
3. Sign in to Finfold and open `/dashboard` to diagnose, research, and create through the Agent conversation.
4. Finfold will create or reuse a per-user Letta agent automatically.

## Validation

```bash
npm run typecheck
npm test
npm run build
```

For Cloudflare output:

```bash
npm run build:cf
```

For the isolated staging Worker, use the staging-aware build command. It reads
the public values from `wrangler.staging.toml` and injects them during the Next
build; a plain `npm run build:cf` can incorrectly pre-render authenticated
routes when those build-time values are absent.

```bash
npm run build:cf:staging
```

## Cloudflare Workers Deployment

Finfold is configured for Cloudflare Workers with the supported OpenNext
adapter.

Recommended build settings:

| Setting | Value |
| --- | --- |
| Build command | `npm run build:cf` |
| Deploy command | `npm run deploy` |
| Worker entry | `worker.ts` (delegates HTTP fetch to `.open-next/worker.js`) |

The repository includes `wrangler.toml` with:

```toml
main = "worker.ts"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".open-next/assets"
binding = "ASSETS"

[[queues.producers]]
binding = "GENERATION_QUEUE"
queue = "finfold-generation-jobs"
```

Preview locally:

```bash
npm run preview
```

Deploy with Wrangler:

```bash
npm run deploy
```

The staging deploy is intentionally fail-closed until every staging-only secret
passes the remote configuration gate:

```bash
npm run deploy:staging
```

## Product Principles

- Keep the first-run experience simple.
- Make Brand Memory the durable product moat.
- Avoid generic AI copy.
- Keep generated content editable and inspectable.
- Do not hide configuration failures behind fake output.
- Prioritize individual creator workflows before adding team collaboration.

## Tenancy

Finfold 1.0 uses a single-user tenant model: one authenticated Supabase user is
one tenant. The product does not currently offer member invitations, team
roles, shared Brand Memory editing, or shared billing ownership. See
[ADR-001](docs/architecture/adr-001-single-user-tenancy.md) for the ownership
rules that apply to browser APIs using the Supabase service-role client.

## Founder evidence dashboard

Set `FOUNDER_EMAILS` to one or more comma-separated account emails, deploy
migrations `030_output_feedback.sql` and `031_activation_code_audit.sql`, then
open `/founder` while signed in with an allowed account. The page aggregates
real product rows into the seed-user funnel, cohort activation, paid
conversion, feedback quality, and the treatment/control performance-backflow
experiment. It can also generate auditable single-use seed-cohort codes and
track each batch from invitation through redemption, activation, publishing,
and measurement. A date-stamped evidence brief is available for applications
and progress updates.

The route is server-authorized and deliberately absent from normal customer
navigation. Do not expose `FOUNDER_EMAILS` as a `NEXT_PUBLIC_` variable.

## Repository Notes

This repository contains the complete Finfold product source: the Next.js application, the Chrome extension (`apps/chrome-extension`), the WeChat mini program (`apps/weapp`), the WorkBuddy skill package (`apps/workbuddy-skill`), and the Supabase schema. All third-party credentials (Supabase, Letta, LLM providers, Creem, Resend, WeChat, Turnstile, and friends) are supplied through environment variables or Worker secrets; no API key is committed to this repository, and configuration failures surface as errors instead of fake output.

One exception: the Finfold Local Mac client for the local device bridge is not open-sourced yet. The server-side protocol in `supabase/functions/local-bridge` (task claim, idempotent result reporting, heartbeat, stale-claim self-healing) and the settings UI are included as a protocol reference implementation.

## License

Released under the [Apache License 2.0](./LICENSE). Copyright 2026 Finfold (上海光有序科技有限公司).
