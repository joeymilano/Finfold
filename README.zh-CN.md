# Finfold

[English README](./README.md)

Finfold 是一个面向创始人、独立开发者和小型增长团队的 AI 内容工作台。它解决的问题很直接：把一次产品更新，快速转成适合不同平台发布的增长内容。

传统做法是把同一条产品信息反复改写、调整后发布到小红书、X/Twitter、LinkedIn、Product Hunt、Newsletter 等平台。Finfold 希望让这件事变成一个清晰流程：保存品牌记忆，设置品牌规则，进入创作台生成内容，再让 AI 助手帮助判断下一步该创作什么。

## 当前产品范围

Finfold 现在聚焦个人创作者和小团队的核心创作流程：

1. 在仪表盘里查看关键增长信号。
2. 保存品牌记忆和品牌规则。
3. 在创作台生成多平台内容草稿。
4. 让 AI 助手询问下一步该做什么。
5. 在内容库查看历史内容。
6. 在订阅页管理额度和计划。

多人审核、排期、审批、协作流暂时不放在主要界面里。当前版本优先让新用户快速理解产品价值，而不是一上来就遇到过多高阶功能。

## 核心功能

### 仪表盘

仪表盘只保留出海营销用户最关心的信息：

- 哪些平台正在增长。
- 哪些平台缺内容。
- 下一步应该创作什么。
- 什么时候应该使用品牌记忆或 AI 助手。

### 创作台

创作台是主要的产品入口。用户输入一条产品更新，选择目标和平台，可以补充图片、视频或活动素材上下文，然后生成每个平台专属的草稿。

生成结果包含：

- 平台专属的标题和正文。
- CTA 建议。
- 策略说明。
- 品牌与质量评分。
- 可继续编辑的草稿状态。

### 品牌记忆

品牌记忆用于保存每个用户自己的长期上下文：

- 品牌或产品名称。
- 产品介绍。
- 目标用户。
- 语气关键词。
- 优秀示例文案。
- 禁用表达。
- 竞对与定位信息。

这是 Finfold 的核心竞争壁垒。用户保存的品牌信息越完整，后续的生成和 Agent 建议就越贴近这个产品，而不是泛泛的 AI 模板文案。

### 品牌规则

品牌规则是更严格的质量控制层：

- 禁用词和禁用表达。
- 语气和 CTA 约束。
- 不同平台的表达规则。
- 安全和审核提示。

这些规则会进入生成和评分流程，让输出更贴近真实品牌，而不是普通 AI 模板文案。

### AI 助手

Finfold 的 AI 助手由 Letta 支持。用户可以直接问：

- 下一步应该为哪个平台创作？
- 如何复用品牌记忆？
- 哪些内容缺口最重要？
- 如何把一条产品更新变成清晰的创作 brief？

Letta 负责 Agent 记忆和模型编排。Finfold 在后端保存每个用户和 Letta Agent 的映射，并通过 API 路由处理对话和结构化生成请求。

### 内容库

内容库目前保持简单，只展示已经保存的历史内容。这样用户可以回顾过去生成了什么，但不会被多人审核、排期、审批等信息干扰。

### 订阅

订阅页支持付费套餐、额度展示和订阅状态。支付和订阅 Webhook 由 Creem 处理。

## 架构

Finfold 是一个面向 Cloudflare Pages 部署的 Next.js 应用。

```text
用户界面
  Next.js App Router + React + Tailwind

后端接口
  运行在 Edge runtime 上的 Next.js route handlers

数据层
  Supabase Auth、Postgres、Row Level Security、用户资料

AI 层
  Letta 用户 Agent，负责记忆和模型编排
  可选 OpenAI-compatible 直连后备，用于本地或多用途生成

支付层
  Creem Checkout、订阅 Webhook、套餐额度、权益检查

部署
  Cloudflare Pages + @cloudflare/next-on-pages + Wrangler
```

## 主要页面

| 路由 | 作用 |
| --- | --- |
| `/dashboard` | 仪表盘，查看增长概览和下一步动作 |
| `/workbench` | 创作台，生成平台内容 |
| `/packages` | 内容库，查看历史内容 |
| `/brand-memory` | 品牌记忆，保存产品和语气上下文 |
| `/guardrails` | 品牌规则，维护禁用词和表达规范 |
| `/agents` | AI 助手，基于 Letta 的对话入口 |
| `/billing` | 订阅，查看套餐、额度和支付 |
| `/settings` | 设置，管理账号、语言、头像和偏好 |

## API

| API 路由 | 作用 |
| --- | --- |
| `/api/generate` | 登录用户生成内容，并检查额度 |
| `/api/trial/generate` | 试用生成流程 |
| `/api/kits` | 读取保存过的内容 |
| `/api/brand-brain` | 读取和保存品牌记忆 |
| `/api/letta/agent` | 获取、创建或重置用户的 Letta Agent |
| `/api/letta/chat` | 与用户自己的 Letta Agent 对话 |
| `/api/checkout` | 创建 Creem Checkout |
| `/api/webhooks/creem` | 处理 Creem 订阅的生命周期事件 |
| `/api/entitlements/check` | 检查当前套餐和额度 |
| `/api/settings/locale` | 保存语言偏好 |

## 数据模型

Supabase schema 包含：

- `profiles` - 用户资料、套餐、月额度、语言和订阅信息。
- `content_kits` - 内容包的来源 brief 和元数据。
- `kit_outputs` - 每个平台对应的生成结果。
- `brand_brains` - 品牌记忆。
- `subscriptions` - Creem 订阅状态。
- `usage_events` - 生成和使用事件。
- `performance_metrics` - 为后续内容表现分析预留的数据表。
- `user_agents` - Supabase 用户和 Letta Agent 的映射。

项目开启了 Row Level Security，用户只能访问自己的数据。Service role key 只在后端 API 路由中使用，不暴露给浏览器。

## 技术栈

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

## 环境变量

从 `.env.example` 创建本地环境文件：

```bash
cp .env.example .env.local
```

完整线上体验需要配置：

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | 应用公开访问地址 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | 只用于服务端的 Supabase service role key |
| `LETTA_API_URL` | Letta API 地址，通常是 `https://api.letta.com` |
| `LETTA_API_KEY` | 只用于服务端的 Letta API key |
| `LETTA_MODEL` | Letta Agent 使用的模型 |
| `LETTA_EMBEDDING` | Letta 使用的 embedding 模型 |
| `CREEM_API_KEY` | Creem API key |
| `CREEM_WEBHOOK_SECRET` | Creem Webhook 校验密钥 |
| `CREEM_*_PRODUCT_ID` | 付费套餐在 Creem 中的产品 ID |
| `NEXT_PUBLIC_ALLOW_MOCK` | 生产环境保持为 `false` |

可选的直连模型后备：

| 变量 | 说明 |
| --- | --- |
| `LLM_API_BASE` | OpenAI-compatible chat completions 接口 |
| `LLM_API_KEY` | 只用于服务端的模型 API key |
| `LLM_MODEL` | 直连后备模型名称 |

生产环境推荐使用 Letta。直连模型变量只用于 Letta 不可用时的后备生成路径。

## 本地开发

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

打开：

```text
http://localhost:3000
```

配置 Supabase：

1. 创建 Supabase 项目。
2. 在 Supabase SQL Editor 中运行 `supabase/schema.sql`。
3. 如果是已有数据库升级，按顺序应用 `supabase/migrations` 里的迁移。
4. 把 Supabase URL、publishable key、service role key 填入 `.env.local`。

配置 Letta：

1. 创建 Letta API key。
2. 配置 `LETTA_API_KEY`、`LETTA_API_URL`、`LETTA_MODEL`、`LETTA_EMBEDDING`。
3. 登录 Finfold 后打开 `/agents`，或从 `/workbench` 生成内容。
4. Finfold 会自动为用户创建或复用对应的 Letta Agent。

## 验证

```bash
npm run typecheck
npm test
npm run build
```

生成 Cloudflare Pages 输出：

```bash
npm run build:cf
```

## Cloudflare Pages 部署

Finfold 使用 `next-on-pages` 适配 Cloudflare Pages。

推荐构建设置：

| 设置 | 值 |
| --- | --- |
| Build command | `npm run build:cf` |
| Output directory | `.vercel/output/static` |
| Root directory | `/` |

仓库中的 `wrangler.toml` 已包含：

```toml
pages_build_output_dir = ".vercel/output/static"
compatibility_flags = ["nodejs_compat"]
```

本地预览：

```bash
npm run preview
```

使用 Wrangler 部署：

```bash
npm run deploy
```

## 产品原则

- 首次使用必须简单。
- 品牌记忆是长期壁垒。
- 不生成空泛的 AI 套话。
- 生成结果必须可编辑、可检查。
- 配置失败时明确提示，不用假内容伪装成功。
- 先做好个人创作者流程，再扩展多人协作。

## 仓库说明

这是一个产品原型和参赛项目，展示从 AI 内容生成到 SaaS 基础设施的完整路径，包含登录、数据持久化、支付、Agent 记忆、部署和验证。

## License

本项目目前作为原型和参赛项目提供。如需生产使用或商业分发，请另行补充正式 License。
