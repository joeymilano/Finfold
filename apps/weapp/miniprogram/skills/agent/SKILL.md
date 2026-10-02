# 机会雷达（增长搭子核心能力）

帮内容创作者发现今天值得追的选题机会：AI 持续扫描全网趋势信号，与用户的业务画像做匹配打分，输出「为什么是现在 / 为什么和你有关 / 从什么角度切入」。

## 什么时候用这个 Skill

- 用户问「今天发什么」「最近有什么热点值得写」
- 用户描述自己的业务后想找内容选题
- 用户想了解某个趋势和自己业务的关系

## 原子接口

所有接口经云函数 `bridge`（op=`skillCall`）访问，无需用户手动登录。

### get_today_opportunities

获取当前用户的机会列表。

- 参数：`window`（可选，"4h" | "24h" | "7d"，默认 "24h"）
- 对应请求：`GET /api/weapp/v1/opportunities?window=<window>&limit=5`
- 返回：机会数组（id、title、whyNow、whyYou、matchScore 0-100、lifecycle、recommendedPlatform、mainAngle）

### get_opportunity_detail

- 参数：`id`（机会 UUID）
- 对应请求：`GET /api/weapp/v1/opportunities/<id>`
- 返回：完整机会详情，含 evidence 数组（原文证据链接）

### generate_platform_draft

为某条机会或自由选题生成单平台草稿。**消耗 3 点用户额度，调用前必须告知用户。**

- 参数：`source`（"opportunity" | "free"）、`opportunityId`（可选）、`platform`（"wechat" | "xiaohongshu" | "moments"）、`topic`（{ title, fact?, angle? }）
- 对应请求：`POST /api/weapp/v1/drafts`
- 返回：draftId + status "pending"，草稿生成是异步的，用 `GET /api/weapp/v1/drafts/<draftId>` 轮询直到 ready/failed

## 接力到页面

- 机会详情：`pages/radar/detail?id=<机会ID>`（半屏或全屏打开）
- 今日机会流：`pages/radar/index`
