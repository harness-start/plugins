---
name: android-engineering
description: Orchestrates Android engineering and guards Gradle-owned dependency state with lightweight Android configuration checks.
version: 0.1.0
---
# Android Engineering

## Scope

Kotlin/Java Android、Gradle/AGP、Jetpack Compose、测试、R8 与 Android 资源配置。本 Skill 负责开放式领域工作；Hook 只负责 lockfile、依赖目录和轻量语法/配置校验。

## Workflow

1. 从仓库声明、目录和工具链识别项目类型、版本、模块边界和现有命令。
2. 明确目标、兼容范围和最小验证面，保留项目已有架构和工具约定。
3. 路由本插件 Skill：Compose 使用 `android-compose`；测试基础设施使用 `android-testing`；R8/缩减问题使用 `android-r8`。只加载当前任务需要的 references。
4. 只修改权威声明或源码；不得直接编辑受保护 lockfile、依赖目录或生成输出。
5. 先运行最接近的检查，再运行项目声明的测试、构建或静态分析；Hook 通过不等于任务完成。
6. 报告改动、验证、未覆盖环境和恢复路径。

## 本插件业务 Skill

- `android-compose` — Jetpack Compose 状态、副作用、性能与导航
- `android-testing` — 测试基础设施
- `android-r8` — R8/缩减诊断

按任务加载对应 Skill 及其 references，不要一次读完。

## Hook 配置

可选配置 `.android-engineering.mjs` 支持 `rules`、`checks`、`limits.maxFiles`、`limits.timeoutMs` 和 `missingTools`。

## Anti-patterns

- 把 Hook 激活当成构建、测试、签名、设备或集群结果证据。
- 直接修改 lockfile、依赖目录或生成文件。
- 未识别版本与项目约定就套用最新模板。
- 未加载对应业务 Skill 就凭记忆伪装执行。
