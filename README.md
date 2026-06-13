# Finfold

Finfold is an AI content operations workspace for small teams that need to turn one product signal into platform-native growth assets.

It helps founders and operators transform product updates, launch notes, market insights, and customer proof into reusable content kits for social, community, search, newsletter, and launch channels.

## What It Does

- Generates platform-native content kits from one source brief
- Adapts tone, structure, CTA, and risk notes per channel
- Supports brand memory, custom guardrails, and quality scoring
- Tracks usage plans, entitlements, and upgrade gates
- Includes Supabase persistence, Creem checkout hooks, and OpenAI-compatible model configuration

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Supabase
- Vitest
- Cloudflare Pages support

## Local Development

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example`, then configure Supabase, payment, analytics, and model credentials as needed.

## Validation

```bash
npm run typecheck
npm test
npm run build
```

## License

This repository is provided as a product prototype and competition submission.
