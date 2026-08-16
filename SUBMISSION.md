# GOAI Submission Guide · 参赛提交说明

**Project / 作品名**: Finfold — Your First AI Marketing Employee
**Track / 赛道**: 无界应用 Boundless Agents（细分场景：面向独立开发者与精简团队的跨境内容增长智能体）
**Live Demo**: <https://www.finfold.app>
**Repo / 代码仓库**: <https://github.com/joeymilano/Finfold>

## Materials Index · 提交材料索引

| Material | Where |
| --- | --- |
| 作品简介 (≤500 字) | 提交表单在线填写（见附件 zip 同版） |
| 方案 PPT / PDF | 见作品附件 zip |
| 在线 Demo | <https://www.finfold.app>（注册即可体验 Workbench 生成闭环） |
| 代码仓库 | 本仓库（MIT License，含本地运行说明） |
| Demo / 自测视频 | 按赛段要求在提交表单单独上传（MP4） |

## What Reviewers Can Verify · 评审可验证项

1. **任务闭环**：注册 → Workbench 输入一条产品更新 → 选择平台 → 生成平台原生草稿 → 品牌评分与编辑 → 导出/发布状态追踪。
2. **品牌记忆**：Brand Memory 保存定位/受众/语气/禁用词后，重新生成可见输出差异。
3. **Agent 能力**：内置 AI Agent 可对话决定"下一步创作什么"，并复用品牌上下文。
4. **工程可复现**：本仓库 `README.md` 提供本地运行步骤（仅需一个 LLM API Key）。

## Open-Source Boundary · 开源边界

- 本仓库为参赛公开版（MIT）：应用层 UI、平台适配层、品牌记忆模型、API 契约与测试。
- 生产环境数据库全量迁移、内部运营与支付工具、未发布特性保留在私有仓库。
- 使用商业 LLM API（经 provider-agnostic 接口层调用），密钥全部经环境变量注入，运行本仓库不依赖任何专有模型权重。

## Contact · 联系方式

- GitHub Issues: <https://github.com/joeymilano/Finfold/issues>
- Email: goai@goaihz.com 转交或经 GitHub 联系维护者
