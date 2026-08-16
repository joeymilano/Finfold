# Finfold — Your First AI Marketing Employee

> **GOAI 世界人工智能开源大赛 · 无界应用 Boundless Agents 赛道参赛作品**
>
> One product signal in → platform-native content out → real performance back → smarter next round.
>
> 一个产品信号进入 → 生成多平台原生内容 → 真实表现回流 → 驱动下一轮更聪明的生成。

[![Live Demo](https://img.shields.io/badge/Live_Demo-finfold.app-8fce00)](https://www.finfold.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**中文说明见下方 / Chinese below · English first**

---

## English

### The Problem

Solo founders and lean teams ship product updates constantly — but turning *one update* into platform-native posts for RED (小红书), X, LinkedIn, Reddit, Instagram and more means rewriting the same story again and again, with no feedback loop from what actually performed.

Generic chatbots generate *a* post. They don't remember your brand, don't follow each platform's native format, don't track what happened after publishing, and never learn from it.

### What Finfold Does

Finfold is an AI content workspace that closes the full growth loop for one-person and small growth teams:

```
product signal ──▶ agent workflow ──▶ 13 platform-native drafts
      ▲                                        │
      │                                        ▼
private rules ◀── performance ◀── publish & track
```

1. **Workbench** — enter one product update; get platform-native titles, body copy, CTAs and strategy notes for every selected channel, with brand & quality scoring.
2. **Brand Memory** — brand positioning, audience, tone keywords, approved examples and banned phrases make output *yours*, and it compounds with use.
3. **AI Agent** — a conversational agent (backed by [Letta](https://letta.com)) that can decide what to create next, reuse brand context, and call product tools.
4. **Performance Loop** — published content reports back; explicit user feedback and edit diffs feed the next generation round as private rules.

### Agent Architecture (task loop)

| Stage | How it works |
| --- | --- |
| Task understanding | A product update / growth goal is parsed into a creation brief |
| Orchestration | Agent workflow maps the brief to per-platform generation tasks |
| Knowledge augmentation | Brand Memory + Brand Rules are injected as grounding context |
| Tool calling | Generation, image, and content-iteration tools behind typed API routes |
| Result delivery | Editable drafts, quality scoring, export & publish-status tracking |
| Learning | User edits, ratings and (optional) performance data refine the next round — per-user, private |

### Tech Stack

- **Framework**: Next.js (App Router) + TypeScript + Tailwind CSS
- **Agent / memory**: Letta (agent memory & orchestration)
- **Backend / DB / Auth**: Supabase (Postgres, RLS, storage), deployed on Cloudflare (OpenNext)
- **Payments** (live product only): Creem checkout & webhooks
- **Models**: commercial LLM APIs via a provider-agnostic layer — see *Open-source boundary* below

### Open-Source Boundary

This repository contains the **competition release** of Finfold:

- ✅ Included: application UI, agent workflow surface, platform adaptation layer, brand memory model, API route contracts, local-run setup, tests for included modules.
- 🔒 Not included (kept private): full production database migrations, internal analytics & founder dashboards, payment operations tooling, and unreleased features under active development.
- 💬 Commercial APIs are used for LLM generation and agent memory; all such calls sit behind provider-agnostic interfaces, with keys supplied via environment variables. No proprietary model weights are required to run the demo.

### Quick Start

```bash
git clone https://github.com/joeymilano/Finfold.git
cd Finfold
npm install
cp .env.example .env.local   # fill in your own keys (LLM API key is the only required one)
npm run dev                  # http://localhost:3000
```

Live product (no setup): **<https://www.finfold.app>**

### Repository Layout

```
app/           # pages + API routes (workbench, agents, brand memory, generation)
components/    # UI: workbench, app shell, visual components
lib/           # platform rules, brand brain, content pipeline, agent data
hooks/         # client hooks (i18n, locale)
test/          # unit tests for included modules
docs/          # asset licenses & notes
```

### Safety & Compliance

- No scraping of private accounts; content generation is grounded in user-provided context.
- Per-user data isolation (row-level security in the live product).
- Guardrails: banned phrases, safety hints, and human review before anything is published.

### License

Code in this repository is released under the [MIT License](./LICENSE). Third-party assets are listed in [`docs/asset-licenses.md`](./docs/asset-licenses.md).

---

## 中文说明

### 解决什么问题

独立开发者和小团队不断发布产品更新，但要把*一次更新*变成小红书、X、LinkedIn、Reddit、Instagram 等各平台原生的内容，意味着反复改写同一个故事——而且发布之后没有任何反馈闭环。

通用聊天机器人能生成"一篇"内容，但不记得你的品牌、不懂各平台原生格式、不追踪发布后的真实表现、更不会从中学习。

### Finfold 做什么

Finfold 是一个 AI 内容工作台，把"产品信号 → 多平台原生内容 → 发布追踪 → 表现回流 → 私有规则"压缩成一条低门槛增长闭环：

- **Workbench 工作台**：输入一次产品更新，一次性获得所选平台的原生标题、正文、CTA 与策略建议，附带品牌与质量评分。
- **Brand Memory 品牌记忆**：定位、受众、语气关键词、优秀样例、禁用词——用得越多，输出越像"你"。
- **AI Agent**：由 Letta 驱动的对话式智能体，能决定下一步创作什么、复用品牌上下文、调用产品工具。
- **表现回流**：发布后的编辑差异与显性反馈进入私有规则，驱动下一轮生成。

### 参赛信息

- **赛事**：GOAI 世界人工智能开源大赛 · 无界应用 Boundless Agents 赛道
- **细分场景**：面向独立开发者与精简团队的跨境内容增长智能体（AI + 出海营销）
- **在线 Demo**：<https://www.finfold.app>

### 快速开始

```bash
git clone https://github.com/joeymilano/Finfold.git
cd Finfold
npm install
cp .env.example .env.local   # 填入你自己的密钥（仅需一个 LLM API Key）
npm run dev
```

### 安全与合规

- 不抓取私有账户数据；生成内容以用户提供的上下文为准。
- 线上产品按用户行级隔离（RLS）。
- 内置护栏：禁用词、安全提示，任何内容发布前均需人工确认。

### 许可证

本仓库代码以 [MIT License](./LICENSE) 开源，第三方素材见 [`docs/asset-licenses.md`](./docs/asset-licenses.md)。
