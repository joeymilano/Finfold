# 贡献指南 / Contributing Guide

感谢你考虑为 Finfold 贡献代码。本项目是一个完整的 AI 增长运营产品（Next.js 主应用 + Chrome 扩展 + 微信小程序），贡献前请先读完本文件。

## 开发环境

```bash
npm install
cp .env.example .env.local   # 填入你自己的 Supabase 与模型凭证
npm run dev
```

最小可跑集：`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` + 任一生成供应商 key（`LETTA_API_KEY` 或 `LLM_API_KEY`）。其余功能未配置凭证时自动关闭，不会用假数据伪装成功。

数据库：按文件名顺序执行 `supabase/migrations/` 下的全部 SQL（从 000 开始，不要跳号）。

## 提交前必须通过的门禁

```bash
npm run ci:verify
```

等价于：图标检查 + lint + 类型检查 + 全量测试 + 成本检查 + Cloudflare 构建 + Worker 体积检查 + 依赖审计。CI（GitHub Actions）对每个 PR 和 push 运行同一套门禁，并做全历史密钥扫描（gitleaks）。

子项目有自己的检查：

```bash
npm run extension:verify   # Chrome 扩展测试 + 打包审计
cd apps/weapp && npm run typecheck   # 小程序类型检查
```

## 代码约定

- **绝不提交任何真实凭证。** 所有 key 通过环境变量或 Worker Secrets 注入；示例文件（`.env.example`）里只允许空值或 `REPLACE_WITH` 占位。
- TypeScript strict；测试用 Vitest（`test/`），端到端用 Playwright（`e2e/`）。
- 配置缺失时明确报错（fail-closed），不用模板或假数据兜底——这是产品原则，也是代码约定。
- UI 文案保持中英双语同步；不暴露内部模型代号，对用户用中性话术（如"自动审核""内容质检"）。
- 迁移文件按 `NNN_描述.sql` 递增编号，只加不改（已发布的迁移不回改）。

## PR 流程

1. Fork 并从 `main` 拉分支：`feat/xxx` 或 `fix/xxx`。
2. 本地跑通 `npm run ci:verify`。
3. 提交 PR，描述清楚改了什么、为什么、怎么验证的。
4. CI 全绿后维护者评审合并。

## 安全问题

请勿通过 issue 报告安全漏洞，见 [SECURITY.md](./.github/SECURITY.md)。

## License

提交即表示你同意贡献以 [Apache-2.0](./LICENSE) 授权。
