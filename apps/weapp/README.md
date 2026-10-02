# Finfold 微信小程序「增长搭子」

Finfold 的微信小程序客户端。核心闭环：**AI 挑选题（机会雷达）→ 人拍板 → AI 成稿（带 AI 标识）→ 分享回流**。

- 小程序端：`miniprogram/`（原生 TypeScript）
- 云函数：`cloudfunctions/bridge`（小程序与 Finfold 服务端的唯一通道，无需自备已备案域名）
- 服务端 API：主仓 `app/api/weapp/v1/*` + `lib/weapp/` + 迁移 `supabase/migrations/123_weapp.sql`

## 从零部署（按序执行）

### 1. 注册小程序

1. 到 [mp.weixin.qq.com](https://mp.weixin.qq.com) 注册一个小程序（个人或企业主体均可）。
2. 类目建议选**工具 > 效率**（避开资讯/内容类目资质要求）。
3. 把 AppID 填进 `project.config.json` 的 `appid` 字段（替换 `touristappid`）。

### 2. 开通云开发 + 部署 bridge 云函数

1. 微信开发者工具打开本目录（`apps/weapp/`）→ 开通**云开发**。
2. 记下环境 ID，填进 `miniprogram/utils/config.ts` 的 `CLOUD_ENV`。
3. 云开发控制台 → 云函数 → 新建 `bridge`：上传 `cloudfunctions/bridge/` 目录（工具里右键"上传并部署：云端安装依赖"）。
4. bridge 云函数环境变量配置：
   - `FINFOLD_API_BASE` = 你部署的 Finfold 站点地址（如 `https://your-domain.com`）
   - `WEAPP_BRIDGE_SECRET` = `openssl rand -hex 32` 生成的值（与第 3 步 Finfold 侧一致）
   - 云函数超时设为 60 秒（`config.json` 已带）。
5. 权限：云函数默认仅本小程序可调；云存储权限保持"仅创建者可读写"。

### 3. Finfold 服务端

1. 应用迁移：Supabase Dashboard → SQL Editor 执行 `supabase/migrations/123_weapp.sql`。
2. 生成密钥：`openssl rand -hex 32`，与 bridge 侧同一个值：
   - 本地：`.env` 里 `WEAPP_BRIDGE_SECRET=...`
   - 生产：`npx wrangler secret put WEAPP_BRIDGE_SECRET`（然后重新 deploy 主站）
3. 部署主站（`npm run deploy`）。

### 4. 本地开发与联调

```bash
cd apps/weapp
npm install
npm run typecheck      # TS 类型检查（开发者工具经 useCompilerPlugins 直接编译 TS，无需产出 JS）
```

微信开发者工具导入 `apps/weapp/` 目录 → 编译 → 预览。数据链路：雷达页首次会引导填业务画像 → 匹配分即刻生效。

### 5. 提审前自查清单

- [ ] `utils/config.ts` 的 CLOUD_ENV 已填，bridge 已部署且环境变量齐全
- [ ] 所有 AI 生成内容带「AI 生成」标识（成稿页已有，改动时保留）
- [ ] 用户隐私保护指引：mp 后台 → 设置 → 服务内容声明 → 收集信息勾选（用户输入、设备信息）
- [ ] `project.config.json` appid 正确、`setting` 无 debug 残留
- [ ] 体验版全链路走通：登录 → 画像 → 雷达 → 成稿 → 复制 → 分享卡

## 微信 AI 生态接入（SKILL 分包）

`miniprogram/skills/agent/`（独立分包）：`SKILL.md` + `mcp.json` 声明了三个原子接口（今日机会 / 机会详情 / 生成草稿），微信 AI 经云函数 `bridge`（op=`skillCall`，服务端自动换会话）调用；`AGENTS.md` 为全局提示词；`receiver` 页承接 AI 会话接力跳转。

⚠️ 小程序 AI 开发模式仍在快速迭代，接入前请在开发者工具里按[官方接入文档](https://developers.weixin.qq.com/miniprogram/dev/ai/integration.html)核对字段名与注册方式；若不需要该能力，删除 `skills/agent` 分包 + `app.json` 里的 `subpackages` 段即可，不影响主功能。

## 架构备忘

```
小程序 ─wx.cloud.callFunction→ bridge 云函数 ─HTTPS+Bearer→ Finfold /api/weapp/v1/*
                                    │                        ├─ session：openid 自动开户（Supabase 用户）+ 200 credits 赠礼
                                    │                        ├─ me：画像写 brand_brains + operating_programs（雷达打分同一套输入）
                                    │                        ├─ opportunities：复用 loadOpportunityRadar（zh 本地化）
                                    │                        └─ drafts：reserve→after()生成→轮询，失败必退款
```

计费：复用主站 ACTION_CREDITS（单平台成稿 3 点），注册赠 200 点，主站充值兜底。
