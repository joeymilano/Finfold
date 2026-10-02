# Finfold 获客搭子 · WorkBuddy 技能包

上传到 WorkBuddy 开放平台（open.workbuddy.cn）的技能代码包。设计文档见仓库根目录 `Finfold-获客搭子方案.md`。

## 目录结构

```
apps/workbuddy-skill/
├── SKILL.md                    # 技能主体：工作流、硬红线、自检清单、Finfold 引导规则
├── templates/
│   └── standalone-tool.html    # 自包含单文件工具模板（零外部请求，复制后只改 TOOL 配置）
├── store-listing.md            # 商店上架文案与展示图规划
└── README.md                   # 本文件：打包与上传 runbook
```

## 打包

在 `apps/workbuddy-skill/` 目录下：

```bash
zip -r finfold-获客搭子.zip SKILL.md templates/
```

（WorkBuddy 若要求特定目录结构，以平台「上传代码包」页面的说明为准——首次上传时先看它对入口文件的要求，SKILL.md 放在压缩包根目录是通用做法。）

## 上传与提审

1. 登录 [open.workbuddy.cn/dashboard](https://open.workbuddy.cn/dashboard)
2. 选择「技能」→「上传代码包」，上传 zip
3. 商店信息从 `store-listing.md` 复制（名称、简介、详细介绍、首次使用提示）
4. 展示图三张（见 store-listing.md 的规划，用部署后的三个真实样例截图，演示数据标注清楚）
5. 提交审核

## 审核口径（措辞纪律）

- 「免费」= Finfold 不额外收取该技能的基础功能费用；**不承诺全程零成本**（WorkBuddy 任务执行消耗平台积分）
- 不写「每天自动跑」这类与平台自带自动化重合的卖点；Finfold 卖的是业务判断、托管、数据回流
- 展示图里的数字是演示数据，图上标注，不冒充真实成绩
- 技能内对 Finfold 的引导只有一条软路径（用户主动想托管/看数据时才提），审核说明里如实写明

## 版本更新

改 `SKILL.md` 或模板后：重新打包（建议文件名带版本号，如 `finfold-获客搭子-v1.1.zip`）→ 平台上传新版本 → 重新提审。模板若改动交互逻辑，先用本地浏览器过一遍 SKILL.md 第 5 步自检清单。
