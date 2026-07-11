# PR-Agent（AI 审 PR）

> 不依赖 GitHub Copilot / 国内卡充值。模型费用走 DeepSeek。

## 一次配置

1. 打开仓库 **Settings → Secrets and variables → Actions**
2. **New repository secret**
   - Name: `DEEPSEEK_API_KEY`
   - Value: [DeepSeek 控制台](https://platform.deepseek.com) 的 API Key
3. 把 `.github/workflows/pr-agent.yml` 合进默认分支（`main`）
4. 再开一个 PR，等 Actions 跑完；`github-actions` bot 会留 review 评论

`GITHUB_TOKEN` 不用手建，Actions 自带。

## 日常用法

| 时机 | 行为 |
|------|------|
| PR opened / reopened / ready_for_review / **synchronize（推送）** | 自动 `/review` + `/describe` |
| PR 评论里打 `/improve` | 要改建议时再开（默认自动 improve 关着，少噪音） |
| `/ask 这段 retry 冻结逻辑对不对？` | 针对问题追问 |

> 注意：PR-Agent **默认会跳过** `synchronize`。本仓库 workflow 已显式打开；若只看到 Actions 绿勾、PR 无评论，先看日志是否有 `Skipping action: synchronize`。

## Security gate（只卡 label）

PR-Agent 跑完本身总是成功。评论里的 focus areas / 安全建议 = **建议**，不红。

本仓库 gate **只**在出现 label `possible security issue` 时 fail。

| 信号 | 行为 |
|------|------|
| `possible security issue` | check 红；人手删 label 可放行（PR 时间线会留下记录） |
| `Review effort x/5` | 仅提示，不卡 |
| 评论里的 findings / Security concerns 文案 | 仅建议，不卡 |

打标门槛写在 `.pr_agent.toml` + workflow `extra_instructions`：只标**高置信、本 PR 新引入、可利用**的库代码问题（路径遍历、原型链污染、类型守卫绕过、未捕获 rejection、ReDoS）。缺测试 / 代码风格 / 猜测性防御**不当安全问题**。

要把这个 check 变成合入硬门槛：Settings → Branches → require status check `PR Agent review`。

> `.pr_agent.toml` 默认从 **default branch** 读取；合进 `main` 后才对后续 PR 稳定生效。当前 workflow 里的同款 `extra_instructions` 保证功能分支 PR 也能立刻用上。

## 注意

- 吃的是 **GitHub Actions 分钟**（私有库免费档有额度）+ **DeepSeek token**，不是 Copilot credits
- Fork 来的外部 PR 默认拿不到 secrets；内部协作够用
- 审稿质量 ≠ 人工审查；类型推断 / 架构设计仍以人工 review 为准
