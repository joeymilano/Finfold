# Finfold 国内站部署与 ICP 备案 Runbook（www.finfold.cn）

> 目标：把 Finfold 以自部署形态跑在腾讯云大陆服务器上，服务国内用户，
> 并完成 finfold.cn 的 ICP 备案。全球站 www.finfold.app（Cloudflare）
> 完全不受影响，两站共用同一个 Supabase 项目与数据库。

## 0. 架构总览

```
国内用户 ──► DNSPod 解析 www.finfold.cn ──► 腾讯云服务器（大陆地域）
                                              ├─ nginx :443（TLS）
                                              ├─ finfold-web.service    → next start :3000
                                              └─ finfold-scheduler.service（scripts/cn/scheduler.mjs）
                                                    ├─ 轮询 Supabase outbox，执行生成任务
                                                    └─ 按 UTC cron 调内部路由（对齐 CF Worker 行为）

Supabase（海外，两站共用）── 认证 / 业务数据 / 存储
LLM 主链路（Qwen / DeepSeek / GLM）本就在国内，直连无障碍
```

**关键设计**：Cloudflare Worker 在生产里只做两件事——队列消费者和定时
回调，全部通过共享密钥调 Next.js 内部 API 路由。国内站用
`scripts/cn/scheduler.mjs` 在本机复刻这两个角色，业务代码零分叉。

与全球站的差异点：

| 事项 | 全球站 (.app/CF) | 国内站 (.cn/自部署) |
| --- | --- | --- |
| 生成队列 | Cloudflare Queue | Supabase outbox + scheduler 轮询 |
| 定时任务 | Worker Cron + watch-poller | scheduler.mjs（UTC 时刻一致） |
| 埋点 | PostHog (us) | 关闭（key 留空） |
| Turnstile | finfold.app widget | 需为 finfold.cn 新建 widget |
| Google 登录 | 可用 | 大陆不可达（邮箱登录不受影响） |
| X OAuth | 已注册回调 | 需在 X 应用补 .cn 回调后可用 |
| 品牌出口 URL | brand.siteUrl=固定值 | 跟随 NEXT_PUBLIC_APP_URL 构建 |

## 1. ICP 备案（先做，周期最长）

ICP 备案只能由你在腾讯云控制台完成，机器无法代办。全程约 1-3 周，
**建议今天就开始**，服务器初始化（第 2 节）可与备案并行。

### 1.1 前置检查

- 域名 finfold.cn 已完成**实名认证**（腾讯云控制台 → 域名注册 → 查看
  实名状态）。.cn 未实名不能解析，备案要求实名主体与备案主体一致：
  个人备案 → 域名实名为本人；企业备案 → 域名实名为企业或法人。
- 准备备案主体材料：
  - 个人：身份证正反面、本人手机号（管局会来电核验）、人脸核验。
  - 企业：营业执照、法人 + 经办人身份证、网站负责人信息。

### 1.2 购买满足备案要求的服务器

备案要求：**中国大陆地域**（不含港澳台）的云服务器或轻量应用服务器，
**包年包月计费且剩余时长 ≥ 3 个月**。按量计费、香港/境外节点不能备案。

建议配置（跑 Next.js + scheduler + nginx 足够）：

- 轻量应用服务器 2C4G，Ubuntu 22.04/24.04，地域选离目标用户近的
  （如广州/上海/北京）。系统盘默认即可。
- 购买后在控制台生成**备案服务码**：轻量服务器详情页 → 「备案」→
  生成备案码（一台服务器只有一个码，只能备案一个主体）。

### 1.3 提交备案

入口：[console.cloud.tencent.com/beian](https://console.cloud.tencent.com/beian)
（或微信小程序「腾讯云网站备案」）。

流程：验证备案码 → 填主体信息 → 填网站信息 → 电子签核验单 +
人脸核验 → 腾讯云初审（1-2 个工作日，可能电话回访要求修改）→
工信部短信核验（负责人手机收验证码，**收到后 24h 内**在工信部系统完成
验证，超时作废重来）→ 管局终审（多数省份 1-2 周）。

网站信息填写建议（降低退回概率）：

- 网站名称：个人备案避免「平台 / 中心 / 官网 / 集团」等企业化字样，
  建议「一鱼多吃内容工作台」这类工具型名称；企业备案可用品牌名。
- 网站内容：选「软件技术服务」或「其他」。
- 前置审批：不涉及（非新闻/出版/医疗/教育等类目）。
- 备案期间 finfold.cn **不做任何解析**（管局会核查域名，未备案域名
  不得在大陆可访问）。全球站 .app 不受影响。

### 1.4 合规提示（读一遍再继续）

- 非经营性备案不得开展经营性互联网服务。Finfold 现阶段的国内支付是
  支付宝经营码半人工确认（wrangler.toml 已注明 transitional），该形态
  通常 tolerated；若后续接入自动化的微信/支付宝商户支付并对国内用户
  售卖套餐，严格来说需要**经营性 ICP 许可证**（增值电信业务许可，
  一般需企业主体，多走代办）。到那一步前建议先咨询管局或代办机构。
- 备案通过后 **30 日内**做公安备案：[beian.mps.gov.cn](https://beian.mps.gov.cn)
  注册 → 联网备案登记 → 提交主体与网站信息。通过后把公安备案号填进
  `.env.cn` 的 `NEXT_PUBLIC_GONGAN_BEIAN_NUMBER`（部分省份强制展示）。

### 1.5 备案通过后

把备案号（形如 `京ICP备2026XXXXXX号-1`）填入 `.env.cn` 的
`NEXT_PUBLIC_ICP_BEIAN_NUMBER` 并重新构建（NEXT_PUBLIC_ 变量在 build
时固化）。页脚、登录页、控制台侧边栏会自动展示并链接工信部。

## 2. 服务器初始化（可与备案并行；此阶段不解析域名）

以下命令默认 Ubuntu 24.04，以 root 执行。

```bash
# 基础
apt update && apt -y upgrade
apt -y install nginx git curl
# Node 22 LTS（next start 与 scheduler 都用它）
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt -y install nodejs

# 运行账户与目录
adduser --disabled-password --gecos "" finfold
mkdir -p /opt/finfold && chown finfold:finfold /opt/finfold

# 代码（用你的私有 remote；或先 push 到私有仓库）
sudo -u finfold git clone <你的仓库地址> /opt/finfold
cd /opt/finfold && sudo -u finfold npm ci

# 防火墙：仅放行 SSH/HTTP/HTTPS（另在腾讯云安全组放行 22/80/443）
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
```

配置环境：`cp .env.cn.example .env.cn` 后填值。要点：

- `SUPABASE_*`、`INTEGRATION_ENCRYPTION_KEY` 等与 Cloudflare 同名的密钥，
  从你的密码管理器取值——wrangler 无法导出 secret 明文。其中
  **INTEGRATION_ENCRYPTION_KEY 必须与 CF 一致**（数据库里已加密的社媒
  令牌靠它解密）；`GENERATION_WORKER_SECRET` / `CRON_*_SECRET` 只用于
  本机回环，可独立 `openssl rand -hex 32`。
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`：到
  Cloudflare 控制台为 `www.finfold.cn` 新建一个 Turnstile widget（免费），
  用新 widget 的 key（全球站的 widget 域名不含 .cn）。
- PostHog 两个变量留空（关闭埋点）。

首次构建与启动：

```bash
cd /opt/finfold
sudo -u finfold bash -c 'set -a; . ./.env.cn; set +a; npm run build'
cp scripts/cn/finfold-web.service scripts/cn/finfold-scheduler.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now finfold-web finfold-scheduler
```

验证（备案没下来之前，只走本机/隧道，不碰域名）：

```bash
systemctl status finfold-web finfold-scheduler
curl -sI http://127.0.0.1:3000/ | head -1          # 期待 200/307
journalctl -u finfold-scheduler -f                 # 每分钟一条 scheduled_tick
# 本地电脑开隧道看 UI：
ssh -L 3000:127.0.0.1:3000 finfold@<服务器IP>   # 然后浏览器开 localhost:3000
```

在隧道里完整过一遍：注册/登录（邮箱验证码）→ 提交一次多平台生成 →
等 scheduler 执行（journalctl 里看 `generation_job_completed`）→ 内容
包出现。这是上线前的核心验收。

## 3. 上线切换（备案通过后）

### 3.1 DNS 解析（DNSPod）

- `www` A 记录 → 服务器公网 IP。
- `@` 显性 URL 跳转到 `https://www.finfold.cn`（或 CNAME 到 www，nginx
  已配裸域 301）。

### 3.2 TLS 证书

```bash
mkdir -p /var/www/certbot
certbot certonly --webroot -w /var/www/certbot -d www.finfold.cn -d finfold.cn \
  --email <你的邮箱> --agree-tos --no-eff-email
```

（也可用腾讯云免费 DV 证书一年期，下载 nginx 格式放到
`/etc/letsencrypt/live/www.finfold.cn/` 同路径。）

### 3.3 启用站点

```bash
cp scripts/cn/nginx-finfold-cn.conf /etc/nginx/sites-available/finfold-cn.conf
ln -s /etc/nginx/sites-available/finfold-cn.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### 3.4 上线核对清单

- [ ] `https://www.finfold.cn` 首页打开，页脚有 ICP 备案号且链接到
      beian.miit.gov.cn（没有则检查 .env.cn 是否在 build 时已注入）
- [ ] 注册 → 邮箱验证 → 登录 → 控制台
- [ ] 多平台生成全链路（scheduler 日志有 `generation_job_completed`）
- [ ] 支付宝经营码支付路径（/admin/reconcile 对账）
- [ ] 移动端 4G 网络访问（域名解析生效 + 无被墙资源：字体本地、无
      Google Fonts、PostHog 已关）
- [ ] 百度站长平台（ziyuan.baidu.com）添加站点 finfold.cn 并验证，
      拿到 token 后提交：`SITE_URL=https://www.finfold.cn BAIDU_SITE_TOKEN=<token> npm run seo:baidu`
- [ ] 公安备案（ICP 通过后 30 日内，见 1.4）

## 4. 日常运维

**发版**（代码更新）：

```bash
cd /opt/finfold
sudo -u finfold git pull
sudo -u finfold npm ci            # 依赖变更时
sudo -u finfold bash -c 'set -a; . ./.env.cn; set +a; npm run build'
systemctl restart finfold-web
# scripts/cn/ 或 .env.cn 变更时才需要：
systemctl restart finfold-scheduler
```

NEXT_PUBLIC_* / 备案号等任何构建期变量的修改都必须重新 build 才生效。

**日志**：

```bash
journalctl -u finfold-web -f          # Web 访问与服务端日志
journalctl -u finfold-scheduler -f    # 定时任务与生成任务执行
```

**回滚**：`git checkout <上一个 tag/commit>` 后重复发版步骤。

**容量**：生成并发由 `.env.cn` 的 `GENERATION_CONCURRENCY`（默认 3，
CF 生产为 6）控制，观察服务器负载后再调。内存吃紧时调
`finfold-web.service` 的 `MemoryMax`。

**证书续期**：certbot 的 systemd timer 自动续期，无需干预；腾讯云免费
证书一年后需手动换。

## 5. 已知限制与后续项

- **X / LinkedIn OAuth**：回调域名注册的是 finfold.app。要在 .cn 上
  「连接 X」，先在 X 开发者应用里追加 `https://www.finfold.cn/...`
  回调 URL；LinkedIn 未开放就不动。
- **Chrome 插件**：插件当前指向 .app API。国内用户装了插件的，暂时
  继续走全球站；插件支持 .cn 是独立工作项。
- **微信生态**：`WECHAT_COMPONENT_*` 保持关闭；将来开启第三方平台授权
  时，自部署服务器的固定出口 IP 正好满足微信回调白名单的要求。
- **数据面延迟**：Supabase 在海外，国内访问可用但延迟高于本土库；
  登录与查询依赖它。若未来成为瓶颈，再评估迁移（大工程，不建议现在做）。
- **Letta / Workers AI**：在海外。LLM 主链路（Qwen/DeepSeek/GLM）在
  国内不受影响；Letta 只是兜底，Workers AI 只是图像兜底。

## 6. 故障排查

| 症状 | 排查 |
| --- | --- |
| 生成一直排队不执行 | `journalctl -u finfold-scheduler` 看是否在跑、`generation_outbox_query_failed`（Supabase 连不通）还是 `generation_job_invalid_response`（回环 401 → GENERATION_WORKER_SECRET 两进程不一致） |
| 页面能开但登录不了 | Supabase 项目 Auth 的 Redirect URLs 需加入 `https://www.finfold.cn/**`（Supabase 控制台 → Authentication → URL Configuration） |
| Turnstile 一直转 | site key 是不是 finfold.cn 专用 widget、域名是否匹配 |
| 定时任务没跑 | scheduler 日志找 `scheduled_tick`；开关变量（SIGNAL_DISCOVERY_ENABLED 等）在 .env.cn 是否为 true |
| nginx 502 | finfold-web 是否活着：`systemctl status finfold-web`；端口 3000 是否被占用 |
