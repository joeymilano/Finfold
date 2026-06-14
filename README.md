# Finfold

[中文说明](./README.zh-CN.md)

Finfold is an AI content workspace for founders, indie builders, and lean growth teams that need to turn one product update into platform-native marketing assets.

Instead of asking users to manually rewrite the same launch note for every channel, Finfold combines product context, brand memory, channel rules, and an AI agent workflow so a small team can move from "what happened in the product" to "what should we publish next" faster.

## Current Product Scope

Finfold is focused on the solo or small-team creation loop:

1. Understand the current growth context from the dashboard.
2. Save brand memory and brand rules once.
3. Generate drafts in the Workbench.
4. Ask the AI Agent what to create next.
5. Review saved content history in the content library.
6. Manage subscription and usage from Billing.

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

### Content Library

The content library is intentionally simple. It shows saved content history and keeps generated kits easy to find without adding team-review concepts too early.

### Billing

Billing supports paid plans, usage limits, and subscription state. Creem is used for checkout and webhook handling.

## Architecture

Finfold is a Next.js application designed for Cloudflare Pages.

```text
User Interface
  Next.js App Router + React + Tailwind

Backend Routes
  Next.js route handlers running on the Edge runtime

Data Layer
  Supabase Auth, Postgres, Row Level Security, Storage-ready user profiles

AI Layer
  Letta user agents for memory and model orchestration
  Optional OpenAI-compatible fallback for local or backup generation

Payments
  Creem checkout, subscription webhooks, plan limits, entitlement checks

Deployment
  Cloudflare Pages via @cloudflare/next-on-pages and Wrangler
```

## Main Routes

| Route | Purpose |
| --- | --- |
| `/dashboard` | Growth dashboard and next-action overview |
| `/workbench` | Main content creation workspace |
| `/packages` | Saved content history |
| `/brand-memory` | Brand memory setup and persistence |
| `/guardrails` | Brand rules and prohibited wording |
| `/agents` | Letta-backed AI Assistant chat |
| `/billing` | Subscription plans, usage, and checkout |
| `/settings` | Account, language, avatar, and preferences |

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
- Cloudflare Pages
- Wrangler

## Environment Variables

Create `.env.local` from `.env.example`.

```bash
cp .env.example .env.local
```

Required for a full hosted experience:

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Public app URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service role key |
| `LETTA_API_URL` | Letta API URL, usually `https://api.letta.com` |
| `LETTA_API_KEY` | Server-only Letta API key |
| `LETTA_MODEL` | Model used by Letta agents |
| `LETTA_EMBEDDING` | Embedding model used by Letta |
| `CREEM_API_KEY` | Creem API key |
| `CREEM_WEBHOOK_SECRET` | Creem webhook verification secret |
| `CREEM_*_PRODUCT_ID` | Product IDs for paid plans |
| `NEXT_PUBLIC_ALLOW_MOCK` | Keep `false` in production |

Optional direct generation fallback:

| Variable | Description |
| --- | --- |
| `LLM_API_BASE` | OpenAI-compatible chat completions endpoint |
| `LLM_API_KEY` | Server-only model API key |
| `LLM_MODEL` | Direct fallback model name |

The preferred production path is Letta. Direct LLM variables are only needed if you want the app to fall back to an OpenAI-compatible provider when Letta is unavailable.

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
2. Run `supabase/schema.sql` in the Supabase SQL Editor.
3. Apply any migrations in `supabase/migrations` if you are upgrading an existing database.
4. Add the Supabase URL, publishable key, and service-role key to `.env.local`.

Set up Letta:

1. Create a Letta API key.
2. Add `LETTA_API_KEY`, `LETTA_API_URL`, `LETTA_MODEL`, and `LETTA_EMBEDDING`.
3. Sign in to Finfold and open `/agents` or generate content from `/workbench`.
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

## Cloudflare Pages Deployment

Finfold is configured for Cloudflare Pages with `next-on-pages`.

Recommended build settings:

| Setting | Value |
| --- | --- |
| Build command | `npm run build:cf` |
| Output directory | `.vercel/output/static` |
| Root directory | `/` |

The repository includes `wrangler.toml` with:

```toml
pages_build_output_dir = ".vercel/output/static"
compatibility_flags = ["nodejs_compat"]
```

Preview locally:

```bash
npm run preview
```

Deploy with Wrangler:

```bash
npm run deploy
```

## Product Principles

- Keep the first-run experience simple.
- Make Brand Memory the durable product moat.
- Avoid generic AI copy.
- Keep generated content editable and inspectable.
- Do not hide configuration failures behind fake output.
- Prioritize individual creator workflows before adding team collaboration.

## Repository Notes

This repository is a product prototype and competition submission. It is intended to show a realistic path from AI-assisted content creation to a production-ready SaaS foundation, including auth, persistence, payments, agent memory, deployment, and validation.

## License

This project is provided as a prototype and competition submission. Add a formal license before using it in production or redistributing it commercially.
