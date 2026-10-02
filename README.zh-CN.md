# Finfold

[English README](./README.md)

[![CI](https://github.com/joeymilano/finfold/actions/workflows/ci.yml/badge.svg)](https://github.com/joeymilano/finfold/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](./LICENSE)

Finfold 是一个面向创始人、独立开发者和小型增长团队的 AI 增长运营员工：它盯住整个增长循环——发现内容机会、准备各平台的发布稿、通过 Chrome 扩展在评论区替你回复，并把每一步动作实际带来的点击、线索、注册和收入记录下来。

传统做法是把同一条产品信息反复改写、发布到各个平台，然后让结果散落在各处的表格里。Finfold 把这件事变成一个清晰流程：保存品牌记忆，设置品牌规则，让 Agent 发现机会并起草增长任务，在创作台生成内容，经你确认后执行，再回收每一步的结果。

本仓库包含完整产品：Next.js 主应用、Chrome 扩展（[`apps/chrome-extension`](./apps/chrome-extension)）、微信小程序（[`apps/weapp`](./apps/weapp)）、WorkBuddy 技能包（[`apps/workbuddy-skill`](./apps/workbuddy-skill)）以及 Supabase schema（125 个按序迁移）。所有第三方凭证一律通过环境变量注入——仓库里没有任何 API key。

## 当前产品范围

Finfold 现在聚焦个人创作者和小团队的一条"运营员工式"增长循环：

1. 在仪表盘和运营目标里查看关键增长信号。
2. 保存品牌记忆和品牌规则。
3. 让 Agent 发现机会、起草增长任务并交给你审核。
4. 在创作台生成多平台内容草稿，用 Chrome 扩展完成发布与回评。
5. 通过追踪链接、原生留资和结果 Webhook 记录转化。
6. 在内容库回顾历史内容与结果。
7. 在订阅页管理额度和计划。

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

Finfold 是一个通过 OpenNext 适配器部署到 Cloudflare Workers 的 Next.js
应用。

```text
用户界面
  Next.js App Router + React + Tailwind

后端接口
  运行在 Workers Node.js 兼容运行时上的 Next.js route handlers

数据层
  Supabase Auth、Postgres、Row Level Security、用户资料

AI 层
  Letta 用户 Agent，负责记忆和模型编排
  可选 OpenAI-compatible 直连后备，用于本地或多用途生成

支付层
  Creem Checkout、订阅 Webhook、套餐额度、权益检查

部署
  Cloudflare Workers + @opennextjs/cloudflare + Wrangler
```

## 主要页面

| 路由 | 作用 |
| --- | --- |
| `/dashboard` | Finfold Agent 工作区，通过对话调用运营能力 |
| `/workbench` | 创作台，生成平台内容 |
| `/operations/opportunities` | 机会雷达：带动量分的内容机会流 |
| `/operations/x-pipeline` | X（Twitter）审核-发布流水线 |
| `/operations/daily-pipeline` | 日更长文与分享卡组流水线 |
| `/operations/xiaohongshu` | 小红书账号诊断与发帖陪跑 |
| `/operations/account-health` | 跨平台账号体检 |
| `/operations/lead-tools` | 原生留资工具 |
| `/packages` | 内容库，查看历史内容 |
| `/brand-memory` | 品牌记忆，保存产品和语气上下文 |
| `/guardrails` | 品牌规则，维护禁用词和表达规范 |
| `/agents` | 兼容旧链接，跳转至 Finfold Agent 工作区 |
| `/billing` | 订阅，查看套餐、额度和支付 |
| `/settings` | 设置，管理账号、语言、本地设备和偏好 |

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
| `/api/integrations/missionget/v1/chat/completions` | MissionGet 专用的 HMAC 验签、无状态 Chat Completions Webhook |
| `/api/weapp/v1/*` | 微信小程序 API：会话、画像、机会、成稿（共享密钥桥接） |

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
- Cloudflare Workers（经 OpenNext 适配）
- Wrangler

## 环境变量

从 `.env.example` 创建本地环境文件：

```bash
cp .env.example .env.local
```

本地最小可跑集（其余变量全部可选，未配置时对应功能直接关闭，不会用假数据伪装）：

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | 只用于服务端的 Supabase service role key |
| `LETTA_API_KEY` 或 `LLM_API_KEY` | 至少配置一个生成供应商 |

完整线上体验需要配置：

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | 应用公开访问地址 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | 只用于服务端的 Supabase service role key |
| `WECHAT_COMPONENT_ENABLED` | 是否启用已获批的微信开放平台第三方组件；票据回调与凭证就绪前保持 `false` |
| `WECHAT_DRAFT_PUBLISHING_ENABLED` | 是否启用后台图片上传与草稿同步；迁移 096 和真实授权账号草稿测试通过前保持 `false` |
| `WECHAT_FORMAL_PUBLISHING_ENABLED` | 是否启用单次确认后的定时正式提交；草稿、回调、固定 IP 出口与单账号灰度全通过前保持 `false` |
| `WECHAT_COMPONENT_APP_ID` / `WECHAT_COMPONENT_APP_SECRET` | 只用于服务端的微信第三方平台组件凭证 |
| `WECHAT_COMPONENT_TOKEN` / `WECHAT_COMPONENT_ENCODING_AES_KEY` | 微信组件回调验签与加密事件解密凭证，仅服务端使用 |
| `MISSIONGET_WEBHOOK_SECRET` | MissionGet Webhook 原始请求体的服务端 HMAC 密钥，至少 32 个字符 |
| `MISSIONGET_PARTNER_USER_ID` | 只用于 MissionGet 创作点数结算的独立合作方账号 UUID |
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
| `LLM_VISION_MODEL` | OCR 与截图诊断使用的多模态后备模型 |
| `DASHSCOPE_FREE_API_KEY` | 优先走通用北京端点、抵扣各模型免费额度的服务端 Key |
| `DASHSCOPE_API_KEY` | 免费池停止后使用的业务空间/Token Plan Key，同时供 Wan 2.7 使用 |
| `IMAGE_DASHSCOPE_FREE_API_BASE` | Qwen Image 3.0 免费池使用的通用端点 |
| `IMAGE_DASHSCOPE_API_BASE` | Wan 图片生成使用的百炼业务空间专属域名 |
| `IMAGE_DASHSCOPE_MODEL` | Wan 图片模型；生产默认使用滚动别名 `wan2.7-image` |
| `MISSIONGET_MODEL_TIER` | 可选的 MissionGet 模型档位：`haiku`（默认）、`sonnet` 或 `opus` |

生产环境按 `LLM_PROVIDERS` 顺序先消耗通用端点的独立免费池，再进入已购业务空间与跨厂商后备；Letta 在支持的生成路径中保留为最终后备。

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
2. 按顺序（000、001、002、003……）在 Supabase SQL Editor 中运行 `supabase/migrations` 里的每一个文件。迁移 000 提供新项目的核心 schema。请严格按文件名顺序执行、不要跳过——后续迁移建立在前面迁移之上。
3. 把 Supabase URL、publishable key、service role key 填入 `.env.local`。

配置 Letta：

1. 创建 Letta API key。
2. 配置 `LETTA_API_KEY`、`LETTA_API_URL`、`LETTA_MODEL`、`LETTA_EMBEDDING`。
3. 登录 Finfold 后打开 `/dashboard`，直接通过 Agent 对话诊断、调研和生成内容。
4. Finfold 会自动为用户创建或复用对应的 Letta Agent。

## 验证

```bash
npm run typecheck
npm test
npm run build
```

生成 Cloudflare Workers 输出：

```bash
npm run build:cf
```

## Cloudflare Workers 部署

Finfold 使用 Cloudflare 当前支持的 OpenNext 适配器部署到 Workers。

推荐构建设置：

| 设置 | 值 |
| --- | --- |
| Build command | `npm run build:cf` |
| Deploy command | `npm run deploy` |
| Worker entry | `.open-next/worker.js` |

仓库中的 `wrangler.toml` 已包含：

```toml
main = ".open-next/worker.js"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".open-next/assets"
binding = "ASSETS"
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

本仓库包含 Finfold 的完整产品源码：Next.js 主应用、Chrome 扩展（`apps/chrome-extension`）、微信小程序（`apps/weapp`）、WorkBuddy 技能包（`apps/workbuddy-skill`）以及 Supabase schema。所有第三方凭证（Supabase、Letta、各家模型、Creem、Resend、微信、Turnstile 等）一律通过环境变量或 Worker Secrets 注入；仓库里没有任何 API key，配置缺失时明确报错，绝不生成假结果。

一个例外：本地设备桥接的 Mac 客户端 Finfold Local 暂未开源。`supabase/functions/local-bridge` 里的服务端协议（任务认领、幂等回传、心跳、超时自愈）和设置页 UI 作为协议参考实现包含在本仓库中。

## License

本项目以 [Apache License 2.0](./LICENSE) 开源。Copyright 2026 Finfold（上海光有序科技有限公司）。
