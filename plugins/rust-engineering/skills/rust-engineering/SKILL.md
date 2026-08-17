---
name: rust-engineering
description: Orchestrates Rust engineering and protects Cargo.lock with lightweight rustfmt checks.
version: 0.1.0
---
# Rust Engineering

## Scope

Cargo、ownership、错误处理、API 设计、async/concurrency、unsafe 与测试。本 Skill 负责开放式领域工作；Hook 只负责 lockfile、依赖目录和轻量语法/配置校验。

## Workflow

1. 从仓库声明、目录和工具链识别项目类型、版本、模块边界和现有命令。
2. 明确目标、兼容范围和最小验证面，保留项目已有架构和工具约定。
3. 路由社区 Skill：Rust 实现、审查、unsafe、并发、性能和 API 设计使用 `rust-skills`，只加载相关规则。
4. 只修改权威声明或源码；不得直接编辑受保护 lockfile、依赖目录或生成输出。
5. 先运行最接近的检查，再运行项目声明的测试、构建或静态分析；Hook 通过不等于任务完成。
6. 报告改动、验证、未覆盖环境和恢复路径。

## 必需社区 Skill

- `rust-skills` — https://github.com/leonardomso/rust-skills

这些 Skill 是强依赖。进入对应路线前确认 Skill 可读；若缺失或不可读，停止受影响路线并报告恢复方式，不凭模型记忆模仿其内容。

## Hook 配置

可选配置 `.rust-engineering.mjs` 支持 `rules`、`checks`、`limits.maxFiles`、`limits.timeoutMs` 和 `missingTools`。

## Anti-patterns

- 把 Hook 激活当成构建、测试、签名、设备或集群结果证据。
- 直接修改 lockfile、依赖目录或生成文件。
- 未识别版本与项目约定就套用最新模板。
- 必需社区 Skill 不可读时继续伪装执行。
